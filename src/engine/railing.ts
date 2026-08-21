import type { ProjectSettings, Pt, Tier } from '../model/types'
import type { StairsCalc } from './stairs'
import { add, dist, dot, edgeOutwardNormal, lerp, lineIntersect, mul, norm, pointInPolygon, sub, subtractIntervals } from '../geometry/geom'
import { RAILING_SYSTEMS, railSystemById, selectedPostOption, type PostRole } from '../catalog/timbertech'
import { TOP_MOUNT_FACE_INSET_IN } from '../catalog/compat'

export interface RailPiece {
  a: Pt
  b: Pt
  len: number
  edgeIndex: number
  /** stock section size ordered for each equal bay (ft), e.g. [8, 8] for a 14' run cut to 7' bays */
  sectionPlan: number[]
  /** post centers along the edge line — EVENLY spaced (incl. both ends) */
  postPts: Pt[]
  /** role of each post in postPts (end / corner / interior line) */
  postRoles: PostRole[]
  /** drawable rail-centerline endpoints: inset from the deck edge, and at
   *  corners TRIMMED to the intersection with the neighboring run so the rail
   *  terminates AT the corner post instead of overshooting it */
  railA: Pt
  railB: Pt
  /** final post placements along [railA, railB] — evenly spaced, corner-exact */
  posts: PostPlacement[]
}

/** A contiguous railing run: pieces joined at corners (cable runs flow through corners). */
export interface RailChain {
  pieceIdx: number[]
  lenFt: number
  corners: number
}

/** Final drawable post position (already inset; corners resolved on the bisector). */
export interface PostPlacement {
  pos: Pt
  role: PostRole
}

export interface RailingResult {
  pieces: RailPiece[]
  totalLf: number
  posts: number
  postPts: Pt[]
  /** deduped, inset post positions for rendering (corner posts sit at the bisector) */
  postPlacements: PostPlacement[]
  /** rail centerline inset from the deck edge (ft) — posts + top rail share it */
  railInsetFt: number
  sections: number
  balusters: number
  chains: RailChain[]
  gatesNote: string | null
}

