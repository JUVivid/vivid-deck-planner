import type { Project, Pt, Stairs, Tier } from '../model/types'
import { add, lerp, mul, polygonArea, sub } from '../geometry/geom'
import { CODE } from '../codes/tables'
import { resolveDecking } from '../catalog/compat'
import { arcOf, offsetDirs, spanOnPerimeter, type PerimSpan } from './perimeter'
import { STAIR_SNAP_FT } from './stairplace'

/** Wrap steps are only allowed below the guard trigger (30" walking surface). */
export const WRAP_MAX_RISE_FT = CODE.guardTriggerIn / 12

/** A stair's claim on a deck edge (for railing openings / fascia). */
export interface EdgeOpening {
  edgeIndex: number
  /** center of the opening measured along the edge from its start vertex, ft */
  centerAlong: number
  /** ft */
  width: number
}

/** One decking board covering part of a tread, front (nosing) to back. */
export interface TreadBoard {
  /** finished width (in) — the back board is ripped when whole boards overshoot */
  widthIn: number
  ripped: boolean
}

export interface TreadLayout {
  boards: TreadBoard[]
  /** tread run, nosing to nosing (in) — set by the boards that cover it */
  runIn: number
  /** nosing projection past the riser below (in) */
  noseIn: number
  /** gap between tread boards (in) — 0 for interlocking T&G porch stock */
  gapIn: number
}

// IRC R311.7.5.3: nosing 3/4"–1-1/4" where the tread is under 11" deep.
const NOSE_PREF_IN = 1
const NOSE_MIN_IN = 0.75
/** past this the tread is silly-deep — rip the back board to an 11" run instead */
const TREAD_MAX_IN = 12.5

/**
 * Lay decking across a tread. Real composite stairs are built the other way
 * round from the framing: you pick how many boards cover the tread, then cut
 * the stringer run to suit — so the boards always cover the full tread with no
 * strip of bare stringer showing. Whole boards are preferred; if no whole-board
 * layout lands in a code-legal run (10"–12.5"), the back board is ripped.
 */
export function planTreadBoards(widthIn: number, gapIn: number): TreadLayout {
  const whole = (n: number): TreadBoard[] => Array.from({ length: n }, () => ({ widthIn, ripped: false }))
  for (let n = 1; n <= 6; n++) {
    const cover = n * widthIn + (n - 1) * gapIn
    for (const noseIn of [NOSE_PREF_IN, NOSE_MIN_IN]) {
      const runIn = cover - noseIn
      if (runIn >= CODE.minTreadIn && runIn <= TREAD_MAX_IN) return { boards: whole(n), runIn, noseIn, gapIn }
    }
  }
  // rip the back board to fill an 11" run + 1" nosing
  const runIn = 11
  const cover = runIn + NOSE_PREF_IN
  const pitch = widthIn + gapIn
  const n = Math.max(1, Math.ceil((cover - 1e-6) / pitch))
  const boards = whole(n - 1)
  const lastW = cover - (n - 1) * pitch
  boards.push({ widthIn: Math.round(lastW * 16) / 16, ripped: true })
  return { boards, runIn, noseIn: NOSE_PREF_IN, gapIn }
}

/**
 * The stair's attachment frame along the perimeter: the polyline it hangs
 * from, plus the offset direction at every vertex (edge normals at the open
 * ends, miter directions at wrapped corners). `path(d)` = verts[i] + dirs[i]·d.
 */
export interface WrapFrame {
  verts: Pt[]
  dirs: Pt[]
  legs: PerimSpan['legs']
}

export interface StairsCalc {
  stairs: Stairs
  tier: Tier
  ok: boolean
  errors: string[]
  /** total rise, ft */
  rise: number
  landingLabel: string
  riserCount: number
  riserIn: number
  treadCount: number
  /** tread run, nosing to nosing (in) — derived from the boards covering it */
  treadIn: number
  /** nosing projection past the riser below (in) */
  noseIn: number
  /** decking boards covering one tread, front to back */
  treadBoards: TreadBoard[]
  /** gap between those boards (in) — 0 for T&G porch stock */
  treadGapIn: number
  totalRunFt: number
  stringerLenFt: number
  stringerCount: number
  throatIn: number
  guardRequired: boolean
  widthIn: number
  /** attachment length actually covered along the perimeter, ft */
  attachWidthFt: number
  /** finished tread surface, sq ft */
  treadSqft: number
  /** finished riser surface, sq ft */
  riserSqft: number
  /** treads + risers — the surface stair labour is billed on */
  finishSqft: number
  // plan geometry
  origin: Pt // center of the primary leg on the deck edge
  outDir: Pt
  edgeDir: Pt
  corners: [Pt, Pt, Pt, Pt]
  // ---- wrap (steps crossing deck corners) ----
  /** number of corners this flight wraps — 0 = straight */
  wrapCorners: number
  /** true when the flight wraps at least one corner */
  wrapped: boolean
  /** why the span was clipped (too tall to wrap / inside corner / house wall) */
  wrapNote?: string
  /** tread band outlines, top step first — closed polygons for the plan view */
  rings: Pt[][]
  /** attachment frame for the plan renderer (boards / stringers / hips) */
  frame?: WrapFrame
  /** every edge span this stair opens (1 for a straight flight, more wrapped) */
  edgeOpenings: EdgeOpening[]
  /** LF of riser face at the bottom step — sizes the landing pad */
  baseFrontLf: number
  /** closed plan-view outline of the whole flight (hit-testing / selection) */
  footprint: Pt[]
  /**
   * Mid-span stringer supports: cut 2x12 stringers max out around 6' of
   * horizontal span (DCA 6), so a tall flight gets a girder on 6x6 posts under
   * the stringers — with footings, like any other girder.
   */
  midSupports: StairMidSupport[]
}

