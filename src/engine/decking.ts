import type { Pt, Tier } from '../model/types'
import {
  add,
  clipLineToPoly,
  dot,
  insetPolygon,
  mul,
  polyExtent,
  polygonArea,
} from '../geometry/geom'
import { resolveDecking } from '../catalog/compat'

export interface Board {
  a: Pt
  b: Pt
  widthIn: number
  kind: 'field' | 'frame' | 'breaker'
  len: number
  /**
   * Long edges with no neighbouring board to share a hidden clip with — the
   * outermost row of the field. Those edges are face-screwed instead of clipped.
   * 0 for interior boards, 1 for the first/last row, 2 for a single-row field.
   */
  faceEdges?: number
}

export interface DeckingResult {
  boards: Board[]
  fieldPoly: Pt[] | null
  areaSqft: number
  /** stations along the joist u-axis where breaker boards need flanking support joists */
  breakerUs: number[]
  /** cut lengths (ft) for field + breaker boards */
  fieldCuts: number[]
  /** cut lengths (ft) for picture-frame boards (color-matched, mitred) */
  frameCuts: number[]
  insetFailed: boolean
  /** false when boards run parallel to joists (unsupported) */
  boardDirOk: boolean
  maxSegLen: number
  boardDir: Pt
  /** resolved from catalog */
  boardWidthIn: number
  gapIn: number
  /** picture-frame border board width (in) — may be wider than the field board */
  pfBoardWidthIn: number
  /** border ring pitch (border width + gap), ft — ring seams sit at k × this */
  pfPitchFt: number
  /** field-board ends that butt a breaker seam — each is face-screwed */
  breakerButtEnds: number
  /** breaker board centerlines for hit-testing / dragging (manualIndex→config) */
  breakerLines: { t: number; a: Pt; b: Pt; manualIndex: number | null }[]
  /** true when the board direction supports breaker boards (perpendicular to joists) */
  breakersAllowed: boolean
}

