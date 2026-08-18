import type { ProjectSettings, Pt, Tier } from '../model/types'
import {
  add,
  clipLineToPoly,
  dot,
  edgeInwardNormal,
  mul,
  norm,
  polyExtent,
  sub,
  type Seg,
} from '../geometry/geom'
import {
  beamAllowableSpan,
  DEPTH_IN,
  joistAllowableSpan,
} from '../codes/tables'
import { resolveDecking } from '../catalog/compat'

/**
 * A framing member running in the joist direction. `kind` distinguishes the
 * regular layout grid from ADDED support joists that exist so seams never
 * float: breaker (parting) boards get a flanking pair, picture-frame borders
 * that run parallel to the joists get a joist under their seam.
 */
export interface Joist extends Seg {
  u: number
  len: number
  kind: 'field' | 'breaker' | 'pf'
}

export interface Beam {
  seg: Seg
  v: number
  len: number
  posts: Pt[]
  postSpacing: number
  allowablePostSpacing: number
  beyondTable: boolean
}

export interface Post {
  p: Pt
  /** ft, top of post above grade (underside of beam bearing) */
  heightFt: number
}

export interface Footing {
  p: Pt
  diaIn: number
  depthIn: number
  /** tributary area, sq ft */
  tribSqft: number
  oversized: boolean
}

export interface BlockingRow {
  segs: Seg[]
  lf: number
  pieces: number
}

export interface JoistOverhangIssue {
  u: number
  overhang: number
  allowed: number
}

export interface FramingResult {
  ok: boolean
  errors: string[]
  notes: string[]
  /** unit vectors: u = across joists, v = along joists */
  uv: { u: Pt; v: Pt }
  freestanding: boolean
  ledgerSegs: Seg[]
  ledgerLen: number
  ledgerV: number | null
  rimSegs: Seg[]
  rimLen: number
  joists: Joist[]
  joistUs: number[]
  beams: Beam[]
  blocking: BlockingRow[]
  /** picture-frame border support: blocking rows under border seams (edges across the joists) */
  pfBlocking: BlockingRow[]
  /** added joists carrying picture-frame borders that run parallel to the joists */
  pfJoists: number
  /** added joists flanking breaker-board seams (2 per breaker) */
  breakerJoists: number
  posts: Post[]
  footings: Footing[]
  /** joist ends hung off a load-carrying face (ledger / header / flush beam) */
  hangers: Pt[]
  ties: Pt[]
  /**
   * Free joist ends closed by the rim/band board. These are cantilever tips
   * past a drop beam: the band takes no load from them, so they are end-screwed,
   * NOT hung. Ordering a hanger here is the classic takeoff over-count.
   */
  bandEnds: Pt[]
  maxBackspan: number
  allowableJoistSpan: number
  cantilever: number
  overhangIssues: JoistOverhangIssue[]
  postTopFt: number
  postTooShort: boolean
  /** lateral (diagonal knee) bracing required above the height threshold */
  bracingRequired: boolean
  /** number of diagonal braces to order (≈2 per post) */
  braceCount: number
}

const emptyResult = (): FramingResult => ({
  ok: false,
  errors: [],
  notes: [],
  uv: { u: { x: 1, y: 0 }, v: { x: 0, y: 1 } },
  freestanding: true,
  ledgerSegs: [],
  ledgerLen: 0,
  ledgerV: null,
  rimSegs: [],
  rimLen: 0,
  joists: [],
  joistUs: [],
  beams: [],
  blocking: [],
  pfBlocking: [],
  pfJoists: 0,
  breakerJoists: 0,
  posts: [],
  footings: [],
  hangers: [],
  ties: [],
  bandEnds: [],
  maxBackspan: 0,
  allowableJoistSpan: 0,
  cantilever: 0,
  overhangIssues: [],
  postTopFt: 0,
  postTooShort: false,
  bracingRequired: false,
  braceCount: 0,
})

