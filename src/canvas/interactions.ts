import type { Pt, Tier } from '../model/types'
import {
  addStairs,
  addTierFromOutline,
  beginGesture,
  bumpOverlay,
  commit,
  deleteStairs,
  deleteTier,
  endGesture,
  moveBreaker,
  redo,
  setActiveTier,
  setSelection,
  setStatus,
  setTool,
  store,
  undo,
  updateStairs,
} from '../model/store'
import {
  add,
  dist,
  distPointSeg,
  dot,
  edgeOutwardNormal,
  mul,
  norm,
  pointInPolygon,
  polyExtent,
  polygonArea,
  projOnSeg,
  sub,
} from '../geometry/geom'
import { computeProject } from '../engine'
import { nearestStairSpot } from '../engine/stairplace'
import { parseLen } from '../ui/format'
import { screenToWorld, zoomAt, fitToPoints, type Viewport } from './viewport'
import type { HoverHit, Overlay } from './overlay'

type Drag =
  | { kind: 'pan'; startScreen: Pt; startVp: Viewport }
  | { kind: 'vertex'; tierId: string; index: number }
  | { kind: 'edge'; tierId: string; index: number; startWorld: Pt; origA: Pt; origB: Pt; normal: Pt }
  | { kind: 'tier'; tierId: string; startWorld: Pt; origOutline: Pt[] }
  | { kind: 'stairs'; stairsId: string }
  | { kind: 'breaker'; tierId: string; manualIndex: number }
  | { kind: 'measure' }

export interface InteractionApi {
  onPointerDown: (e: PointerEvent) => void
  onPointerMove: (e: PointerEvent) => void
  onPointerUp: (e: PointerEvent) => void
  onDblClick: (e: MouseEvent) => void
  onWheel: (e: WheelEvent) => void
  onKeyDown: (e: KeyboardEvent) => boolean
  zoomFit: () => void
  zoomBy: (factor: number) => void
  cancelDraft: () => void
}

