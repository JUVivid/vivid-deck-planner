import type { Pt, Tier } from '../model/types'
import { add, dist, edgeOutwardNormal, lerp, mul, norm, polygonArea, sub } from '../geometry/geom'

/**
 * Perimeter arithmetic for things that live ALONG the deck boundary (stairs).
 *
 * A stair is a span of the boundary path: an arc-length interval that may lie
 * on one edge or run across several corners. Walking the interval yields the
 * legs (per-edge sub-segments) and the corners crossed between them — corners
 * crossed are corners wrapped.
 */

export interface PerimLeg {
  edgeIndex: number
  /** sub-segment of the edge, in world coords */
  a: Pt
  b: Pt
  lenFt: number
  /** along-edge positions of a/b from the edge's start vertex */
  aAlong: number
  bAlong: number
  /** outward normal / direction of this edge */
  normal: Pt
  dir: Pt
}

export interface PerimSpan {
  legs: PerimLeg[]
  /** outline vertices crossed between legs (wrapped corners), in walk order */
  corners: { vertexIndex: number; pt: Pt }[]
  /** total attachment length actually covered, ft */
  lengthFt: number
  /** why the span was clipped short, if it was */
  clipNote?: string
}

export function edgeLengths(tier: Tier): number[] {
  const n = tier.outline.length
  return tier.outline.map((p, i) => dist(p, tier.outline[(i + 1) % n]))
}

/** arc-length position of (edgeIndex, t) along the outline loop */
export function arcOf(tier: Tier, edgeIndex: number, t: number): number {
  const lens = edgeLengths(tier)
  let s = 0
  for (let i = 0; i < edgeIndex; i++) s += lens[i]
  return s + Math.max(0, Math.min(1, t)) * lens[edgeIndex]
}

/** inverse of arcOf — the point at arc position s (s wraps around the loop) */
export function posAt(tier: Tier, s: number): { edgeIndex: number; t: number; pt: Pt } {
  const lens = edgeLengths(tier)
  const P = lens.reduce((a, b) => a + b, 0)
  let ss = ((s % P) + P) % P
  for (let i = 0; i < lens.length; i++) {
    if (ss <= lens[i] + 1e-9) {
      const t = lens[i] < 1e-9 ? 0 : ss / lens[i]
      return { edgeIndex: i, t, pt: lerp(tier.outline[i], tier.outline[(i + 1) % lens.length], t) }
    }
    ss -= lens[i]
  }
  return { edgeIndex: 0, t: 0, pt: { ...tier.outline[0] } }
}

/** is the outline vertex a convex (outside) corner? */
export function isConvexCorner(tier: Tier, vertexIndex: number): boolean {
  const n = tier.outline.length
  const prev = tier.outline[(vertexIndex - 1 + n) % n]
  const at = tier.outline[vertexIndex]
  const next = tier.outline[(vertexIndex + 1) % n]
  const d1 = norm(sub(at, prev))
  const d2 = norm(sub(next, at))
  const turn = d1.x * d2.y - d1.y * d2.x
  return Math.sign(turn) === Math.sign(polygonArea(tier.outline)) && Math.abs(turn) > 0.05
}

/**
 * Walk the boundary interval [centerArc − width/2, centerArc + width/2].
 *
 * • endpoints within `snapFt` of a corner stick TO the corner — a few inches
 *   of overshoot never creates a sliver wrap, a few inches of undershoot
 *   never leaves a sliver of railing
 * • the walk stops at a ledger edge or a reflex (inside) corner; `allowWrap`
 *   false stops at every corner (used when the rise is too tall to wrap)
 */