/** Post height (ft) above which diagonal/knee bracing is required. */
export const BRACE_HEIGHT_FT = 5

interface Zone {
  uMin: number
  uMax: number
  farV: number
  beamVs: number[]
  backspan: number
  cant: number
}

/** Picture-frame / breaker geometry the framing must support. */
export interface DeckingSupportNeeds {
  /** stations (u coords) of breaker-board centerlines */
  breakerUs: number[]
  /** picture-frame ring count (0 = none) */
  pfRings: number
  /** BORDER board pitch (border width + gap), ft — ring seams sit at k × pitch from the edge */
  pfPitchFt: number
  /** board width, ft — breaker support joists flank the board at ± width/2 */
  boardWidthFt: number
}

/**
 * Compute the full framing layout for one tier.
 * Nothing is allowed to float: every decking seam lands on framing.
 * - Breaker (parting) boards: TWO added support joists flank the board so the
 *   breaker and both field-board ends bear on wood ("always double joists at
 *   butt seams" — TimberTech composite guide p.7 / Advanced PVC guide p.5).
 * - Picture-frame borders parallel to the joists: an added joist under each
 *   ring seam carries the border and the field-board ends (guide p.4 diagram).
 * - Picture-frame borders across the joists ride the joists; blocking rows at
 *   each ring seam stiffen and take the fasteners.
 */
