import type { Pt } from '../model/types'

export interface Seg {
  a: Pt
  b: Pt
}

const EPS = 1e-9

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Pt, s: number): Pt => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x
export const len = (a: Pt): number => Math.hypot(a.x, a.y)
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)
export const norm = (a: Pt): Pt => {
  const l = len(a)
  return l < EPS ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x })
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)

/** Signed area (shoelace). With y-down screen coords, positive = clockwise on screen. */
export function polygonArea(poly: Pt[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

export function centroid(poly: Pt[]): Pt {
  let x = 0
  let y = 0
  for (const p of poly) {
    x += p.x
    y += p.y
  }
  return { x: x / poly.length, y: y / poly.length }
}

export function bbox(poly: Pt[]): { min: Pt; max: Pt } {
  const min = { x: Infinity, y: Infinity }
  const max = { x: -Infinity, y: -Infinity }
  for (const p of poly) {
    min.x = Math.min(min.x, p.x)
    min.y = Math.min(min.y, p.y)
    max.x = Math.max(max.x, p.x)
    max.y = Math.max(max.y, p.y)
  }
  return { min, max }
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y) {
      const xInt = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)
      if (p.x < xInt) inside = !inside
    }
  }
  return inside
}

/** Extent of a polygon projected onto a unit direction. */
export function polyExtent(poly: Pt[], dir: Pt): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const p of poly) {
    const d = dot(p, dir)
    lo = Math.min(lo, d)
    hi = Math.max(hi, d)
  }
  return [lo, hi]
}

/** Intersection of two infinite lines given as point + direction. Null if parallel. */
export function lineIntersect(p: Pt, d: Pt, q: Pt, e: Pt): Pt | null {
  const den = cross(d, e)
  if (Math.abs(den) < 1e-12) return null
  const t = cross(sub(q, p), e) / den
  return add(p, mul(d, t))
}

/**
 * Clip an infinite line (origin + t*dir) against a simple polygon.
 * Returns the segments of the line that lie inside the polygon.
 */
export function clipLineToPoly(poly: Pt[], origin: Pt, dir: Pt): Seg[] {
  const ts: number[] = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const ab = sub(b, a)
    const den = cross(dir, ab)
    if (Math.abs(den) < 1e-12) continue
    const ao = sub(a, origin)
    const t = cross(ao, ab) / den
    const s = cross(ao, dir) / den
    if (s >= -1e-9 && s < 1 - 1e-9) ts.push(t)
  }
  ts.sort((x, y) => x - y)
  // dedupe near-identical intersections (line passing through a vertex)
  const uniq: number[] = []
  for (const t of ts) {
    if (uniq.length === 0 || t - uniq[uniq.length - 1] > 1e-6) uniq.push(t)
  }
  const segs: Seg[] = []
  for (let i = 0; i + 1 < uniq.length; i++) {
    const t0 = uniq[i]
    const t1 = uniq[i + 1]
    if (t1 - t0 < 1e-6) continue
    const m = add(origin, mul(dir, (t0 + t1) / 2))
    if (pointInPolygon(m, poly)) {
      segs.push({ a: add(origin, mul(dir, t0)), b: add(origin, mul(dir, t1)) })
    }
  }
  return segs
}

/** Inward normal of edge i (from outline[i] to outline[i+1]), determined by point test. */
export function edgeInwardNormal(poly: Pt[], i: number): Pt {
  const a = poly[i]
  const b = poly[(i + 1) % poly.length]
  const n = norm(perp(sub(b, a)))
  const m = mid(a, b)
  const probe = add(m, mul(n, 0.02))
  return pointInPolygon(probe, poly) ? n : mul(n, -1)
}

export function edgeOutwardNormal(poly: Pt[], i: number): Pt {
  return mul(edgeInwardNormal(poly, i), -1)
}

/**
 * Inset a simple polygon by distance d (all edges offset inward, miter joins).
 * Returns null when the offset collapses or produces a degenerate result.
 * Robust for convex and rectilinear-ish shapes, which covers typical decks.
 */
export function insetPolygon(poly: Pt[], d: number): Pt[] | null {
  const n = poly.length
  if (n < 3 || d <= 0) return poly.slice()
  const bases: Pt[] = []
  const dirs: Pt[] = []
  for (let i = 0; i < n; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % n]
    const dir = norm(sub(b, a))
    const inward = edgeInwardNormal(poly, i)
    bases.push(add(a, mul(inward, d)))
    dirs.push(dir)
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n
    const p = lineIntersect(bases[prev], dirs[prev], bases[i], dirs[i])
    if (p) {
      out.push(p)
    } else {
      // parallel edges: fall back to offsetting the shared vertex
      out.push(bases[i])
    }
  }
  const a0 = Math.abs(polygonArea(poly))
  const a1 = Math.abs(polygonArea(out))
  if (a1 < 0.5 || a1 >= a0) return null
  // every inset vertex must remain inside the original polygon
  for (const p of out) {
    if (!pointInPolygon(p, poly)) return null
  }
  return out
}

export function distPointSeg(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < EPS) return dist(p, a)
  let t = dot(sub(p, a), ab) / l2
  t = Math.max(0, Math.min(1, t))
  return dist(p, add(a, mul(ab, t)))
}

/** Parameter t (0..1) of the closest point on segment ab. */
export function projOnSeg(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < EPS) return 0
  return Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
}

export function segLen(s: Seg): number {
  return dist(s.a, s.b)
}

/** Merge overlapping 1-D intervals. */
export function mergeIntervals(iv: [number, number][]): [number, number][] {
  if (iv.length === 0) return []
  const s = iv.slice().sort((a, b) => a[0] - b[0])
  const out: [number, number][] = [s[0].slice() as [number, number]]
  for (let i = 1; i < s.length; i++) {
    const last = out[out.length - 1]
    if (s[i][0] <= last[1] + 1e-9) last[1] = Math.max(last[1], s[i][1])
    else out.push(s[i].slice() as [number, number])
  }
  return out
}

/** Subtract intervals `cuts` from [lo, hi]; returns remaining pieces. */
export function subtractIntervals(lo: number, hi: number, cuts: [number, number][]): [number, number][] {
  const merged = mergeIntervals(cuts)
  const out: [number, number][] = []
  let cur = lo
  for (const [a, b] of merged) {
    if (b <= lo || a >= hi) continue
    if (a > cur) out.push([cur, Math.min(a, hi)])
    cur = Math.max(cur, b)
  }
  if (cur < hi - 1e-9) out.push([cur, hi])
  return out.filter(([a, b]) => b - a > 1e-6)
}