export interface StairMidSupport {
  /** horizontal distance out from the deck edge, ft */
  xFt: number
  /** girder centerline under the stringers */
  a: Pt
  b: Pt
  posts: Pt[]
  /** ft, top of posts (underside of the girder) */
  postTopFt: number
}

const polylineLen = (pts: Pt[]): number => {
  let L = 0
  for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y)
  return L
}

export function computeStairs(st: Stairs, project: Project): StairsCalc | null {
  const tier = project.tiers.find((t) => t.id === st.tierId)
  if (!tier) return null
  const n = tier.outline.length
  const i = st.edgeIndex
  if (i < 0 || i >= n) return null

  const errors: string[] = []
  let landingH = 0
  let landingLabel = 'grade'
  if (st.landing.kind === 'tier') {
    const landingTierId = st.landing.tierId
    const lt = project.tiers.find((t) => t.id === landingTierId)
    if (!lt) {
      errors.push('Landing tier no longer exists — landing on grade instead.')
    } else {
      landingH = lt.height
      landingLabel = lt.name
    }
  }

  const rise = tier.height - landingH
  if (rise <= 0.05) errors.push('Landing is at or above the deck surface — stairs not possible here.')

  const riseIn = Math.max(1, rise * 12)
  const riserCount = Math.max(1, Math.ceil(riseIn / CODE.maxRiserIn))
  const riserIn = riseIn / riserCount
  // the decking sets the tread depth: boards must cover the full tread
  const { profile, fastener } = resolveDecking(tier)
  const treadLayout = planTreadBoards(profile.widthIn, profile.edge === 'tg' ? 0 : fastener.gapIn)
  const treadIn = treadLayout.runIn
  const treadCount = Math.max(0, riserCount - 1)
  const totalRunFt = (treadCount * treadIn) / 12
  const stringerLenFt = Math.hypot(rise, totalRunFt) + 1 // trim allowance
  const throatIn = 11.25 - (riserIn * treadIn) / Math.hypot(riserIn, treadIn)
  const runFt = treadIn / 12
  const riserFt = riserIn / 12
  const noseFt = treadLayout.noseIn / 12

  // ---- the stair is a SPAN of the perimeter: cross a corner and you wrap it ----
  // Wrapping is purely positional — no mode. Steps taller than the 30" guard
  // trigger cannot wrap (open cascades can't take a guard), so their span
  // clips at the first corner instead.
  const allowWrap = rise <= WRAP_MAX_RISE_FT + 0.02
  const centerArc = arcOf(tier, i, Math.max(0, Math.min(1, st.t)))
  const span = spanOnPerimeter(tier, centerArc, st.width, STAIR_SNAP_FT, allowWrap)

  if (span.legs.length === 0) {
    errors.push('Stairs cannot attach here (house wall). Drag them to an open edge.')
    return {
      stairs: st, tier, ok: false, errors, rise, landingLabel, riserCount, riserIn, treadCount, treadIn,
      noseIn: treadLayout.noseIn, treadBoards: treadLayout.boards, treadGapIn: treadLayout.gapIn, totalRunFt,
      stringerLenFt, stringerCount: 0, throatIn, guardRequired: false, widthIn: st.width * 12,
      attachWidthFt: 0, treadSqft: 0, riserSqft: 0, finishSqft: 0,
      origin: tier.outline[i], outDir: { x: 0, y: 1 }, edgeDir: { x: 1, y: 0 },
      corners: [tier.outline[i], tier.outline[i], tier.outline[i], tier.outline[i]],
      wrapCorners: 0, wrapped: false, rings: [], edgeOpenings: [], baseFrontLf: 0, footprint: [], midSupports: [],
    }
  }

  let wrapNote: string | undefined
  if (span.clipNote && span.lengthFt < st.width - 0.1) {
    wrapNote =
      span.clipNote === 'too-tall'
        ? `Stairs over 30" of rise can't wrap corners (guards would be required) — clipped to a straight flight.`
        : span.clipNote === 'inside-corner'
          ? 'Steps stop at inside corners — the span was clipped there.'
          : 'Steps stop at the house wall — the span was clipped there.'
  }

  const attachWidthFt = span.lengthFt
  const wrapCorners = span.corners.length
  const wrapped = wrapCorners > 0

  // primary leg (longest) anchors the elevation profile and the DN label
  const primary = span.legs.reduce((a, b) => (b.lenFt > a.lenFt ? b : a))
  const origin = lerp(primary.a, primary.b, 0.5)
  const outDir = primary.normal
  const edgeDir = primary.dir

  // ---- offset frame: path(d) = verts + dirs·d (miters at wrapped corners) ----
  const { verts, dirs } = offsetDirs(span)
  const path = (d: number): Pt[] => verts.map((v, k) => add(v, mul(dirs[k], d)))

  const rings: Pt[][] = []
  for (let k = 1; k <= treadCount; k++) {
    rings.push([...path((k - 1) * runFt), ...path(k * runFt).reverse()])
  }

  // quantities measured from the real geometry — exact for any corner angles
  let treadSqft = 0
  for (const ring of rings) treadSqft += Math.abs(polygonArea(ring))
  let riserSqft = 0
  for (let k = 1; k <= riserCount; k++) riserSqft += polylineLen(path(k * runFt)) * riserFt
  const baseFrontLf = polylineLen(path(riserCount * runFt))

  // short stringers @ 12" oc along every leg (epsilon: leg lengths carry
  // arc-walk float dust — 1.999999999 must count like 2)
  const stringerCount = span.legs.reduce((s, leg) => s + Math.floor(leg.lenFt + 1e-6) + 1, 0)

  // plan footprint: attachment line out to the outermost nosing
  const outerD = treadCount * runFt + noseFt
  const footprint: Pt[] = [...verts, ...path(outerD).reverse()]
  // corners: straight flights keep the oriented rect the plan renderer draws
  // from (works on diagonal octagon edges); wrapped flights get the bbox
  // (only zoom-to-fit reads it — hit-testing uses `footprint`)
  let corners: [Pt, Pt, Pt, Pt]
  if (!wrapped && span.legs.length === 1) {
    const A = span.legs[0].a
    const B = span.legs[0].b
    corners = [A, B, add(B, mul(outDir, outerD)), add(A, mul(outDir, outerD))]
  } else {
    const xs = footprint.map((p) => p.x)
    const ys = footprint.map((p) => p.y)
    corners = [
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      { x: Math.min(...xs), y: Math.max(...ys) },
    ]
  }

  const edgeOpenings: EdgeOpening[] = span.legs.map((leg) => ({
    edgeIndex: leg.edgeIndex,
    centerAlong: (leg.aAlong + leg.bAlong) / 2,
    width: leg.lenFt,
  }))

  // ---- mid-span stringer supports (straight flights only — wraps are short) ----
  // Cut 2x12 stringers span ~6' max between bearings (DCA 6). A taller flight
  // gets a girder on 6x6 posts under the stringers, spans kept equal.
  const midSupports: StairMidSupport[] = []
  if (!wrapped && span.legs.length === 1 && totalRunFt > CODE.maxStringerSpanFt + 0.02) {
    const leg = span.legs[0]
    const nSup = Math.ceil(totalRunFt / CODE.maxStringerSpanFt) - 1
    // stringer depth measured plumb + tread thickness + girder depth below
    const cosSlope = treadIn / Math.hypot(treadIn, riserIn)
    const plumbDepthFt = 11.25 / 12 / Math.max(0.5, cosSlope)
    const treadThkFt = profile.thickIn / 12
    for (let k = 1; k <= nSup; k++) {
      const xFt = (totalRunFt * k) / (nSup + 1)
      const surfaceZ = tier.height - rise * (xFt / totalRunFt)
      const postTopFt = Math.max(0.2, surfaceZ - treadThkFt - plumbDepthFt - 9.25 / 12)
      const a = add(leg.a, mul(leg.normal, xFt))
      const b = add(leg.b, mul(leg.normal, xFt))
      const inset = Math.min(1, attachWidthFt / 4)
      const nPosts = Math.max(2, Math.ceil((attachWidthFt - 2 * inset) / 6) + 1)
      const posts: Pt[] = []
      for (let p = 0; p < nPosts; p++) {
        const t = nPosts === 1 ? 0.5 : inset / attachWidthFt + (1 - (2 * inset) / attachWidthFt) * (p / (nPosts - 1))
        posts.push(lerp(a, b, t))
      }
      midSupports.push({ xFt, a, b, posts, postTopFt })
    }
  }

  return {
    stairs: st,
    tier,
    ok: errors.length === 0,
    errors,
    rise,
    landingLabel,
    riserCount,
    riserIn,
    treadCount,
    treadIn,
    noseIn: treadLayout.noseIn,
    treadBoards: treadLayout.boards,
    treadGapIn: treadLayout.gapIn,
    totalRunFt,
    stringerLenFt,
    stringerCount,
    throatIn,
    guardRequired: wrapped ? false : riserCount >= CODE.handrailMinRisers,
    widthIn: st.width * 12,
    attachWidthFt,
    treadSqft,
    riserSqft,
    finishSqft: treadSqft + riserSqft,
    origin,
    outDir,
    edgeDir,
    corners,
    wrapCorners,
    wrapped,
    wrapNote,
    rings,
    frame: { verts, dirs, legs: span.legs },
    edgeOpenings,
    baseFrontLf,
    footprint,
    midSupports,
  }
}
