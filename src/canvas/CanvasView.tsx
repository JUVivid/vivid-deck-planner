import { useEffect, useRef } from 'react'
import { store, useApp } from '../model/store'
import { computeProject } from '../engine'
import { renderPlan } from './planRenderer'
import { renderElevation } from './elevationRenderer'
import { newOverlay } from './overlay'
import { createInteractions, type InteractionApi } from './interactions'
import type { Viewport } from './viewport'

export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const vpRef = useRef<Viewport>({ cx: 11, cy: 9, scale: 30 })
  const ovRef = useRef(newOverlay())
  const apiRef = useRef<InteractionApi | null>(null)
  const tool = useApp((s) => s.tool)
  const view = useApp((s) => s.view)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    let rafPending = false
    const draw = () => {
      rafPending = false
      const s = store.getState()
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const w = Math.max(50, rect.width)
      const h = Math.max(50, rect.height)
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr)
        canvas.height = Math.round(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const computed = computeProject(s.project)
      if (s.view === 'top') {
        renderPlan(ctx, w, h, s, computed, vpRef.current, ovRef.current)
      } else {
        renderElevation(ctx, w, h, s, computed, s.view)
      }
    }
    const requestDraw = () => {
      if (!rafPending) {
        rafPending = true
        // rAF is suspended in hidden tabs — fall back to a timer so the
        // canvas is always current when the tab becomes visible again
        if (document.visibilityState === 'hidden') setTimeout(draw, 32)
        else requestAnimationFrame(draw)
      }
    }
    ;(window as unknown as { __vdpDraw?: () => void }).__vdpDraw = draw
    // debug/support hook: direct viewport control for automated visual checks
    ;(window as unknown as { __vdpView?: { vp: typeof vpRef; draw: () => void } }).__vdpView = { vp: vpRef, draw }

    const api = createInteractions(canvas, vpRef, ovRef.current)
    apiRef.current = api

    // keep the deck fitted on layout changes until the user pans/zooms themselves
    let userNavigated = false
    const markNavigated = () => {
      userNavigated = true
    }
    canvas.addEventListener('pointerdown', markNavigated, { capture: true })
    canvas.addEventListener('wheel', markNavigated, { capture: true, passive: true })

    const unsub = store.subscribe(requestDraw)
    const ro = new ResizeObserver(() => {
      if (!userNavigated) api.zoomFit()
      requestDraw()
    })
    ro.observe(wrap)

    const onWheel = (e: WheelEvent) => api.onWheel(e)
    const onKey = (e: KeyboardEvent) => {
      if (api.onKeyDown(e)) e.preventDefault()
    }
    const onCtx = (e: Event) => e.preventDefault()
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onCtx)
    window.addEventListener('keydown', onKey)

    // initial fit (works even when the tab starts hidden)
    const kickoff = () => {
      api.zoomFit()
      requestDraw()
    }
    if (document.visibilityState === 'hidden') setTimeout(kickoff, 50)
    else requestAnimationFrame(kickoff)
    const onVis = () => requestDraw()
    document.addEventListener('visibilitychange', onVis)

    return () => {
      unsub()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      canvas.removeEventListener('pointerdown', markNavigated, { capture: true })
      canvas.removeEventListener('wheel', markNavigated, { capture: true })
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onCtx)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const cursor =
    view !== 'top'
      ? 'default'
      : tool === 'pan'
        ? 'grab'
        : tool === 'draw' || tool === 'stairs' || tool === 'measure'
          ? 'crosshair'
          : 'default'

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas
        id="plan-canvas"
        ref={canvasRef}
        style={{ cursor }}
        onPointerDown={(e) => apiRef.current?.onPointerDown(e.nativeEvent)}
        onPointerMove={(e) => apiRef.current?.onPointerMove(e.nativeEvent)}
        onPointerUp={(e) => apiRef.current?.onPointerUp(e.nativeEvent)}
        onDoubleClick={(e) => apiRef.current?.onDblClick(e.nativeEvent)}
      />
      {view === 'top' && (
        <div className="zoom-controls">
          <button title="Zoom in" onClick={() => apiRef.current?.zoomBy(1.25)}>
            +
          </button>
          <button title="Zoom out" onClick={() => apiRef.current?.zoomBy(0.8)}>
            −
          </button>
          <button title="Fit to deck (F)" onClick={() => apiRef.current?.zoomFit()}>
            ⤢
          </button>
        </div>
      )}
    </div>
  )
}