/** Railing runs along flagged edges, minus stair openings. */
export function computeRailing(tier: Tier, stairCalcs: StairsCalc[], settings: ProjectSettings): RailingResult {
  const res: RailingResult = {
    pieces: [],
    totalLf: 0,
    posts: 0,
    postPts: [],
    postPlacements: [],
    railInsetFt: 0,
    sections: 0,
    balusters: 0,
    chains: [],
    gatesNote: null,
  }
  const n = tier.outline.length
  const system = railSystemById(settings.railing.systemId) ?? RAILING_SYSTEMS[0]
  const inf = system.infills.find((i) => i.id === settings.railing.infillId) ?? system.infills[0]
  // glass channel/panel kits only come 6' — glass runs take closer post
  // spacing than the system's longest baluster section
  const sectionSizes = [...system.sectionsFt]
    .filter((s) => !inf.maxSectionFt || s <= inf.maxSectionFt)
    .sort((a, b) => b - a)
  const maxSec = sectionSizes[0] ?? Math.min(...system.sectionsFt)

  // rail centerline inset from the deck edge (top-mount: post face ~2" inside
  // the rim, so center = face inset + half post). Needed up front because the
  // stair-guard side rails use the SAME inset — the deck run extends into a
  // guarded stair opening exactly this far and shares its end post with the
  // raked stair rail.
  const faceInsetFt = TOP_MOUNT_FACE_INSET_IN / 12
  const railHalfFt = selectedPostOption(system, settings.railing.postOptionId).sizeIn / 24
  res.railInsetFt = faceInsetFt + railHalfFt

  /**
   * Even-bay plan: posts are spaced EVENLY along each wall/run. The run is
   * split into the fewest equal bays that respect the manufacturer's max
   * section length; each bay orders the smallest stock section that covers
   * its spacing (sections are cut down to size on site).
   */
  const planBays = (len: number): number[] => {
    const bays = Math.max(1, Math.ceil(len / maxSec - 1e-9))
    const spacing = len / bays
    const stock = [...sectionSizes].reverse().find((s) => s >= spacing - 0.05) ?? maxSec
    return new Array(bays).fill(stock)
  }

  const railEdges = new Set<number>()
  for (let i = 0; i < n; i++) {
    if (tier.edges[i]?.railing && !tier.edges[i]?.ledger) railEdges.add(i)
  }
  if (railEdges.size === 0) return res

  // shared stair-top posts: a post has 4 faces, so the level deck rail and the
  // raked stair guard make a 90° turn on ONE post. The deck run extends into a
  // guarded opening up to the stair-guard centerline (side inset = railInsetFt)
  // and its end post there IS the stair guard's top post.
  const stairCornerPts: Pt[] = []

  for (const i of railEdges) {
    const a = tier.outline[i]
    const b = tier.outline[(i + 1) % n]
    const L = dist(a, b)
    if (L < 0.5) continue
    const edgeDirEarly = norm(sub(b, a))
    const openings: [number, number][] = []
    for (const sc of stairCalcs) {
      for (const op of sc.edgeOpenings) {
        if (op.edgeIndex !== i) continue
        const cAlong = op.centerAlong
        const half = op.width / 2
        if (sc.guardRequired && !sc.wrapped) {
          const pL = cAlong - half + res.railInsetFt
          const pR = cAlong + half - res.railInsetFt
          openings.push([pL, pR])
          stairCornerPts.push(add(a, mul(edgeDirEarly, pL)), add(a, mul(edgeDirEarly, pR)))
        } else {
          // no guard on the stair — keep a clear opening past the stringers
          openings.push([cAlong - half - 0.1, cAlong + half + 0.1])
        }
      }
    }
    const spans = subtractIntervals(0, L, openings)
    const edgeDir = norm(sub(b, a))
    for (const [s0, s1] of spans) {
      const len = s1 - s0
      if (len < 1) continue
      const pa = add(a, mul(edgeDir, s0))
      const pb = add(a, mul(edgeDir, s1))
      const sectionPlan = planBays(len)
      // posts are evenly spaced along the run
      const bays = sectionPlan.length
      const piecePosts: Pt[] = []
      for (let k = 0; k <= bays; k++) {
        piecePosts.push(lerp(pa, pb, k / bays))
      }
      // interior posts are "line"; endpoints are refined to end/corner below
      const postRoles: PostRole[] = piecePosts.map((_, k) => (k === 0 || k === bays ? 'end' : 'line'))
      res.pieces.push({
        a: pa,
        b: pb,
        len,
        edgeIndex: i,
        sectionPlan,
        postPts: piecePosts,
        postRoles,
        railA: pa, // provisional — inset + corner-trimmed below
        railB: pb,
        posts: [],
      })
      const sections = sectionPlan.length
      res.sections += sections
      res.posts += sections + 1
      res.totalLf += len
      // balusters per the catalog counts for each planned section
      for (const s of sectionPlan) {
        res.balusters += inf.balustersPer[s] ?? 0
      }
      res.postPts.push(...piecePosts)
    }
  }

  // refine endpoint roles: an endpoint shared with another piece's endpoint is a corner
  for (const piece of res.pieces) {
    for (const endK of [0, piece.postPts.length - 1]) {
      const p = piece.postPts[endK]
      const isCorner = res.pieces.some(
        (o) => o !== piece && (dist(o.postPts[0], p) < 0.2 || dist(o.postPts[o.postPts.length - 1], p) < 0.2),
      )
      if (isCorner) piece.postRoles[endK] = 'corner'
      // an endpoint at a guarded stair opening is a corner too: the deck run
      // and the raked stair guard turn 90° on ONE shared post (adjacent faces)
      else if (stairCornerPts.some((q) => dist(q, p) < 0.05)) piece.postRoles[endK] = 'corner'
    }
  }

  // ---- final rail geometry (inset for top-mount; corners meet exactly) ----
  // Each run's rail centerline is its edge offset inward by railInsetFt
  // (computed up top). Where two runs meet, BOTH centerlines are trimmed to
  // their intersection: the corner post sits there and each rail terminates AT
  // that post — no overshoot past the corner, and interior posts space evenly
  // along the trimmed run so everything lines up. Stair-top corners have only
  // one deck run, so they keep the base inset endpoint — which lands exactly
  // on the stair guard's rail centerline (the shared post).

  // base inset endpoints. A plain END (the run dies at the house wall or an
  // open deck edge — no corner post shared with another run) is ALSO pulled
  // back along the edge by the same inset: the end post has to stand fully
  // on the deck with its face just off the wall, never straddle the boundary
  for (const piece of res.pieces) {
    const off = mul(edgeOutwardNormal(tier.outline, piece.edgeIndex), -res.railInsetFt)
    piece.railA = add(piece.a, off)
    piece.railB = add(piece.b, off)
    const along = norm(sub(piece.b, piece.a))
    if (piece.postRoles[0] === 'end') piece.railA = add(piece.railA, mul(along, res.railInsetFt))
    if (piece.postRoles[piece.postRoles.length - 1] === 'end') piece.railB = add(piece.railB, mul(along, -res.railInsetFt))
  }
  // corner groups: piece ends that share an outline vertex
  interface EndRef {
    piece: RailPiece
    end: 0 | 1
  }
  const cornerGroups = new Map<string, EndRef[]>()
  for (const piece of res.pieces) {
    for (const end of [0, 1] as const) {
      const role = piece.postRoles[end === 0 ? 0 : piece.postRoles.length - 1]
      if (role !== 'corner') continue
      const onEdge = end === 0 ? piece.a : piece.b
      const key = `${Math.round(onEdge.x * 100)},${Math.round(onEdge.y * 100)}`
      const arr = cornerGroups.get(key) ?? []
      arr.push({ piece, end })
      cornerGroups.set(key, arr)
    }
  }
  for (const group of cornerGroups.values()) {
    if (group.length < 2) continue
    const dirOf = (r: EndRef) => norm(sub(r.piece.railB, r.piece.railA))
    const baseOf = (r: EndRef) => (r.end === 0 ? r.piece.railA : r.piece.railB)
    const meet = lineIntersect(baseOf(group[0]), dirOf(group[0]), baseOf(group[1]), dirOf(group[1]))
    if (!meet) continue
    for (const ref of group) {
      if (ref.end === 0) ref.piece.railA = meet
      else ref.piece.railB = meet
    }
  }
  // posts evenly spaced along the trimmed centerline; corners land exactly on it
  const seen = new Set<string>()
  for (const piece of res.pieces) {
    const bays = piece.sectionPlan.length
    piece.posts = []
    for (let k = 0; k <= bays; k++) {
      piece.posts.push({ pos: lerp(piece.railA, piece.railB, k / bays), role: piece.postRoles[k] ?? 'line' })
    }
    for (const pl of piece.posts) {
      const key = `${Math.round(pl.pos.x * 50)},${Math.round(pl.pos.y * 50)}`
      if (seen.has(key)) continue
      seen.add(key)
      res.postPlacements.push(pl)
    }
  }

  // shared corner posts: consecutive railing edges that meet with no opening
  let shared = 0
  for (const i of railEdges) {
    const next = (i + 1) % n
    if (railEdges.has(next)) {
      const cornerCovered = res.pieces.some((p) => p.edgeIndex === i && dist(p.b, tier.outline[next]) < 0.2)
      const nextStarts = res.pieces.some((p) => p.edgeIndex === next && dist(p.a, tier.outline[next]) < 0.2)
      if (cornerCovered && nextStarts) shared++
    }
  }
  res.posts = Math.max(2, res.posts - shared)

  // chains: pieces joined end-to-start at corners (cable runs pass through corner posts)
  const used = new Set<number>()
  for (let i = 0; i < res.pieces.length; i++) {
    if (used.has(i)) continue
    const chain = { pieceIdx: [i], lenFt: res.pieces[i].len, corners: 0 }
    used.add(i)
    let tail = res.pieces[i]
    let extended = true
    while (extended) {
      extended = false
      for (let j = 0; j < res.pieces.length; j++) {
        if (used.has(j)) continue
        if (dist(tail.b, res.pieces[j].a) < 0.2) {
          chain.pieceIdx.push(j)
          chain.lenFt += res.pieces[j].len
          chain.corners++
          used.add(j)
          tail = res.pieces[j]
          extended = true
          break
        }
      }
    }
    res.chains.push(chain)
  }

  if (stairCalcs.length > 0) {
    res.gatesNote = 'Add gates at stair openings if required (pools, pets, childproofing).'
  }
  return res
}