export function spanOnPerimeter(
  tier: Tier,
  centerArc: number,
  widthFt: number,
  snapFt: number,
  allowWrap: boolean,
): PerimSpan {
  const n = tier.outline.length
  const lens = edgeLengths(tier)
  const P = lens.reduce((a, b) => a + b, 0)
  const wrapS = (s: number) => ((s % P) + P) % P
  let clipNote: string | undefined

  // walk outward from the center in each direction, stopping at blockers
  const walkDir = (dir: 1 | -1, budget: number): number => {
    // returns how far we can travel from centerArc in this direction
    let travelled = 0
    let { edgeIndex, t } = posAt(tier, centerArc)
    let remainingOnEdge = dir === 1 ? lens[edgeIndex] * (1 - t) : lens[edgeIndex] * t
    if (tier.edges[edgeIndex]?.ledger) {
      // posAt is ambiguous at shared corners — sitting at the very end of a
      // ledger edge means we leave it immediately, which is fine; anywhere
      // else on it is the house wall
      if (remainingOnEdge > 1e-6) {
        clipNote = clipNote ?? 'ledger'
        return 0
      }
      remainingOnEdge = 0
    }
    let cur = edgeIndex
    for (let guard = 0; guard <= n; guard++) {
      if (budget <= remainingOnEdge + 1e-9) return travelled + budget
      // reached a corner
      travelled += remainingOnEdge
      budget -= remainingOnEdge
      // corner magnet: a short remainder past the corner snaps back to it —
      // a few inches of overshoot is hand wobble, not intent to wrap
      if (budget <= snapFt) return travelled
      const vertex = dir === 1 ? (cur + 1) % n : cur
      const nextEdge = dir === 1 ? (cur + 1) % n : (cur - 1 + n) % n
      const canCross = allowWrap && isConvexCorner(tier, vertex) && !tier.edges[nextEdge]?.ledger
      if (!canCross) {
        if (!allowWrap) clipNote = clipNote ?? 'too-tall'
        else if (!isConvexCorner(tier, vertex)) clipNote = clipNote ?? 'inside-corner'
        else clipNote = clipNote ?? 'ledger'
        return travelled
      }
      cur = nextEdge
      remainingOnEdge = lens[cur]
    }
    return travelled
  }

  const half = widthFt / 2
  let back = walkDir(-1, half)
  let fwd = walkDir(1, half)
  // never collapse below a usable stair: if blockers ate one side, try to make
  // it up on the other (still respecting blockers — never force through them)
  const MIN_SPAN = 1.5
  if (back + fwd < MIN_SPAN) {
    back = walkDir(-1, MIN_SPAN - fwd)
    fwd = walkDir(1, MIN_SPAN - back)
  }
  let s0 = centerArc - back
  let s1 = centerArc + fwd

  // corner magnet on the endpoints: stick to a corner within snapFt
  const cornerArcs: number[] = []
  {
    let acc = 0
    for (let i = 0; i < n; i++) {
      cornerArcs.push(acc)
      acc += lens[i]
    }
  }
  const snapEnd = (s: number): number => {
    for (const ca of cornerArcs) {
      for (const cand of [ca, ca + P, ca - P]) {
        if (Math.abs(s - cand) < snapFt) return cand
      }
    }
    return s
  }
  // accept the endpoint snaps only while they leave a usable stair
  const s0s = snapEnd(s0)
  const s1s = snapEnd(s1)
  if (s1s - s0s >= MIN_SPAN) {
    s0 = s0s
    s1 = s1s
  }

  // collect the legs inside [s0, s1]
  const legs: PerimLeg[] = []
  let cursor = s0
  for (let guard = 0; guard <= n + 1 && cursor < s1 - 1e-9; guard++) {
    const at = posAt(tier, wrapS(cursor))
    // posAt is ambiguous at corners (previous edge, t = 1) — normalize to the
    // start of the next edge so every iteration makes progress
    let i = at.edgeIndex
    let tt = at.t
    if (tt >= 1 - 1e-9) {
      i = (i + 1) % n
      tt = 0
    }
    const edgeStartArc = cursor - tt * lens[i]
    const edgeEndArc = edgeStartArc + lens[i]
    const segEnd = Math.min(edgeEndArc, s1)
    const aAlong = tt * lens[i]
    const bAlong = aAlong + (segEnd - cursor)
    const A = tier.outline[i]
    const B = tier.outline[(i + 1) % n]
    const d = norm(sub(B, A))
    const leg: PerimLeg = {
      edgeIndex: i,
      a: add(A, mul(d, aAlong)),
      b: add(A, mul(d, bAlong)),
      lenFt: segEnd - cursor,
      aAlong,
      bAlong,
      normal: edgeOutwardNormal(tier.outline, i),
      dir: d,
    }
    if (leg.lenFt > 0.05) legs.push(leg)
    cursor = segEnd + 1e-9
  }

  // wrapped corners are exactly the vertices BETWEEN consecutive legs — never
  // an endpoint the span merely touches
  const corners: { vertexIndex: number; pt: Pt }[] = []
  for (let j = 0; j + 1 < legs.length; j++) {
    const vertexIndex = (legs[j].edgeIndex + 1) % n
    corners.push({ vertexIndex, pt: { ...tier.outline[vertexIndex] } })
  }

  return { legs, corners, lengthFt: s1 - s0, clipNote }
}

/**
 * Offset direction for each vertex of the attachment polyline. Interior
 * vertices (wrapped corners) get the MITER direction — the intersection of the
 * two neighbouring offset lines: m = (n1 + n2) / (1 + n1·n2). This handles a
 * square deck corner and a 45° octagon corner with the same formula.
 */
export function offsetDirs(span: PerimSpan): { verts: Pt[]; dirs: Pt[] } {
  const verts: Pt[] = [span.legs[0].a]
  const dirs: Pt[] = [span.legs[0].normal]
  for (let i = 0; i < span.legs.length - 1; i++) {
    const n1 = span.legs[i].normal
    const n2 = span.legs[i + 1].normal
    const denom = 1 + n1.x * n2.x + n1.y * n2.y
    verts.push(span.legs[i].b)
    dirs.push(denom < 0.1 ? add(n1, n2) : mul(add(n1, n2), 1 / denom))
  }
  const last = span.legs[span.legs.length - 1]
  verts.push(last.b)
  dirs.push(last.normal)
  return { verts, dirs }
}