export function computeFraming(
  tier: Tier,
  settings: ProjectSettings,
  needs: DeckingSupportNeeds,
): FramingResult {
  const r = emptyResult()
  const poly = tier.outline
  if (poly.length < 3) {
    r.errors.push('Outline needs at least 3 points.')
    return r
  }

  const f = tier.framing
  // v = joist direction, u = across joists
  const v: Pt = f.joistDir === 90 ? { x: 0, y: 1 } : { x: 1, y: 0 }
  const u: Pt = f.joistDir === 90 ? { x: 1, y: 0 } : { x: 0, y: 1 }
  r.uv = { u, v }

  const posU = (p: Pt) => dot(p, u)
  const posV = (p: Pt) => dot(p, v)
  const [uMin, uMax] = polyExtent(poly, u)
  const [vMin, vMax] = polyExtent(poly, v)
  const spacingFt = f.spacing / 12

  // ---- ledger edges ----
  const ledgerIdx: number[] = []
  for (let i = 0; i < poly.length; i++) {
    if (!tier.edges[i]?.ledger) continue
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const dir = norm(sub(b, a))
    if (Math.abs(dot(dir, v)) > 0.01) {
      r.errors.push(
        `Ledger edge ${i + 1} is not perpendicular to the joists — joists must run away from the house wall. It is being ignored for framing.`,
      )
      continue
    }
    ledgerIdx.push(i)
    r.ledgerSegs.push({ a, b })
    r.ledgerLen += Math.hypot(b.x - a.x, b.y - a.y)
  }
  r.freestanding = ledgerIdx.length === 0

  let ledgerV: number | null = null
  if (!r.freestanding) {
    const vs = ledgerIdx.map((i) => posV(poly[i]))
    const spread = Math.max(...vs) - Math.min(...vs)
    if (spread > 0.26) {
      r.notes.push(
        'Ledger edges sit on different wall planes (stepped house). Framing is computed from the outermost plane — review the plan and add framing at the step manually.',
      )
    }
    // use the plane that produces the longest span (conservative)
    const dFromMin = Math.max(...vs.map((x) => Math.abs(x - vMin)))
    const dFromMax = Math.max(...vs.map((x) => Math.abs(x - vMax)))
    ledgerV = dFromMin >= dFromMax ? Math.max(...vs) : Math.min(...vs)
    // actually: ledger sits at one side; the far side is the opposite polygon extreme
    // pick the ledger plane nearest a polygon extreme
    const nearMin = Math.min(...vs.map((x) => Math.abs(x - vMin)))
    const nearMax = Math.min(...vs.map((x) => Math.abs(x - vMax)))
    ledgerV = nearMin <= nearMax ? Math.min(...vs) : Math.max(...vs)
  }
  r.ledgerV = ledgerV

  const dirSign = ledgerV === null ? 1 : ledgerV <= (vMin + vMax) / 2 ? 1 : -1
  const nearV = ledgerV ?? vMin
  const S_a = joistAllowableSpan(f.species, f.joistSize, f.spacing)
  r.allowableJoistSpan = S_a

  // ---- joist positions ----
  const usSet: number[] = []
  const endInset = 0.0625 // center of end joist ~3/4" inside the edge
  const uStart = uMin + endInset
  const uEnd = uMax - endInset
  usSet.push(uStart)
  for (let k = 1; ; k++) {
    const uu = uMin + k * spacingFt
    if (uu >= uEnd - 0.05) break
    usSet.push(uu)
  }
  usSet.push(uEnd)

  const joists: Joist[] = []
  const placedUs: number[] = []
  const addJoist = (uu: number, kind: Joist['kind']): boolean => {
    // reuse an existing member when one already sits under the seam (±1")
    if (placedUs.some((x) => Math.abs(x - uu) < 0.085)) return false
    if (uu < uMin + 0.03 || uu > uMax - 0.03) return false
    const segs = clipLineToPoly(poly, mul(u, uu), v)
    let added = false
    for (const s of segs) {
      const l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
      if (l < 0.2) continue
      joists.push({ ...s, u: uu, len: l, kind })
      added = true
    }
    if (added) placedUs.push(uu)
    return added
  }
  for (const uu of usSet) addJoist(uu, 'field')

  // breaker (parting) boards: a support joist on EACH side so the breaker and
  // both field-board ends land on framing — never on air
  for (const bu of needs.breakerUs) {
    for (const sgn of [-1, 1]) {
      if (addJoist(bu + (sgn * needs.boardWidthFt) / 2, 'breaker')) r.breakerJoists++
    }
  }

  // picture-frame borders parallel to the joists: a joist under every ring seam
  if (needs.pfRings > 0) {
    for (let i = 0; i < poly.length; i++) {
      const a0 = poly[i]
      const b0 = poly[(i + 1) % poly.length]
      if (Math.hypot(b0.x - a0.x, b0.y - a0.y) < 1) continue
      const dirE = norm(sub(b0, a0))
      if (Math.abs(dot(dirE, v)) < 0.7) continue // border rides the joists — handled by blocking
      const edgeU = posU(a0)
      // true inward direction of THIS edge (handles L-shapes/inside corners)
      const inwardSign = dot(edgeInwardNormal(poly, i), u) >= 0 ? 1 : -1
      for (let k = 1; k <= needs.pfRings; k++) {
        if (addJoist(edgeU + inwardSign * k * needs.pfPitchFt, 'pf')) r.pfJoists++
      }
    }
  }

  r.joists = joists
  r.joistUs = [...new Set(placedUs)].sort((a, b) => a - b)

  // ---- zones: group joists by how far they run, so L/T shapes get beams where needed ----
  const byU = [...joists].sort((a, b) => a.u - b.u)
  const zones: Zone[] = []
  const joistFarV = (j: Joist) => (dirSign > 0 ? Math.max(posV(j.a), posV(j.b)) : Math.min(posV(j.a), posV(j.b)))
  for (const j of byU) {
    const fv = joistFarV(j)
    const z = zones[zones.length - 1]
    if (z && Math.abs(fv - z.farV) < 0.75) {
      z.uMax = j.u
      z.farV = dirSign > 0 ? Math.max(z.farV, fv) : Math.min(z.farV, fv)
    } else {
      zones.push({ uMin: j.u, uMax: j.u, farV: fv, beamVs: [], backspan: 0, cant: 0 })
    }
  }

  const cPref = Math.max(0, Math.min(4, f.cantilever))
  for (const z of zones) {
    const D = Math.abs(z.farV - nearV)
    if (D < 0.5) continue
    if (r.freestanding) {
      // beams near both ends, cantilever both sides
      let c = cPref
      let m = 2
      for (let iter = 0; iter < 4; iter++) {
        const usable = Math.max(0.1, D - 2 * c)
        m = Math.max(2, Math.ceil(usable / S_a) + 1)
        const back = usable / (m - 1)
        const cMax = back / 4
        if (c <= cMax + 1e-9) {
          z.backspan = back
          break
        }
        c = cMax
        z.backspan = back
      }
      z.cant = c
      for (let k = 0; k < m; k++) {
        z.beamVs.push(nearV + dirSign * (c + z.backspan * k))
      }
    } else {
      let c = cPref
      let n = 1
      for (let iter = 0; iter < 4; iter++) {
        const usable = Math.max(0.1, D - c)
        n = Math.max(1, Math.ceil(usable / S_a - 1e-9))
        const back = usable / n
        const cMax = back / 4
        if (c <= cMax + 1e-9) {
          z.backspan = back
          break
        }
        c = cMax
        z.backspan = back
      }
      z.cant = c
      z.backspan = (D - z.cant) / n
      for (let k = 1; k <= n; k++) z.beamVs.push(nearV + dirSign * z.backspan * k)
    }
  }

  r.maxBackspan = Math.max(0, ...zones.map((z) => z.backspan))
  r.cantilever = Math.max(0, ...zones.map((z) => z.cant))

  // ---- beams: clip each zone's beam lines to the polygon ∩ the zone's u-range ----
  const deckThk = resolveDecking(tier).profile.thickIn / 12
  const joistD = DEPTH_IN[f.joistSize] / 12
  const beamD = DEPTH_IN[f.beamSize] / 12
  const postTop =
    f.beamStyle === 'drop' ? tier.height - deckThk - joistD - beamD : tier.height - deckThk - beamD
  r.postTopFt = Math.max(0, postTop)
  r.postTooShort = postTop < 0.2

  interface RawBeam {
    v: number
    a: number
    b: number // u-range
    backspan: number
    cant: number
  }
  const raw: RawBeam[] = []
  for (const z of zones) {
    const zLo = z.uMin - spacingFt / 2
    const zHi = z.uMax + spacingFt / 2
    for (const bv of z.beamVs) {
      // A flush beam with no cantilever sits exactly ON the rim line; clipping
      // a line collinear with a polygon edge is degenerate and can drop the
      // beam entirely. Clip a hair inside the outline; the beam keeps its
      // true plane (bv) for hangers, elevation and the BOM.
      let clipV = bv
      if (Math.abs(bv - z.farV) < 0.05) clipV = bv - dirSign * 0.02
      if (Math.abs(bv - nearV) < 0.05) clipV = bv + dirSign * 0.02
      const segs = clipLineToPoly(poly, mul(v, clipV), u)
      for (const s of segs) {
        const sa = posU(s.a)
        const sb = posU(s.b)
        const lo = Math.max(Math.min(sa, sb), zLo)
        const hi = Math.min(Math.max(sa, sb), zHi)
        if (hi - lo < 0.3) continue
        raw.push({ v: bv, a: lo, b: hi, backspan: z.backspan, cant: z.cant })
      }
    }
  }
  // merge collinear raw beams that touch (same v)
  raw.sort((x, y) => x.v - y.v || x.a - y.a)
  const mergedBeams: RawBeam[] = []
  for (const rb of raw) {
    const last = mergedBeams[mergedBeams.length - 1]
    if (last && Math.abs(last.v - rb.v) < 0.05 && rb.a <= last.b + 0.5) {
      last.b = Math.max(last.b, rb.b)
      last.backspan = Math.max(last.backspan, rb.backspan)
      last.cant = Math.max(last.cant, rb.cant)
    } else {
      mergedBeams.push({ ...rb })
    }
  }

  for (const rb of mergedBeams) {
    const a = add(mul(u, rb.a), mul(v, rb.v))
    const b = add(mul(u, rb.b), mul(v, rb.v))
    const lenB = rb.b - rb.a
    // table entry keyed by joist span carried by this beam (backspan + cantilever, conservative)
    const tableSpan = rb.backspan + rb.cant
    const { span: allow, beyondTable } = beamAllowableSpan(f.species, f.beamPly, f.beamSize, tableSpan)
    const nPosts = lenB < 1.5 ? 1 : Math.max(2, Math.ceil(lenB / allow) + 1)
    // inset the end posts so posts sit INSIDE the deck frame (beam overhangs the
    // outer posts, ≤ ~1 ft) — never place a post out at the rim/corner
    const endInset = nPosts >= 2 ? Math.min(1, lenB / 4) : 0
    const usable = lenB - 2 * endInset
    const dirU = norm(sub(b, a))
    const posts: Pt[] = []
    for (let k = 0; k < nPosts; k++) {
      const tFt = nPosts === 1 ? lenB / 2 : endInset + usable * (k / (nPosts - 1))
      posts.push(add(a, mul(dirU, tFt)))
    }
    r.beams.push({
      seg: { a, b },
      v: rb.v,
      len: lenB,
      posts,
      postSpacing: nPosts > 1 ? usable / (nPosts - 1) : lenB,
      allowablePostSpacing: allow,
      beyondTable,
    })
    if (beyondTable) {
      r.notes.push('A beam carries joists spanning beyond the table range (18 ft) — engineered design required.')
    }
    if (lenB > 20) {
      r.notes.push(`Beam at ${rb.v.toFixed(1)} ft is ${lenB.toFixed(1)} ft long — splice over a post required.`)
    }
  }

  // ---- posts & footings ----
  const loadPsf = settings.liveLoad + settings.deadLoad
  const outermostV =
    r.beams.length > 0
      ? r.beams.reduce((acc, bm) => (dirSign > 0 ? Math.max(acc, bm.v) : Math.min(acc, bm.v)), dirSign > 0 ? -Infinity : Infinity)
      : 0
  for (const bm of r.beams) {
    // tributary joist length carried by this beam: half the backspan on the
    // supported side(s), plus the cantilever if it is the outermost beam
    const isOutermost = Math.abs(bm.v - outermostV) < 0.05
    const inner = r.maxBackspan / 2
    const outer = isOutermost ? r.cantilever + (r.freestanding ? 0 : 0) : r.maxBackspan / 2
    const tribV = Math.max(0.5, inner + outer)
    for (const p of bm.posts) {
      r.posts.push({ p, heightFt: r.postTopFt })
      const trib = Math.max(2, bm.postSpacing) * tribV
      const areaReq = (trib * loadPsf) / settings.soilBearing // sq ft
      let diaIn = Math.ceil((Math.sqrt(areaReq / Math.PI) * 2 * 12) / 2) * 2
      let oversized = false
      if (diaIn < 12) diaIn = 12
      if (diaIn > 24) {
        diaIn = 24
        oversized = true
      }
      r.footings.push({ p, diaIn, depthIn: settings.frostDepth, tribSqft: trib, oversized })
    }
  }

  // ---- lateral bracing (diagonal knee braces) above the height threshold ----
  r.bracingRequired = r.posts.length > 0 && (r.postTopFt > BRACE_HEIGHT_FT || (r.freestanding && r.postTopFt > 2))
  r.braceCount = r.bracingRequired ? r.posts.length * 2 : 0

  // ---- hangers, ties & band ends ----
  // A connector is ordered for what a joist end actually DOES:
  //   • end on the ledger face          → joist hanger
  //   • end on a flush beam face        → joist hanger
  //   • end/crossing over a drop beam   → hurricane tie (it bears from below)
  //   • free cantilever tip at the rim  → band screws only, NO hanger
  // The last case is the common takeoff error: the band board closes the joist
  // end and carries none of its load, so it is end-screwed, not hung.
  const nearTol = 0.12
  const beamNear = (jj: Joist, vEnd: number): boolean =>
    r.beams.some((bm) => {
      const bu0 = Math.min(posU(bm.seg.a), posU(bm.seg.b)) - 0.05
      const bu1 = Math.max(posU(bm.seg.a), posU(bm.seg.b)) + 0.05
      return jj.u >= bu0 && jj.u <= bu1 && Math.abs(bm.v - vEnd) < 0.25
    })
  let underSupported = 0
  for (const j of joists) {
    const va = posV(j.a)
    const vb = posV(j.b)
    let bearings = 0
    for (const [pt, vEnd] of [
      [j.a, va],
      [j.b, vb],
    ] as [Pt, number][]) {
      if (ledgerV !== null && Math.abs(vEnd - ledgerV) < nearTol) {
        r.hangers.push(pt) // hung off the ledger face
        bearings++
      } else if (!beamNear(j, vEnd)) {
        r.bandEnds.push(pt) // free cantilever tip — band screws, no hanger
      }
      // an end AT a beam is counted by the beam loop below (tie or hanger)
    }
    for (const bm of r.beams) {
      const jv0 = Math.min(va, vb)
      const jv1 = Math.max(va, vb)
      const ju = j.u
      const bu0 = Math.min(posU(bm.seg.a), posU(bm.seg.b))
      const bu1 = Math.max(posU(bm.seg.a), posU(bm.seg.b))
      if (ju < bu0 - 0.05 || ju > bu1 + 0.05) continue
      if (bm.v > jv0 + 0.05 && bm.v < jv1 - 0.05) {
        const pt = add(mul(u, ju), mul(v, bm.v))
        bearings++
        if (f.beamStyle === 'drop') r.ties.push(pt)
        else {
          r.hangers.push(pt)
          if (Math.abs(bm.v - (dirSign > 0 ? jv1 : jv0)) > 0.3) r.hangers.push(pt) // interior flush beam: joists spliced, 2 hangers
        }
      } else if (Math.abs(bm.v - jv0) <= 0.05 || Math.abs(bm.v - jv1) <= 0.05) {
        const pt = add(mul(u, ju), mul(v, bm.v))
        bearings++
        if (f.beamStyle === 'drop') r.ties.push(pt)
        else r.hangers.push(pt)
      }
    }
    if (bearings < 2) underSupported++
  }
  if (underSupported > 0) {
    r.notes.push(
      `${underSupported} joist(s) reach fewer than two bearings — check beam placement (a cantilever tip is not a support).`,
    )
  }

  // ---- rim ----
  for (let i = 0; i < poly.length; i++) {
    if (tier.edges[i]?.ledger) continue
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    r.rimSegs.push({ a, b })
    r.rimLen += Math.hypot(b.x - a.x, b.y - a.y)
  }
  if (f.doubleRim) r.rimLen *= 2

  // ---- blocking rows: over drop beams + rows so no span exceeds ~6' ----
  // (TimberTech install guides: solid wood blocking between joists every 4'–6')
  const blockVs: number[] = []
  if (f.beamStyle === 'drop') for (const bm of r.beams) blockVs.push(bm.v)
  const MAX_BLOCK_GAP = 6
  for (const z of zones) {
    const supports = r.freestanding ? [...z.beamVs] : [nearV, ...z.beamVs]
    supports.sort((a, b) => (dirSign > 0 ? a - b : b - a))
    for (let k = 0; k + 1 < supports.length; k++) {
      const s0 = supports[k]
      const s1 = supports[k + 1]
      const gapLen = Math.abs(s1 - s0)
      const nRows = Math.max(0, Math.ceil(gapLen / MAX_BLOCK_GAP) - 1)
      for (let j = 1; j <= nRows; j++) {
        blockVs.push(s0 + (s1 - s0) * (j / (nRows + 1)))
      }
    }
  }
  for (const bv of [...new Set(blockVs.map((x) => Math.round(x * 100) / 100))]) {
    const segs = clipLineToPoly(poly, mul(v, bv), u)
    const lf = segs.reduce((s, x) => s + Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y), 0)
    if (lf < 0.5) continue
    r.blocking.push({ segs, lf, pieces: Math.max(1, Math.round(lf / spacingFt)) })
  }

  // ---- picture-frame borders across the joists: blocking at every ring seam ----
  // (the border board itself rides the joists; the blocking stiffens the seam
  // and takes the border fasteners — install-guide substructure diagram)
  if (needs.pfRings > 0) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]
      const b = poly[(i + 1) % poly.length]
      const edgeLen = Math.hypot(b.x - a.x, b.y - a.y)
      if (edgeLen < 1) continue
      const dirE = norm(sub(b, a))
      if (Math.abs(dot(dirE, v)) > 0.7) continue // parallel-to-joist edges got real joists above
      const inward = edgeInwardNormal(poly, i)
      for (let k = 1; k <= needs.pfRings; k++) {
        const base = add(a, mul(inward, k * needs.pfPitchFt))
        const rawSegs = clipLineToPoly(poly, base, dirE)
        const segs: Seg[] = []
        for (const sgRaw of rawSegs) {
          // bound to this edge's own extent so concave shapes don't pick up far segments
          let t0 = dot(sub(sgRaw.a, base), dirE)
          let t1 = dot(sub(sgRaw.b, base), dirE)
          if (t0 > t1) [t0, t1] = [t1, t0]
          const lo = Math.max(t0, 0)
          const hi = Math.min(t1, edgeLen)
          if (hi - lo < 0.3) continue
          segs.push({ a: add(base, mul(dirE, lo)), b: add(base, mul(dirE, hi)) })
        }
        const lf = segs.reduce((s, x) => s + Math.hypot(x.b.x - x.a.x, x.b.y - x.a.y), 0)
        if (lf > 0.3) {
          r.pfBlocking.push({ segs, lf, pieces: Math.max(1, Math.round(lf / spacingFt)) })
        }
      }
    }
  }

  // ---- per-joist support verification (catches shapes the zone logic can't frame) ----
  const beamCrossVs = (j: Joist): number[] => {
    const va = Math.min(posV(j.a), posV(j.b))
    const vb = Math.max(posV(j.a), posV(j.b))
    const out: number[] = []
    for (const bm of r.beams) {
      const bu0 = Math.min(posU(bm.seg.a), posU(bm.seg.b)) - 0.05
      const bu1 = Math.max(posU(bm.seg.a), posU(bm.seg.b)) + 0.05
      if (j.u >= bu0 && j.u <= bu1 && bm.v >= va - 0.05 && bm.v <= vb + 0.05) out.push(bm.v)
    }
    if (ledgerV !== null && ledgerV >= va - nearTol && ledgerV <= vb + nearTol) out.push(ledgerV)
    return out.sort((a, b) => a - b)
  }
  for (const j of joists) {
    const supports = beamCrossVs(j)
    if (supports.length === 0) continue
    const va = Math.min(posV(j.a), posV(j.b))
    const vb = Math.max(posV(j.a), posV(j.b))
    const spans: number[] = []
    for (let k = 0; k + 1 < supports.length; k++) spans.push(supports[k + 1] - supports[k])
    const maxSpan = Math.max(0.1, ...spans, 0.1)
    const head = supports[0] - va
    const tail = vb - supports[supports.length - 1]
    const allowedCant = Math.max(maxSpan, r.maxBackspan) / 4
    for (const over of [head, tail]) {
      if (over > allowedCant + 0.1) {
        r.overhangIssues.push({ u: j.u, overhang: over, allowed: allowedCant })
      }
    }
  }
  if (r.overhangIssues.length > 0) {
    r.notes.push(
      `${r.overhangIssues.length} joist(s) overhang their last support beyond the allowed cantilever — this shape needs an extra beam segment or a revised layout.`,
    )
  }

  r.ok = r.errors.length === 0
  return r
}