export function computeDecking(tier: Tier): DeckingResult {
  const d = tier.decking
  const { profile, pfProfile, fastener } = resolveDecking(tier)
  const boardWidth = profile.widthIn
  const pfWidth = pfProfile.widthIn
  const gap = fastener.gapIn
  const poly = tier.outline
  const res: DeckingResult = {
    boards: [],
    fieldPoly: null,
    areaSqft: Math.abs(polygonArea(poly)),
    breakerUs: [],
    fieldCuts: [],
    frameCuts: [],
    insetFailed: false,
    boardDirOk: true,
    maxSegLen: 0,
    boardDir: { x: 1, y: 0 },
    boardWidthIn: boardWidth,
    gapIn: gap,
    pfBoardWidthIn: pfWidth,
    pfPitchFt: (pfWidth + gap) / 12,
    breakerButtEnds: 0,
    breakerLines: [],
    breakersAllowed: false,
  }
  if (poly.length < 3) return res

  const rad = (d.angle * Math.PI) / 180
  const dir: Pt = { x: Math.cos(rad), y: -Math.sin(rad) } // 0=E-W, 90=N-S, 45=NE-SW
  const perpDir: Pt = { x: -dir.y, y: dir.x }
  res.boardDir = dir

  // boards parallel to joists have nothing to land on
  const joistV: Pt = tier.framing.joistDir === 90 ? { x: 0, y: 1 } : { x: 1, y: 0 }
  if (Math.abs(dot(dir, joistV)) > 0.99) res.boardDirOk = false

  const pitch = (boardWidth + gap) / 12
  const halfW = boardWidth / 24
  // border rings step by the BORDER board's own pitch — a 1x8 border insets the
  // field 7-1/4"+gap per ring, and the framing below follows the same stations
  const pfPitch = res.pfPitchFt

  // ---- picture frame ----
  let field: Pt[] | null = poly
  if (d.pictureFrame > 0) {
    field = insetPolygon(poly, d.pictureFrame * pfPitch)
    if (!field) {
      res.insetFailed = true
      field = poly
    } else {
      for (let ring = 0; ring < d.pictureFrame; ring++) {
        const centerInset = (ring + 0.5) * pfPitch
        const ringPoly = insetPolygon(poly, centerInset)
        if (!ringPoly) {
          res.insetFailed = true
          continue
        }
        for (let i = 0; i < ringPoly.length; i++) {
          const a = ringPoly[i]
          const b = ringPoly[(i + 1) % ringPoly.length]
          const len = Math.hypot(b.x - a.x, b.y - a.y)
          if (len < 0.15) continue
          res.boards.push({ a, b, widthIn: pfWidth, kind: 'frame', len })
          // mitre allowance: one board-width per end
          res.frameCuts.push(len + pfWidth / 12)
        }
      }
    }
  }
  res.fieldPoly = field

  // ---- breaker boards ----
  // Only when boards run perpendicular to the joists (the seam then sits over
  // a doubled joist). Diagonal fields rely on stock length instead.
  const uAxis: Pt = tier.framing.joistDir === 90 ? { x: 1, y: 0 } : { x: 0, y: 1 }
  const boardsPerpToJoists = Math.abs(dot(dir, uAxis)) > 0.99
  res.breakersAllowed = boardsPerpToJoists
  const stockLens = d.stockLengths.length > 0 ? d.stockLengths : profile.lengthsFt
  const maxStock = Math.max(...stockLens)
  const [d0, d1] = polyExtent(field, dir)
  const fieldSpan = d1 - d0
  const breakerBands: [number, number][] = []
  if (boardsPerpToJoists && fieldSpan > 0.5) {
    // gather breaker stations (absolute along dir): auto (at stock limit) + manual
    const stationTs: { t: number; manualIndex: number | null }[] = []
    if (d.breakers === 'auto' && fieldSpan > maxStock) {
      const nb = Math.ceil(fieldSpan / maxStock) - 1
      for (let j = 1; j <= nb; j++) stationTs.push({ t: j / (nb + 1), manualIndex: null })
    }
    ;(d.breakerStations ?? []).forEach((t, idx) => {
      if (t > 0.02 && t < 0.98) stationTs.push({ t, manualIndex: idx })
    })
    stationTs.sort((x, y) => x.t - y.t)
    for (const { t, manualIndex } of stationTs) {
      const s = d0 + fieldSpan * t
      breakerBands.push([s - pitch / 2, s + pitch / 2])
      const segs = clipLineToPoly(field, mul(dir, s), perpDir)
      for (const sg of segs) {
        const len = Math.hypot(sg.b.x - sg.a.x, sg.b.y - sg.a.y)
        if (len < 0.15) continue
        res.boards.push({ a: sg.a, b: sg.b, widthIn: boardWidth, kind: 'breaker', len })
        res.fieldCuts.push(len)
        res.breakerLines.push({ t, a: sg.a, b: sg.b, manualIndex })
      }
      // u station for joist doubling
      res.breakerUs.push(dot(mul(dir, s), uAxis))
    }
  }

  // ---- field rows ----
  const [p0, p1] = polyExtent(field, perpDir)
  const rowCs: number[] = []
  for (let c = p0 + halfW; c < p1 + pitch - halfW - 1e-6; c += pitch) {
    if (c - halfW > p1 - 0.02) break
    rowCs.push(c)
  }
  for (let ri = 0; ri < rowCs.length; ri++) {
    const c = rowCs[ri]
    // the field's outermost rows have a long edge with nothing to clip into
    const faceEdges = rowCs.length === 1 ? 2 : ri === 0 || ri === rowCs.length - 1 ? 1 : 0
    const segs = clipLineToPoly(field, mul(perpDir, c), dir)
    for (const sg of segs) {
      // split at breaker bands (positions measured along `dir`)
      const ta = dot(sg.a, dir)
      const tb = dot(sg.b, dir)
      const lo = Math.min(ta, tb)
      const hi = Math.max(ta, tb)
      const pieces: [number, number][] = []
      let bandsHit = 0
      if (breakerBands.length > 0) {
        let cur = lo
        for (const [ba, bb] of breakerBands) {
          if (bb <= lo || ba >= hi) continue
          bandsHit++
          if (ba > cur) pieces.push([cur, ba])
          cur = Math.max(cur, bb)
        }
        if (cur < hi - 1e-6) pieces.push([cur, hi])
      } else {
        pieces.push([lo, hi])
      }
      // each breaker crossing this row leaves a board end on both sides of it
      res.breakerButtEnds += bandsHit * 2
      const base = mul(perpDir, c)
      for (const [a0, b0] of pieces) {
        const len = b0 - a0
        if (len < 0.15) continue
        const pa = add(base, mul(dir, a0))
        const pb = add(base, mul(dir, b0))
        res.boards.push({ a: pa, b: pb, widthIn: boardWidth, kind: 'field', len, faceEdges })
        res.fieldCuts.push(len)
        res.maxSegLen = Math.max(res.maxSegLen, len)
      }
    }
  }

  return res
}