export function createInteractions(
  canvas: HTMLCanvasElement,
  vpRef: { current: Viewport },
  ov: Overlay,
): InteractionApi {
  let drag: Drag | null = null

  const size = () => {
    const r = (canvas.parentElement ?? canvas).getBoundingClientRect()
    return { w: r.width, h: r.height }
  }
  const screenPt = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const toWorld = (e: { clientX: number; clientY: number }): Pt => {
    const { w, h } = size()
    return screenToWorld(vpRef.current, w, h, screenPt(e))
  }
  const tolFt = (px = 8) => px / vpRef.current.scale

  const gridSnap = (p: Pt): Pt => {
    const step = store.getState().snapIn / 12
    return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
  }

  /** Snap for drawing: vertices of existing tiers > close-first-point > 45° angle lock + grid. */
  const drawSnap = (raw: Pt): Pt => {
    const s = store.getState()
    // snap to any existing vertex
    for (const t of s.project.tiers) {
      for (const p of t.outline) {
        if (dist(p, raw) < tolFt(10)) return { ...p }
      }
    }
    if (ov.draftPts.length > 0) {
      const first = ov.draftPts[0]
      if (ov.draftPts.length >= 3 && dist(first, raw) < tolFt(12)) return { ...first }
      const last = ov.draftPts[ov.draftPts.length - 1]
      const v = sub(raw, last)
      const L = Math.hypot(v.x, v.y)
      if (L > 0.05) {
        const ang = Math.atan2(v.y, v.x)
        const snapAng = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4)
        const dir = { x: Math.cos(snapAng), y: Math.sin(snapAng) }
        const step = s.snapIn / 12
        const lenAlong = Math.max(step, Math.round((v.x * dir.x + v.y * dir.y) / step) * step)
        return { x: last.x + dir.x * lenAlong, y: last.y + dir.y * lenAlong }
      }
    }
    return gridSnap(raw)
  }

  const hitTest = (p: Pt): HoverHit | null => {
    const s = store.getState()
    const active = s.project.tiers.find((t) => t.id === s.activeTierId)
    const tol = tolFt(9)
    if (active) {
      for (let i = 0; i < active.outline.length; i++) {
        if (dist(p, active.outline[i]) < tol) return { kind: 'vertex', tierId: active.id, index: i }
      }
      for (let i = 0; i < active.outline.length; i++) {
        const a = active.outline[i]
        const b = active.outline[(i + 1) % active.outline.length]
        if (distPointSeg(p, a, b) < tol) return { kind: 'edge', tierId: active.id, index: i }
      }
    }
    const computed = computeProject(s.project)
    for (const sc of computed.stairs) {
      // footprint follows the real (possibly wrapped) flight, not its bbox
      const hitPoly = sc.footprint.length >= 3 ? sc.footprint : (sc.corners as unknown as Pt[])
      if (pointInPolygon(p, hitPoly)) return { kind: 'stairs', stairsId: sc.stairs.id }
    }
    if (active && pointInPolygon(p, active.outline)) return { kind: 'tier', tierId: active.id }
    for (let i = s.project.tiers.length - 1; i >= 0; i--) {
      const t = s.project.tiers[i]
      if (pointInPolygon(p, t.outline)) return { kind: 'tier', tierId: t.id }
    }
    return null
  }

  const nearestEdge = (p: Pt, tier: Tier): { index: number; t: number } | null => {
    let best = -1
    let bestD = tolFt(14)
    for (let i = 0; i < tier.outline.length; i++) {
      const a = tier.outline[i]
      const b = tier.outline[(i + 1) % tier.outline.length]
      const d = distPointSeg(p, a, b)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    if (best < 0) return null
    const a = tier.outline[best]
    const b = tier.outline[(best + 1) % tier.outline.length]
    return { index: best, t: projOnSeg(p, a, b) }
  }

  /** field-run axis + extent for a tier's decking (for breaker station math). */
  const fieldAxis = (tier: Tier) => {
    const computed = computeProject(store.getState().project)
    const dk = computed.byTier.get(tier.id)?.decking
    const dir = dk?.boardDir ?? { x: 1, y: 0 }
    const fp = dk?.fieldPoly ?? tier.outline
    const [d0, d1] = polyExtent(fp, dir)
    return { dir, d0, span: Math.max(0.5, d1 - d0) }
  }

  /** Manual breaker line near a world point on the active tier. */
  const breakerHit = (p: Pt): { tierId: string; manualIndex: number } | null => {
    const s = store.getState()
    const active = s.project.tiers.find((t) => t.id === s.activeTierId)
    if (!active) return null
    const computed = computeProject(s.project)
    const dk = computed.byTier.get(active.id)?.decking
    if (!dk) return null
    let best: { tierId: string; manualIndex: number } | null = null
    let bestD = tolFt(9)
    for (const bl of dk.breakerLines) {
      if (bl.manualIndex === null) continue
      const d = distPointSeg(p, bl.a, bl.b)
      if (d < bestD) {
        bestD = d
        best = { tierId: active.id, manualIndex: bl.manualIndex }
      }
    }
    return best
  }

  const closeDraft = () => {
    if (ov.draftPts.length < 3) {
      setStatus('Need at least 3 corners to close the outline.')
      return
    }
    const area = Math.abs(polygonArea(ov.draftPts))
    if (area < 2) {
      setStatus('Outline is too small — keep drawing.')
      return
    }
    addTierFromOutline(ov.draftPts.map((p) => ({ ...p })))
    ov.draftPts = []
    ov.typedBuf = ''
    setStatus('Deck outline created. Select an edge to mark the house (ledger) side.')
    bumpOverlay()
  }

  const commitTyped = () => {
    const lenVal = parseLen(ov.typedBuf)
    ov.typedBuf = ''
    if (lenVal === null || lenVal <= 0 || ov.draftPts.length === 0 || !ov.snapped) {
      bumpOverlay()
      return
    }
    const last = ov.draftPts[ov.draftPts.length - 1]
    const dir = norm(sub(ov.snapped, last))
    if (Math.hypot(dir.x, dir.y) < 0.5) return
    ov.draftPts.push(add(last, mul(dir, lenVal)))
    bumpOverlay()
  }

  const api: InteractionApi = {
    onPointerDown(e) {
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic events have no active pointer */
      }
      const s = store.getState()
      if (s.view !== 'top') return
      const world = toWorld(e)

      if (e.button === 1 || e.button === 2 || s.tool === 'pan') {
        drag = { kind: 'pan', startScreen: screenPt(e), startVp: { ...vpRef.current } }
        ov.panning = true
        bumpOverlay()
        return
      }
      if (e.button !== 0) return

      if (s.tool === 'draw') {
        const p = drawSnap(world)
        if (ov.draftPts.length >= 3 && dist(p, ov.draftPts[0]) < 1e-9) {
          closeDraft()
          return
        }
        ov.draftPts.push(p)
        ov.typedBuf = ''
        setStatus(
          ov.draftPts.length < 3
            ? 'Click to add corners. Type a length (e.g. 12\'6") + Enter for exact segments.'
            : 'Click the first corner or press Enter to close the outline.',
        )
        bumpOverlay()
        return
      }

      if (s.tool === 'stairs') {
        const active = s.project.tiers.find((t) => t.id === s.activeTierId)
        if (active) {
          const spot = nearestStairSpot(world, active, 4) // default 4' stair
          if (spot) {
            addStairs(active.id, spot.edgeIndex, spot.t)
            setStatus('Stairs added — drag anywhere around the deck; they stick to centers and corners.')
            return
          }
        }
        setStatus('Click near an open edge of the active tier to attach stairs (not the house side).')
        return
      }

      if (s.tool === 'measure') {
        ov.measureA = gridSnap(world)
        ov.measureB = null
        drag = { kind: 'measure' }
        bumpOverlay()
        return
      }

      // select tool — draggable manual breaker boards take priority
      const bh = breakerHit(world)
      if (bh) {
        beginGesture()
        drag = { kind: 'breaker', tierId: bh.tierId, manualIndex: bh.manualIndex }
        setStatus('Drag the breaker board to reposition; it stays centered by default.')
        bumpOverlay()
        return
      }
      const hit = hitTest(world)
      if (!hit) {
        setSelection({ kind: 'none' })
        bumpOverlay()
        return
      }
      if (hit.kind === 'vertex' && hit.tierId && hit.index !== undefined) {
        setSelection({ kind: 'vertex', tierId: hit.tierId, index: hit.index })
        beginGesture()
        drag = { kind: 'vertex', tierId: hit.tierId, index: hit.index }
      } else if (hit.kind === 'edge' && hit.tierId && hit.index !== undefined) {
        const t = s.project.tiers.find((x) => x.id === hit.tierId)
        if (!t) return
        setSelection({ kind: 'edge', tierId: hit.tierId, index: hit.index })
        beginGesture()
        drag = {
          kind: 'edge',
          tierId: hit.tierId,
          index: hit.index,
          startWorld: world,
          origA: { ...t.outline[hit.index] },
          origB: { ...t.outline[(hit.index + 1) % t.outline.length] },
          normal: edgeOutwardNormal(t.outline, hit.index),
        }
      } else if (hit.kind === 'stairs' && hit.stairsId) {
        setSelection({ kind: 'stairs', stairsId: hit.stairsId })
        beginGesture()
        drag = { kind: 'stairs', stairsId: hit.stairsId }
      } else if (hit.kind === 'tier' && hit.tierId) {
        const t = s.project.tiers.find((x) => x.id === hit.tierId)
        if (!t) return
        setActiveTier(hit.tierId)
        beginGesture()
        drag = { kind: 'tier', tierId: hit.tierId, startWorld: world, origOutline: t.outline.map((p) => ({ ...p })) }
      }
      bumpOverlay()
    },

    onPointerMove(e) {
      const s = store.getState()
      if (s.view !== 'top') return
      const world = toWorld(e)
      ov.cursor = world
      ov.snapped = s.tool === 'draw' ? drawSnap(world) : gridSnap(world)

      if (drag) {
        switch (drag.kind) {
          case 'pan': {
            const sp = screenPt(e)
            const d = drag
            vpRef.current = {
              ...d.startVp,
              cx: d.startVp.cx - (sp.x - d.startScreen.x) / d.startVp.scale,
              cy: d.startVp.cy - (sp.y - d.startScreen.y) / d.startVp.scale,
            }
            break
          }
          case 'vertex': {
            const d = drag
            const p = gridSnap(world)
            commit((proj) => {
              const t = proj.tiers.find((x) => x.id === d.tierId)
              if (t) t.outline[d.index] = p
            })
            break
          }
          case 'edge': {
            const d = drag
            const step = s.snapIn / 12
            const raw = sub(world, d.startWorld)
            const along = Math.round((raw.x * d.normal.x + raw.y * d.normal.y) / step) * step
            const move = mul(d.normal, along)
            commit((proj) => {
              const t = proj.tiers.find((x) => x.id === d.tierId)
              if (!t) return
              t.outline[d.index] = add(d.origA, move)
              t.outline[(d.index + 1) % t.outline.length] = add(d.origB, move)
            })
            break
          }
          case 'tier': {
            const d = drag
            const step = s.snapIn / 12
            const raw = sub(world, d.startWorld)
            const move = { x: Math.round(raw.x / step) * step, y: Math.round(raw.y / step) * step }
            commit((proj) => {
              const t = proj.tiers.find((x) => x.id === d.tierId)
              if (t) t.outline = d.origOutline.map((p) => add(p, move))
            })
            break
          }
          case 'stairs': {
            const d = drag
            const st = s.project.stairs.find((x) => x.id === d.stairsId)
            const t = st ? s.project.tiers.find((x) => x.id === st.tierId) : null
            if (st && t) {
              // stairs flow freely around the whole perimeter (never the house
              // side), sticking to edge centers and corner-flush positions
              const spot = nearestStairSpot(world, t, st.width)
              if (spot) {
                updateStairs(d.stairsId, (x) => {
                  x.edgeIndex = spot.edgeIndex
                  x.t = spot.t
                })
              }
            }
            break
          }
          case 'breaker': {
            const d = drag
            const t = store.getState().project.tiers.find((x) => x.id === d.tierId)
            if (t) {
              const { dir, d0, span } = fieldAxis(t)
              const tt = (dot(world, dir) - d0) / span
              moveBreaker(d.tierId, d.manualIndex, tt)
            }
            break
          }
          case 'measure': {
            ov.measureB = gridSnap(world)
            break
          }
        }
      } else if (s.tool === 'select' || s.tool === 'stairs') {
        const active = s.project.tiers.find((t) => t.id === s.activeTierId)
        if (s.tool === 'stairs' && active) {
          const ne = nearestEdge(world, active)
          ov.hover = ne ? { kind: 'edge', tierId: active.id, index: ne.index } : null
        } else {
          ov.hover = hitTest(world)
        }
      }
      bumpOverlay()
    },

    onPointerUp(e) {
      if (drag && drag.kind !== 'pan' && drag.kind !== 'measure') endGesture()
      drag = null
      ov.panning = false
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      bumpOverlay()
    },

    onDblClick(e) {
      const s = store.getState()
      if (s.view !== 'top' || s.tool !== 'select') return
      const world = toWorld(e)
      const hit = hitTest(world)
      if (hit?.kind === 'edge' && hit.tierId && hit.index !== undefined) {
        const idx = hit.index
        const p = gridSnap(world)
        commit((proj) => {
          const t = proj.tiers.find((x) => x.id === hit.tierId)
          if (!t) return
          t.outline.splice(idx + 1, 0, p)
          t.edges.splice(idx + 1, 0, { ...t.edges[idx] })
        })
        setSelection({ kind: 'vertex', tierId: hit.tierId, index: idx + 1 })
      }
    },

    onWheel(e) {
      e.preventDefault()
      const { w, h } = size()
      const factor = Math.pow(1.0015, -e.deltaY)
      vpRef.current = zoomAt(vpRef.current, w, h, screenPt(e), factor)
      bumpOverlay()
    },

    onKeyDown(e) {
      const s = store.getState()
      const el = document.activeElement
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return false

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) redo()
        else undo()
        return true
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        redo()
        return true
      }

      if (s.tool === 'draw') {
        if (/^[0-9.'"/ -]$/.test(e.key) && ov.draftPts.length > 0) {
          ov.typedBuf += e.key
          bumpOverlay()
          return true
        }
        if (e.key === 'Backspace') {
          if (ov.typedBuf.length > 0) ov.typedBuf = ov.typedBuf.slice(0, -1)
          else ov.draftPts.pop()
          bumpOverlay()
          return true
        }
        if (e.key === 'Enter') {
          if (ov.typedBuf) commitTyped()
          else closeDraft()
          return true
        }
        if (e.key === 'Escape') {
          if (ov.draftPts.length > 0) {
            ov.draftPts = []
            ov.typedBuf = ''
          } else {
            setTool('select')
          }
          bumpOverlay()
          return true
        }
      }

      if (e.key === 'Escape') {
        ov.measureA = null
        ov.measureB = null
        setSelection({ kind: 'none' })
        bumpOverlay()
        return true
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const sel = s.selection
        if (sel.kind === 'vertex') {
          commit((proj) => {
            const t = proj.tiers.find((x) => x.id === sel.tierId)
            if (t && t.outline.length > 3) {
              t.outline.splice(sel.index, 1)
              t.edges.splice(sel.index, 1)
            }
          })
          setSelection({ kind: 'none' })
          return true
        }
        if (sel.kind === 'stairs') {
          deleteStairs(sel.stairsId)
          return true
        }
        if (sel.kind === 'tier') {
          deleteTier(sel.tierId)
          return true
        }
      }
      const keyTool: Record<string, typeof s.tool> = { v: 'select', d: 'draw', s: 'stairs', m: 'measure', h: 'pan' }
      const lower = e.key.toLowerCase()
      if (keyTool[lower] && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setTool(keyTool[lower])
        return true
      }
      if (lower === 'f') {
        api.zoomFit()
        return true
      }
      return false
    },

    zoomFit() {
      const s = store.getState()
      const pts: Pt[] = []
      for (const t of s.project.tiers) pts.push(...t.outline)
      const computed = computeProject(s.project)
      for (const sc of computed.stairs) pts.push(...sc.corners)
      const { w, h } = size()
      vpRef.current = fitToPoints(pts, w, h)
      bumpOverlay()
    },

    zoomBy(factor) {
      const { w, h } = size()
      vpRef.current = zoomAt(vpRef.current, w, h, { x: w / 2, y: h / 2 }, factor)
      bumpOverlay()
    },

    cancelDraft() {
      ov.draftPts = []
      ov.typedBuf = ''
      bumpOverlay()
    },
  }
  return api
}
