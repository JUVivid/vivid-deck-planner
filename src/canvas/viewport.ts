import type { Pt } from '../model/types'
import { bbox } from '../geometry/geom'

export interface Viewport {
  /** world center, ft */
  cx: number
  cy: number
  /** px per ft */
  scale: number
}

export function worldToScreen(vp: Viewport, w: number, h: number, p: Pt): Pt {
  return { x: (p.x - vp.cx) * vp.scale + w / 2, y: (p.y - vp.cy) * vp.scale + h / 2 }
}

export function screenToWorld(vp: Viewport, w: number, h: number, p: Pt): Pt {
  return { x: (p.x - w / 2) / vp.scale + vp.cx, y: (p.y - h / 2) / vp.scale + vp.cy }
}

export function zoomAt(vp: Viewport, w: number, h: number, screenPt: Pt, factor: number): Viewport {
  const before = screenToWorld(vp, w, h, screenPt)
  const scale = Math.max(2, Math.min(240, vp.scale * factor))
  const after = screenToWorld({ ...vp, scale }, w, h, screenPt)
  return { cx: vp.cx + (before.x - after.x), cy: vp.cy + (before.y - after.y), scale }
}

export function fitToPoints(pts: Pt[], w: number, h: number, pad = 80): Viewport {
  if (pts.length === 0) return { cx: 10, cy: 8, scale: 24 }
  const { min, max } = bbox(pts)
  const spanX = Math.max(4, max.x - min.x)
  const spanY = Math.max(4, max.y - min.y)
  const availW = Math.max(60, w - pad * 2)
  const availH = Math.max(60, h - pad * 2)
  const scale = Math.max(4, Math.min(availW / spanX, availH / spanY, 60))
  return { cx: (min.x + max.x) / 2, cy: (min.y + max.y) / 2, scale }
}