import type { FastenerSystem } from '../catalog/timbertech'

export interface FastenerCounts {
  /** hidden fasteners: clips (CONCEALoc/EDGELoc), side screws (SIDELoc), or tongue screws */
  hidden: number
  /** exposed/plugged top screws: field for top-down systems + start/end/perimeter screws */
  topScrews: number
  /** Cortex plugs */
  plugs: number
  /** composite face screws for picture-frame + breaker boards (always face-fastened) */
  frameScrews: number
  label: string
}

/**
 * Count fasteners per the selected system. Boards fasten at every joist
 * crossing (min 2 per board). Hidden-clip systems still need top screws at
 * picture frames, breaker boards and cut ends (rudimentary install model —
 * refine with manufacturer install guides).
 */
export function countFasteners(
  decking: DeckingResult,
  fastener: FastenerSystem,
  joistUs: number[],
  joistDir: 0 | 90,
  spacingFt: number,
): FastenerCounts {
  const uAxis: Pt = joistDir === 90 ? { x: 1, y: 0 } : { x: 0, y: 1 }
  const sorted = [...joistUs].sort((a, b) => a - b)
  const crossingsFor = (a: Pt, b: Pt, len: number): number => {
    const ua = dot(a, uAxis)
    const ub = dot(b, uAxis)
    const lo = Math.min(ua, ub)
    const hi = Math.max(ua, ub)
    if (hi - lo > 0.2) {
      let n = 0
      for (const uu of sorted) {
        if (uu >= lo - 0.05 && uu <= hi + 0.05) n++
      }
      return Math.max(2, n)
    }
    // roughly parallel to joists (e.g. breaker): screwed into its flanking
    // support joists at roughly joist-spacing intervals along its length
    return Math.max(2, Math.ceil(len / spacingFt))
  }

  let hidden = 0
  let topScrews = 0
  let frameScrews = 0
  const topDown = fastener.fieldTopScrews // cortex / toploc

  for (const bd of decking.boards) {
    const cross = crossingsFor(bd.a, bd.b, bd.len)
    if (bd.kind === 'frame' || bd.kind === 'breaker') {
      // picture-frame + breaker/parting boards are ALWAYS face-fastened with
      // composite screws (2 per joist crossing, one at each board edge)
      frameScrews += Math.max(4, cross * 2)
    } else {
      // every deck board is fastened at each joist on BOTH long edges. Edges
      // shared with a neighbouring board take a hidden clip; the field's
      // outermost edges have no neighbour, so they are face-screwed.
      if (topDown) {
        topScrews += cross * 2
      } else {
        const faceEdges = bd.faceEdges ?? 0
        hidden += cross * (2 - faceEdges)
        topScrews += cross * faceEdges
      }
    }
  }
  if (!topDown) {
    // every field-board end butting a breaker seam is face-screwed (2 per end)
    frameScrews += decking.breakerButtEnds * 2
  }

  const plugs = fastener.method === 'top-screw-plug' ? topScrews + frameScrews : 0
  const label =
    fastener.method === 'hidden-clip'
      ? 'clips'
      : fastener.method === 'side-screw'
        ? 'side screws'
        : fastener.method === 'tongue-screw'
          ? 'tongue screws'
          : 'screws'
  return { hidden, topScrews, plugs, frameScrews, label }
}
