import type { Pt, Tier } from '../model/types'
import { dist, lerp } from '../geometry/geom'
import { arcOf, edgeLengths, isConvexCorner, posAt } from './perimeter'

/**
 * Free stair placement around the deck perimeter.
 *
 * A dragged stair follows the cursor to the closest point on any non-ledger
 * edge and can slide straight across corners — crossing a corner is what makes
 * it wrap. Magnets absorb hand wobble so near-misses land clean:
 *   • edge centers
 *   • corner-centered (the stair wraps the corner symmetrically)
 *   • corner-flush (the span just touches the corner — no wrap)
 */
export interface StairSpot {
  edgeIndex: number
  /** center position along that edge, 0..1 */
  t: number
  snapped: 'center' | 'corner' | 'corner-flush' | null
}

/** ft of slop the magnets absorb (also used by the engine's endpoint snap) */
export const STAIR_SNAP_FT = 0.6

export function nearestStairSpot(world: Pt, tier: Tier, stairWidthFt: number): StairSpot | null {
  const n = tier.outline.length
  const lens = edgeLengths(tier)

  // closest point on any open (non-ledger) edge
  let best: { edgeIndex: number; t: number; d: number } | null = null
  for (let i = 0; i < n; i++) {
    if (tier.edges[i]?.ledger) continue
    if (lens[i] < 1) continue
    const a = tier.outline[i]
    const b = tier.outline[(i + 1) % n]
    const tt = Math.max(0, Math.min(1, ((world.x - a.x) * (b.x - a.x) + (world.y - a.y) * (b.y - a.y)) / (lens[i] * lens[i])))
    const p = lerp(a, b, tt)
    const d = dist(world, p)
    if (!best || d < best.d) best = { edgeIndex: i, t: tt, d }
  }
  if (!best) return null

  const P = lens.reduce((a, b) => a + b, 0)
  let s = arcOf(tier, best.edgeIndex, best.t)
  const half = stairWidthFt / 2

  // magnet candidates in arc space
  const magnets: { s: number; kind: StairSpot['snapped'] }[] = []
  let acc = 0
  for (let i = 0; i < n; i++) {
    const cornerArc = acc
    const prevEdge = (i - 1 + n) % n
    const prevOpen = !tier.edges[prevEdge]?.ledger
    const thisOpen = !tier.edges[i]?.ledger
    // corner-centered wrap: only where a wrap is even possible — an outside
    // corner between two open edges
    if (prevOpen && thisOpen && isConvexCorner(tier, i)) magnets.push({ s: cornerArc, kind: 'corner' })
    // flush against this corner — span just touches it, no wrap — offered
    // from whichever side is open
    if (thisOpen) magnets.push({ s: cornerArc + half, kind: 'corner-flush' })
    if (prevOpen) magnets.push({ s: cornerArc - half, kind: 'corner-flush' })
    if (thisOpen) magnets.push({ s: acc + lens[i] / 2, kind: 'center' })
    acc += lens[i]
  }

  let snapped: StairSpot['snapped'] = null
  let bestPull = STAIR_SNAP_FT
  for (const m of magnets) {
    for (const cand of [m.s, m.s + P, m.s - P]) {
      const pull = Math.abs(s - cand)
      if (pull < bestPull) {
        bestPull = pull
        snapped = m.kind
        s = ((cand % P) + P) % P
      }
    }
  }

  let pos = posAt(tier, s)
  // posAt is ambiguous exactly at corners (previous edge, t = 1) — prefer the
  // start of the following edge, and never store the ledger side
  if (pos.t >= 0.999 && !tier.edges[(pos.edgeIndex + 1) % n]?.ledger) {
    pos = { ...pos, edgeIndex: (pos.edgeIndex + 1) % n, t: 0 }
  }
  if (tier.edges[pos.edgeIndex]?.ledger) {
    if (pos.t <= 0.001) pos = { ...pos, edgeIndex: (pos.edgeIndex - 1 + n) % n, t: 1 }
    else if (pos.t >= 0.999) pos = { ...pos, edgeIndex: (pos.edgeIndex + 1) % n, t: 0 }
  }
  return { edgeIndex: pos.edgeIndex, t: Math.round(pos.t * 1000) / 1000, snapped }
}