/**
 * Fascia length along flagged edges. Auto-suppressed on ledger edges and edges
 * that abut another tier (adjoining deck): the fascia board is only wanted on
 * open, exposed faces.
 */
export function computeFascia(tier: Tier, others: Tier[] = []): { lf: number; edges: number[] } {
  let lf = 0
  const edges: number[] = []
  const n = tier.outline.length
  for (let i = 0; i < n; i++) {
    if (!tier.edges[i]?.fascia || tier.edges[i]?.ledger) continue
    const a = tier.outline[i]
    const b = tier.outline[(i + 1) % n]
    // adjoining check: a point just outside this edge landing inside another tier
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const out = edgeOutwardNormal(tier.outline, i)
    const probe = add(mid, mul(out, 0.25))
    const adjoining = others.some((o) => o.id !== tier.id && pointInPolygon(probe, o.outline))
    if (adjoining) continue
    lf += dist(a, b)
    edges.push(i)
  }
  return { lf, edges }
}

export function railOutwardOffsetPts(tier: Tier, piece: RailPiece, offsetFt: number): { a: Pt; b: Pt } {
  const out = edgeOutwardNormal(tier.outline, piece.edgeIndex)
  return { a: add(piece.a, mul(out, -offsetFt)), b: add(piece.b, mul(out, -offsetFt)) }
}
