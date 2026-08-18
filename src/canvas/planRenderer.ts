import type { AppState } from '../model/store'
import type { Pt, Tier } from '../model/types'
import type { ProjectComputed } from '../engine'
import { add, dist, dot, edgeOutwardNormal, lerp, mul, norm, perp, sub } from '../geometry/geom'
import { resolveDecking } from '../catalog/compat'
import { RAILING_SYSTEMS, railSystemById, resolvePost } from '../catalog/timbertech'
import { ftInlabel } from '../ui/format'
import { worldToScreen, type Viewport } from './viewport'
import type { Overlay } from './overlay'

const C = {
  bg: '#fafaf8',
  gridMinor: '#edece6',
  gridMajor: '#dcdad2',
  tierFill: '#f5f0e6',
  tierStroke: '#b3aa98',
  boardField: '#eae0cc',
  boardFrame: '#ddcda9',
  boardBreaker: '#cdb794',
  joist: '#98a0aa',
  joistDouble: '#6f7a86',
  ledger: '#c0392b',
  rim: '#4d5766',
  beam: '#d97706',
  post: '#8a4b0f',
  footing: '#9aa1ab',
  blocking: '#b3bac2',
  hanger: '#2563eb',
  tie: '#059669',
  railing: '#2f6fd6',
  stairs: '#3f4753',
  dim: '#8a8577',
  select: '#f59e0b',
  house: '#e7e5e0',
  houseLine: '#6b7280',
  text: '#3f3a30',
}

export function renderPlan(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: AppState,
  computed: ProjectComputed,
  vp: Viewport,
  ov: Overlay,
) {
  const W = (p: Pt) => worldToScreen(vp, w, h, p)
  const s = vp.scale
  ctx.save()
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, w, h)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'butt'

  // ---------- grid ----------
  if (state.layers.grid) {
    const topLeft = { x: vp.cx - w / 2 / s, y: vp.cy - h / 2 / s }
    const botRight = { x: vp.cx + w / 2 / s, y: vp.cy + h / 2 / s }
    const drawGrid = (step: number, color: string, width: number) => {
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.beginPath()
      for (let x = Math.floor(topLeft.x / step) * step; x <= botRight.x; x += step) {
        const sx = W({ x, y: 0 }).x
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, h)
      }
      for (let y = Math.floor(topLeft.y / step) * step; y <= botRight.y; y += step) {
        const sy = W({ x: 0, y }).y
        ctx.moveTo(0, sy)
        ctx.lineTo(w, sy)
      }
      ctx.stroke()
    }
    if (s >= 10) drawGrid(1, C.gridMinor, 1)
    drawGrid(5, C.gridMajor, 1)
  }

  const line = (a: Pt, b: Pt) => {
    const A = W(a)
    const B = W(b)
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(B.x, B.y)
    ctx.stroke()
  }
  const polyPath = (pts: Pt[]) => {
    ctx.beginPath()
    pts.forEach((p, i) => {
      const q = W(p)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    })
    ctx.closePath()
  }
  const label = (text: string, p: Pt, opts: { size?: number; color?: string; angle?: number; dy?: number } = {}) => {
    const q = W(p)
    ctx.save()
    ctx.translate(q.x, q.y + (opts.dy ?? 0))
    if (opts.angle) ctx.rotate(opts.angle)
    ctx.font = `${opts.size ?? 11}px ui-sans-serif, system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(250,250,248,0.9)'
    ctx.strokeText(text, 0, 0)
    ctx.fillStyle = opts.color ?? C.text
    ctx.fillText(text, 0, 0)
    ctx.restore()
  }

  // ---------- house bands along ledger edges ----------
  for (const tier of state.project.tiers) {
    for (let i = 0; i < tier.outline.length; i++) {
      if (!tier.edges[i]?.ledger) continue
      const a = tier.outline[i]
      const b = tier.outline[(i + 1) % tier.outline.length]
      const out = mul(edgeOutwardNormal(tier.outline, i), 1)
      const depth = 1.1
      const p1 = add(a, mul(out, depth))
      const p2 = add(b, mul(out, depth))
      ctx.fillStyle = C.house
      polyPath([a, b, p2, p1])
      ctx.fill()
      // hatch
      ctx.save()
      polyPath([a, b, p2, p1])
      ctx.clip()
      ctx.strokeStyle = '#d5d3cd'
      ctx.lineWidth = 1
      const L = dist(a, b)
      const dirE = norm(sub(b, a))
      for (let t = 0; t < L + depth; t += 0.75) {
        const q0 = add(a, mul(dirE, t))
        const q1 = add(add(a, mul(dirE, t - depth)), mul(out, depth))
        line(q0, q1)
      }
      ctx.restore()
      ctx.strokeStyle = C.houseLine
      ctx.lineWidth = Math.max(2.5, 0.35 * s)
      line(a, b)
      if (L * s > 90) label('EXISTING STRUCTURE', add(mul(add(a, b), 0.5), mul(out, depth / 2)), { color: '#8b8f98', size: 10 })
    }
  }

  // ---------- tiers (lowest first so upper tiers draw on top) ----------
  const tiers = [...state.project.tiers].sort((x, y) => x.height - y.height)
  for (const tier of tiers) {
    const isActive = tier.id === state.activeTierId
    const parts = computed.byTier.get(tier.id)
    ctx.save()
    ctx.globalAlpha = isActive ? 1 : 0.55

    // platform fill
    ctx.fillStyle = C.tierFill
    polyPath(tier.outline)
    ctx.fill()

    // decking
    if (state.layers.decking && parts) {
      for (const bd of parts.decking.boards) {
        const wpx = Math.max(1, (bd.widthIn / 12) * s - Math.max(0.5, 0.02 * s))
        ctx.strokeStyle = bd.kind === 'frame' ? C.boardFrame : bd.kind === 'breaker' ? C.boardBreaker : C.boardField
        ctx.lineWidth = wpx
        line(bd.a, bd.b)
      }
      // picture-frame 45° miter joints at each corner
      if (tier.decking.pictureFrame > 0 && !parts.decking.insetFailed) {
        const depth = tier.decking.pictureFrame * parts.decking.pfPitchFt
        ctx.strokeStyle = '#b58a52'
        ctx.lineWidth = 1
        const nOut = tier.outline.length
        for (let i = 0; i < nOut; i++) {
          const prev = (i + nOut - 1) % nOut
          const inA = mul(edgeOutwardNormal(tier.outline, prev), -1)
          const inB = mul(edgeOutwardNormal(tier.outline, i), -1)
          const bis = norm(add(inA, inB))
          if (bis.x === 0 && bis.y === 0) continue
          line(tier.outline[i], add(tier.outline[i], mul(bis, depth * 1.414)))
        }
      }
      // manual breaker handles (draggable) — diamond at the board's midpoint
      if (isActive) {
        for (const bl of parts.decking.breakerLines) {
          if (bl.manualIndex === null) continue
          const m = W(mul(add(bl.a, bl.b), 0.5))
          ctx.fillStyle = '#8a4b0f'
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.2
          ctx.beginPath()
          ctx.moveTo(m.x, m.y - 6)
          ctx.lineTo(m.x + 6, m.y)
          ctx.lineTo(m.x, m.y + 6)
          ctx.lineTo(m.x - 6, m.y)
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }
    }

    // framing
    if (state.layers.framing && parts) {
      const fr = parts.framing
      // joists — added seam-support joists (breaker pairs, picture-frame) are
      // real members and draw in their own color so the support reads clearly
      for (const j of fr.joists) {
        ctx.strokeStyle = j.kind === 'breaker' ? '#7a5a2e' : j.kind === 'pf' ? '#5f9ea0' : C.joist
        ctx.lineWidth = Math.max(1, 0.125 * s) * (j.kind === 'field' ? 1 : 1.25)
        line(j.a, j.b)
      }
      // blocking — drawn on top of joists, solid & clear (between-joist members)
      ctx.strokeStyle = C.blocking
      ctx.lineWidth = Math.max(1.5, 0.14 * s)
      for (const row of fr.blocking) for (const sg of row.segs) line(sg.a, sg.b)
      // picture-frame border blocking (distinct green-gray)
      if (fr.pfBlocking.length > 0) {
        ctx.strokeStyle = '#5f9ea0'
        ctx.lineWidth = Math.max(1.5, 0.14 * s)
        for (const row of fr.pfBlocking) for (const sg of row.segs) line(sg.a, sg.b)
      }
      // beams
      ctx.strokeStyle = C.beam
      for (const bm of fr.beams) {
        ctx.lineWidth = Math.max(2.5, ((tier.framing.beamPly * 1.5) / 12) * s)
        line(bm.seg.a, bm.seg.b)
      }
      // ledger / rim
      ctx.strokeStyle = C.rim
      ctx.lineWidth = Math.max(1.5, 0.125 * s)
      for (const sg of fr.rimSegs) line(sg.a, sg.b)
      ctx.strokeStyle = C.ledger
      ctx.lineWidth = Math.max(2.5, 0.15 * s)
      for (const sg of fr.ledgerSegs) line(sg.a, sg.b)
      // footings below posts
      for (const ftg of fr.footings) {
        const q = W(ftg.p)
        ctx.strokeStyle = C.footing
        ctx.lineWidth = 1.2
        ctx.setLineDash([4, 3])
        ctx.beginPath()
        ctx.arc(q.x, q.y, Math.max(5, (ftg.diaIn / 24) * s), 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
      }
      // posts
      for (const post of fr.posts) {
        const q = W(post.p)
        const half = Math.max(3, (5.5 / 24) * s)
        ctx.fillStyle = C.post
        ctx.fillRect(q.x - half, q.y - half, half * 2, half * 2)
      }
      // beam labels
      if (state.layers.labels && s > 7) {
        for (const bm of fr.beams) {
          label(`(${tier.framing.beamPly}) ${tier.framing.beamSize} BEAM`, mul(add(bm.seg.a, bm.seg.b), 0.5), {
            color: C.beam,
            size: 10,
            dy: -Math.max(6, ((tier.framing.beamPly * 1.5) / 24) * s + 8),
          })
        }
      }
    }

    // hardware markers
    if (state.layers.hardware && parts) {
      const fr = parts.framing
      ctx.lineWidth = 1.4
      for (const p of fr.hangers) {
        const q = W(p)
        ctx.strokeStyle = C.hanger
        ctx.strokeRect(q.x - 3, q.y - 3, 6, 6)
      }
      for (const p of fr.ties) {
        const q = W(p)
        ctx.strokeStyle = C.tie
        ctx.beginPath()
        ctx.moveTo(q.x, q.y - 4)
        ctx.lineTo(q.x + 4, q.y + 3)
        ctx.lineTo(q.x - 4, q.y + 3)
        ctx.closePath()
        ctx.stroke()
      }
    }

    // deck fastener locations: top screws (dots) & hidden clips (ticks) at joist crossings
    if (state.layers.hardware && state.layers.decking && parts && s >= 13) {
      const rd = resolveDecking(tier)
      const uAxis: Pt = tier.framing.joistDir === 90 ? { x: 1, y: 0 } : { x: 0, y: 1 }
      const joistUs = parts.framing.joistUs
      for (const bd of parts.decking.boards) {
        const ua = dot(bd.a, uAxis)
        const ub = dot(bd.b, uAxis)
        const lo = Math.min(ua, ub)
        const hi = Math.max(ua, ub)
        if (hi - lo < 0.2) {
          // breaker board (parallel to joists): screw pairs into its flanking
          // support joists at joist-spacing intervals along its length
          const dirB = norm(sub(bd.b, bd.a))
          const acrossB = perp(dirB)
          const spacingFt = tier.framing.spacing / 12
          const n = Math.max(2, Math.ceil(bd.len / spacingFt))
          ctx.fillStyle = '#92400e'
          for (let i2 = 0; i2 < n; i2++) {
            const c0 = lerp(bd.a, bd.b, n === 1 ? 0.5 : i2 / (n - 1))
            for (const sgn of [-1, 1]) {
              const q = W(add(c0, mul(acrossB, (sgn * bd.widthIn) / 48)))
              ctx.beginPath()
              ctx.arc(q.x, q.y, 2, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          continue
        }
        const across = perp(norm(sub(bd.b, bd.a)))
        const offFt = bd.widthIn / 48 // quarter of the board width
        const topScrewed = bd.kind !== 'field' || rd.fastener.fieldTopScrews
        for (const uu of joistUs) {
          if (uu < lo - 0.03 || uu > hi + 0.03) continue
          const t = (uu - ua) / (ub - ua || 1)
          if (t < -0.01 || t > 1.01) continue
          const c0 = lerp(bd.a, bd.b, Math.max(0, Math.min(1, t)))
          if (topScrewed) {
            ctx.fillStyle = bd.kind === 'field' ? '#b45309' : '#92400e'
            for (const sgn of [-1, 1]) {
              const q = W(add(c0, mul(across, sgn * offFt)))
              ctx.beginPath()
              ctx.arc(q.x, q.y, 2, 0, Math.PI * 2)
              ctx.fill()
            }
          } else {
            // hidden clips sit in the groove on BOTH edges of the board (2 per joist)
            ctx.fillStyle = C.hanger
            for (const sgn of [-1, 1]) {
              const q = W(add(c0, mul(across, (sgn * bd.widthIn) / 24)))
              ctx.fillRect(q.x - 1.5, q.y - 1.5, 3, 3)
            }
          }
        }
      }
    }

    // outline
    ctx.strokeStyle = isActive ? C.tierStroke : '#c5beb0'
    ctx.lineWidth = isActive ? 2 : 1.5
    polyPath(tier.outline)
    ctx.stroke()

    // fascia indicator — board on exposed rim faces (decking overhangs it ~1")
    if (state.layers.decking && parts) {
      const fasciaEdges = new Set(parts.fasciaEdges)
      ctx.strokeStyle = '#b08d4d'
      ctx.lineWidth = Math.max(2, (0.75 / 12) * s)
      for (const i of fasciaEdges) {
        const a = tier.outline[i]
        const b = tier.outline[(i + 1) % tier.outline.length]
        const out = edgeOutwardNormal(tier.outline, i)
        const off = mul(out, 0.06) // just outside the rim
        line(add(a, off), add(b, off))
      }
    }

    // railing — drawn to scale from the catalog (top-rail width, per-post size)
    // Top-mount: posts sit a few inches inside the deck edge (one shared
    // centerline per run); corner posts sit on the bisector so runs line up.
    // Composite interior posts are steel surface-mount posts (base plate).
    if (state.layers.railing && parts) {
      const rl = parts.railing
      const rcfg = state.project.settings.railing
      const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
      const rtop = rsys.topStyles.find((t) => t.id === rcfg.topStyleId) ?? rsys.topStyles[0]
      // top rail band — drawn between the trimmed centerline endpoints so each
      // run terminates AT its corner/end posts (no overshoot past the corner)
      for (const piece of rl.pieces) {
        ctx.strokeStyle = rtop.drinkRail ? 'rgba(201,168,106,0.9)' : 'rgba(47,111,214,0.4)'
        ctx.lineWidth = Math.max(2, (rtop.widthIn / 12) * s)
        line(piece.railA, piece.railB)
        ctx.strokeStyle = C.railing
        ctx.lineWidth = 1
        line(piece.railA, piece.railB)
      }
      // posts from the deduped placements (corners resolved on the bisector)
      for (const pl of rl.postPlacements) {
        const opt = resolvePost(rsys, rcfg.postOptionId, pl.role)
        const q = W(pl.pos)
        const sizePx = Math.max(3, (opt.sizeIn / 12) * s)
        if (opt.mount === 'surface-mount') {
          ctx.fillStyle = '#3a3f47'
          const basePx = Math.max(sizePx * 1.5, sizePx + 4)
          ctx.fillRect(q.x - basePx / 2, q.y - basePx / 2, basePx, basePx)
          ctx.fillStyle = '#5b6472'
          ctx.fillRect(q.x - sizePx / 2, q.y - sizePx / 2, sizePx, sizePx)
        } else {
          ctx.fillStyle = C.railing
          ctx.fillRect(q.x - sizePx / 2, q.y - sizePx / 2, sizePx, sizePx)
        }
      }
    }

    // tier name
    if (state.layers.labels) {
      const cx = tier.outline.reduce((sm, p) => sm + p.x, 0) / tier.outline.length
      const cy = tier.outline.reduce((sm, p) => sm + p.y, 0) / tier.outline.length
      label(`${tier.name}  ·  ${ftInlabel(tier.height)} high`, { x: cx, y: cy }, { size: 12, color: '#6d6250' })
      if (state.layers.framing && parts) {
        label(`${tier.framing.joistSize} @ ${tier.framing.spacing}" oc`, { x: cx, y: cy }, { size: 10, color: '#8d8471', dy: 14 })
      }
    }
    ctx.restore()
  }

  // ---------- stairs ----------
  for (const sc of computed.stairs) {
    const isSel = state.selection.kind === 'stairs' && state.selection.stairsId === sc.stairs.id
    ctx.save()
    ctx.globalAlpha = sc.tier.id === state.activeTierId ? 1 : 0.6
    const [c0, c1, c2, c3] = sc.corners
    const eDir = norm(sub(c1, c0)) // across the stair
    const bwIn = computed.byTier.get(sc.tier.id)?.decking.boardWidthIn ?? 5.5
    const bw = bwIn / 12

    if (sc.wrapped && sc.rings.length > 0 && sc.frame) {
      // ---- wrap steps: treads follow the perimeter span, mitring through
      // every crossed corner (works for 90° deck corners and 45° octagons) ----
      const { verts, dirs, legs } = sc.frame
      const runFt = sc.treadIn / 12
      const noseFt = sc.noseIn / 12
      const outerD = sc.rings.length * runFt + noseFt
      const gapFt = sc.treadGapIn / 12
      const path = (d: number): Pt[] => verts.map((v, k) => add(v, mul(dirs[k], d)))
      const polyline = (pts: Pt[]) => {
        ctx.beginPath()
        pts.forEach((p, idx) => {
          const q = W(p)
          if (idx === 0) ctx.moveTo(q.x, q.y)
          else ctx.lineTo(q.x, q.y)
        })
        ctx.stroke()
      }

      // base platform fill (always, like a straight flight)
      for (const ring of sc.rings) {
        ctx.fillStyle = 'rgba(240,236,226,0.9)'
        polyPath(ring)
        ctx.fill()
      }

      // framing: short stringers ⟂ each leg @ 12" oc, a hip stringer carrying
      // every mitred corner, and blocking tying the hips to the legs
      if (state.layers.framing) {
        ctx.strokeStyle = C.post
        ctx.lineWidth = Math.max(2, (1.5 / 12) * s)
        for (const leg of legs) {
          const count = Math.floor(leg.lenFt + 1e-6) + 1
          for (let k = 0; k < count; k++) {
            const x = leg.lenFt * (0.06 + (count === 1 ? 0.5 : k / (count - 1)) * 0.88)
            const base = add(leg.a, mul(leg.dir, x))
            line(base, add(base, mul(leg.normal, outerD)))
          }
        }
        for (let j = 1; j < verts.length - 1; j++) {
          ctx.lineWidth = Math.max(3, (3 / 12) * s)
          line(verts[j], add(verts[j], mul(dirs[j], outerD)))
          // blocking either side of the hip
          ctx.lineWidth = Math.max(1.5, (1.5 / 12) * s)
          const before = legs[j - 1]
          const after = legs[j]
          for (let q = 1; q <= 3; q++) {
            const d = (outerD * q) / 4
            const hip = add(verts[j], mul(dirs[j], d))
            line(hip, add(add(verts[j], mul(before.dir, -Math.min(before.lenFt, d + 1))), mul(before.normal, d)))
            line(hip, add(add(verts[j], mul(after.dir, Math.min(after.lenFt, d + 1))), mul(after.normal, d)))
          }
        }
      }

      // decking: each tread board is one polyline riding the span at its own
      // depth — the wide mitred stroke IS the board, corners joint themselves
      if (state.layers.decking) {
        for (let k = 0; k < sc.rings.length; k++) {
          let off = k * runFt
          for (const tb of sc.treadBoards) {
            const wFt = tb.widthIn / 12
            ctx.strokeStyle = C.boardField
            ctx.lineWidth = Math.max(1, wFt * s - Math.max(0.5, 0.02 * s))
            polyline(path(off + wFt / 2))
            off += wFt + gapFt
          }
        }
        // nosing lines = the front of each step
        ctx.strokeStyle = C.stairs
        ctx.lineWidth = 1
        for (let k = 1; k <= sc.rings.length; k++) polyline(path(k * runFt + noseFt))
        // mitre joint line at every wrapped corner
        ctx.strokeStyle = '#b58a52'
        ctx.lineWidth = 1
        for (let j = 1; j < verts.length - 1; j++) line(verts[j], add(verts[j], mul(dirs[j], outerD)))
      }

      // hardware: face screws at every board × stringer crossing (2 per crossing)
      if (state.layers.hardware) {
        ctx.fillStyle = '#8a5a2e'
        const dot = (p: Pt) => {
          const q = W(p)
          ctx.beginPath()
          ctx.arc(q.x, q.y, Math.max(1.2, 0.02 * s), 0, Math.PI * 2)
          ctx.fill()
        }
        for (const leg of legs) {
          const count = Math.floor(leg.lenFt + 1e-6) + 1
          for (let k = 0; k < count; k++) {
            const x = leg.lenFt * (0.06 + (count === 1 ? 0.5 : k / (count - 1)) * 0.88)
            for (let ring = 0; ring < sc.rings.length; ring++) {
              let off = ring * runFt
              for (const tb of sc.treadBoards) {
                const wFt = tb.widthIn / 12
                const dC = off + wFt / 2
                dot(add(add(leg.a, mul(leg.dir, x + 0.06)), mul(leg.normal, dC)))
                dot(add(add(leg.a, mul(leg.dir, x - 0.06)), mul(leg.normal, dC)))
                off += wFt + gapFt
              }
            }
          }
        }
      }

      // outline the whole flight for weight + selection
      ctx.strokeStyle = isSel ? C.select : C.stairs
      ctx.lineWidth = isSel ? 2.5 : 1.6
      polyPath(sc.footprint)
      ctx.stroke()
      // DN arrow along the middle mitre
      const mid = 1 + Math.floor((verts.length - 3) / 2)
      const inner = verts[mid]
      const outer = add(inner, mul(dirs[mid], outerD))
      ctx.strokeStyle = '#7a7264'
      ctx.lineWidth = 1.5
      line(inner, outer)
      const A2 = W(outer)
      const dir2 = norm(sub(W(outer), W(inner)))
      ctx.beginPath()
      ctx.moveTo(A2.x, A2.y)
      ctx.lineTo(A2.x - dir2.x * 8 - dir2.y * 4, A2.y - dir2.y * 8 + dir2.x * 4)
      ctx.moveTo(A2.x, A2.y)
      ctx.lineTo(A2.x - dir2.x * 8 + dir2.y * 4, A2.y - dir2.y * 8 - dir2.x * 4)
      ctx.stroke()
      if (state.layers.labels) {
        const w = sc.wrapCorners > 1 ? `wrap ×${sc.wrapCorners}` : 'wrap'
        label(`DN ${sc.riserCount}R ${w}`, add(outer, mul(norm(sub(outer, inner)), 0.9)), { size: 10, color: '#7a7264' })
      }
      ctx.restore()
      continue
    }

    ctx.fillStyle = 'rgba(240,236,226,0.9)'
    polyPath([c0, c1, c2, c3])
    ctx.fill()
    // stringers — the actual framing carrying every tread (count scales w/ width)
    if (state.layers.framing) {
      ctx.strokeStyle = C.post
      ctx.lineWidth = Math.max(2, (1.5 / 12) * s)
      for (let k = 0; k < sc.stringerCount; k++) {
        const t = sc.stringerCount === 1 ? 0.5 : k / (sc.stringerCount - 1)
        // outer stringers tucked inside the side border boards
        const tt = 0.06 + t * 0.88
        line(lerp(c0, c1, tt), lerp(c3, c2, tt))
      }
    }
    if (state.layers.decking) {
      // per-tread picture frame: side border boards run down the stringers,
      // tread field boards sit between them, all ends land on stringers
      const innerL = (p: Pt) => add(p, mul(eDir, bw))
      const innerR = (p: Pt) => add(p, mul(eDir, -bw))
      // side borders (drawn as boards to scale)
      ctx.strokeStyle = C.boardFrame
      ctx.lineWidth = Math.max(1.5, bw * s)
      line(add(c0, mul(eDir, bw / 2)), add(c3, mul(eDir, bw / 2)))
      line(add(c1, mul(eDir, -bw / 2)), add(c2, mul(eDir, -bw / 2)))
      // tread field boards: the boards that actually cover each tread (count and
      // widths come from the profile — the back board is ripped when needed).
      // Drawn far tread first so each nosing overlaps the tread below it.
      const gapFt = sc.treadGapIn / 12
      ctx.strokeStyle = C.boardField
      for (let k = sc.treadCount - 1; k >= 0; k--) {
        const dBase = (k * sc.treadIn) / 12
        let d = dBase
        for (const tb of sc.treadBoards) {
          const wFt = tb.widthIn / 12
          ctx.lineWidth = Math.max(1, wFt * s - Math.max(0.5, 0.02 * s))
          const dc = d + wFt / 2
          line(add(innerL(c0), mul(sc.outDir, dc)), add(innerR(c1), mul(sc.outDir, dc)))
          d += wFt + gapFt
        }
      }
      // nosing lines — the leading edge you actually see from above (the tread
      // cut below it is hidden under the overhang)
      ctx.strokeStyle = C.stairs
      ctx.lineWidth = 1
      for (let k = 1; k <= sc.treadCount; k++) {
        const d = (k * sc.treadIn + sc.noseIn) / 12
        line(add(c0, mul(sc.outDir, d)), add(c1, mul(sc.outDir, d)))
      }
      // 45° miter joints where side borders meet tread noses (no exposed ends)
      ctx.strokeStyle = '#b58a52'
      ctx.lineWidth = 1
      line(c0, add(c0, add(mul(eDir, bw), mul(sc.outDir, bw))))
      line(c1, add(c1, add(mul(eDir, -bw), mul(sc.outDir, bw))))
      line(c3, add(c3, add(mul(eDir, bw), mul(sc.outDir, -bw))))
      line(c2, add(c2, add(mul(eDir, -bw), mul(sc.outDir, -bw))))
    }
    // stair guards — raked rail down each open side when guards are required
    if (state.layers.railing && sc.guardRequired) {
      const rcfg = state.project.settings.railing
      const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
      const rtop = rsys.topStyles.find((t) => t.id === rcfg.topStyleId) ?? rsys.topStyles[0]
      const sOpt = resolvePost(rsys, rcfg.postOptionId, 'end')
      const insetFt = 2 / 12 + sOpt.sizeIn / 24 // face inset + half post, like the deck guard
      const postPx = Math.max(3, (sOpt.sizeIn / 12) * s)
      for (const [topC, botC, sgn] of [
        [c0, c3, 1],
        [c1, c2, -1],
      ] as [Pt, Pt, number][]) {
        const off = mul(eDir, sgn * insetFt)
        // top end sits INSIDE the deck at the deck-rail centerline: one shared
        // post — the level run ends on one face, the rake leaves the adjacent face
        const a = add(add(topC, off), mul(sc.outDir, -insetFt))
        const b = add(botC, off)
        ctx.strokeStyle = rtop.drinkRail ? 'rgba(201,168,106,0.9)' : 'rgba(47,111,214,0.4)'
        ctx.lineWidth = Math.max(2, (rtop.widthIn / 12) * s)
        line(a, b)
        ctx.strokeStyle = C.railing
        ctx.lineWidth = 1
        line(a, b)
        // posts at the top and bottom of the run
        ctx.fillStyle = C.railing
        for (const p of [a, b]) {
          const q = W(p)
          ctx.fillRect(q.x - postPx / 2, q.y - postPx / 2, postPx, postPx)
        }
      }
    }
    // outline on top
    ctx.strokeStyle = isSel ? C.select : C.stairs
    ctx.lineWidth = isSel ? 2.5 : 1.6
    polyPath([c0, c1, c2, c3])
    ctx.stroke()
    // DN arrow
    const midTop = mul(add(c0, c1), 0.5)
    const arrowEnd = add(midTop, mul(sc.outDir, Math.max(1.5, sc.totalRunFt * 0.7)))
    ctx.strokeStyle = '#7a7264'
    ctx.lineWidth = 1.5
    line(midTop, arrowEnd)
    const A = W(arrowEnd)
    const dirS = norm(sub(W(arrowEnd), W(midTop)))
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(A.x - dirS.x * 8 - dirS.y * 4, A.y - dirS.y * 8 + dirS.x * 4)
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(A.x - dirS.x * 8 + dirS.y * 4, A.y - dirS.y * 8 - dirS.x * 4)
    ctx.stroke()
    if (state.layers.labels) {
      label(`DN ${sc.riserCount}R @ ${sc.riserIn.toFixed(1)}"`, add(arrowEnd, mul(sc.outDir, 0.8)), { size: 10, color: '#7a7264' })
    }
    ctx.restore()
  }

  // ---------- dimensions (active tier) ----------
  const active = state.project.tiers.find((t) => t.id === state.activeTierId)
  if (state.layers.dimensions && active && state.view === 'top') {
    drawDimensions(ctx, W, s, active)
  }

  // ---------- selection ----------
  if (active && state.selection.kind !== 'none') {
    ctx.strokeStyle = C.select
    ctx.fillStyle = C.select
    const sel = state.selection
    if (sel.kind === 'edge' && sel.tierId === active.id) {
      const a = active.outline[sel.index]
      const b = active.outline[(sel.index + 1) % active.outline.length]
      ctx.lineWidth = 4
      line(a, b)
    } else if (sel.kind === 'vertex' && sel.tierId === active.id) {
      const q = W(active.outline[sel.index])
      ctx.beginPath()
      ctx.arc(q.x, q.y, 6, 0, Math.PI * 2)
      ctx.stroke()
    } else if (sel.kind === 'tier') {
      const t = state.project.tiers.find((x) => x.id === sel.tierId)
      if (t) {
        ctx.lineWidth = 2.5
        ctx.setLineDash([8, 5])
        polyPath(t.outline)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }

  // vertex handles on the active tier
  if (active && (state.tool === 'select' || state.tool === 'draw') && state.view === 'top') {
    for (const p of active.outline) {
      const q = W(p)
      ctx.fillStyle = '#ffffff'
      ctx.strokeStyle = C.tierStroke
      ctx.lineWidth = 1.4
      ctx.fillRect(q.x - 3.5, q.y - 3.5, 7, 7)
      ctx.strokeRect(q.x - 3.5, q.y - 3.5, 7, 7)
    }
  }

  // ---------- hover ----------
  if (ov.hover && state.tool === 'select') {
    const t = state.project.tiers.find((x) => x.id === ov.hover?.tierId)
    ctx.strokeStyle = 'rgba(245,158,11,0.55)'
    if (ov.hover.kind === 'edge' && t && ov.hover.index !== undefined) {
      ctx.lineWidth = 5
      line(t.outline[ov.hover.index], t.outline[(ov.hover.index + 1) % t.outline.length])
    } else if (ov.hover.kind === 'vertex' && t && ov.hover.index !== undefined) {
      const q = W(t.outline[ov.hover.index])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(q.x, q.y, 8, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  if (state.tool === 'stairs' && ov.hover?.kind === 'edge') {
    const t = state.project.tiers.find((x) => x.id === ov.hover?.tierId)
    if (t && ov.hover.index !== undefined) {
      ctx.strokeStyle = 'rgba(37,99,235,0.6)'
      ctx.lineWidth = 6
      line(t.outline[ov.hover.index], t.outline[(ov.hover.index + 1) % t.outline.length])
    }
  }

  // ---------- draft polygon ----------
  if (state.tool === 'draw' && ov.draftPts.length > 0) {
    ctx.strokeStyle = '#2563eb'
    ctx.fillStyle = 'rgba(37,99,235,0.06)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ov.draftPts.forEach((p, i) => {
      const q = W(p)
      if (i === 0) ctx.moveTo(q.x, q.y)
      else ctx.lineTo(q.x, q.y)
    })
    if (ov.snapped) {
      const q = W(ov.snapped)
      ctx.lineTo(q.x, q.y)
    }
    ctx.stroke()
    for (const p of ov.draftPts) {
      const q = W(p)
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(q.x - 3, q.y - 3, 6, 6)
    }
    // close hint on first point
    const q0 = W(ov.draftPts[0])
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(q0.x, q0.y, 9, 0, Math.PI * 2)
    ctx.stroke()
    if (ov.snapped && ov.draftPts.length > 0) {
      const last = ov.draftPts[ov.draftPts.length - 1]
      const L = dist(last, ov.snapped)
      if (L > 0.05) {
        const m = mul(add(last, ov.snapped), 0.5)
        label(ov.typedBuf ? `${ov.typedBuf}…` : ftInlabel(L), m, { size: 12, color: '#1d4ed8', dy: -12 })
      }
    }
  }

  // snap cursor
  if (ov.snapped && (state.tool === 'draw' || state.tool === 'measure')) {
    const q = W(ov.snapped)
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(q.x - 7, q.y)
    ctx.lineTo(q.x + 7, q.y)
    ctx.moveTo(q.x, q.y - 7)
    ctx.lineTo(q.x, q.y + 7)
    ctx.stroke()
  }

  // measure
  if (ov.measureA && ov.measureB) {
    ctx.strokeStyle = '#dc2626'
    ctx.lineWidth = 1.6
    ctx.setLineDash([6, 4])
    line(ov.measureA, ov.measureB)
    ctx.setLineDash([])
    label(ftInlabel(dist(ov.measureA, ov.measureB)), mul(add(ov.measureA, ov.measureB), 0.5), {
      size: 12,
      color: '#dc2626',
      dy: -10,
    })
  }

  // ---------- compass & scale bar ----------
  drawCompass(ctx, w - 44, 44)
  drawScaleBar(ctx, s, h)

  // hardware legend
  if (state.layers.hardware) {
    ctx.save()
    ctx.font = '10px ui-sans-serif, system-ui'
    ctx.textBaseline = 'middle'
    const bx = w - 188
    const by = h - 108
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillRect(bx - 10, by - 14, 188, 92)
    ctx.strokeStyle = '#ddd'
    ctx.strokeRect(bx - 10, by - 14, 188, 92)
    ctx.strokeStyle = C.hanger
    ctx.strokeRect(bx, by - 3, 6, 6)
    ctx.fillStyle = C.text
    ctx.textAlign = 'left'
    ctx.fillText('Joist hanger', bx + 14, by)
    ctx.strokeStyle = C.tie
    ctx.beginPath()
    ctx.moveTo(bx + 3, by + 13)
    ctx.lineTo(bx + 7, by + 20)
    ctx.lineTo(bx - 1, by + 20)
    ctx.closePath()
    ctx.stroke()
    ctx.fillText('Hurricane tie (drop beam)', bx + 14, by + 17)
    ctx.fillStyle = C.post
    ctx.fillRect(bx, by + 28, 7, 7)
    ctx.fillText('6x6 post / footing', bx + 14, by + 32)
    ctx.fillStyle = C.hanger
    ctx.fillRect(bx + 1.5, by + 43, 3, 3)
    ctx.fillStyle = C.text
    ctx.fillText('Hidden clip (per joist)', bx + 14, by + 46)
    ctx.fillStyle = '#b45309'
    ctx.beginPath()
    ctx.arc(bx + 1.5, by + 59, 2, 0, Math.PI * 2)
    ctx.arc(bx + 5.5, by + 59, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = C.text
    ctx.fillText('Top screws (zoom in)', bx + 14, by + 60)
    ctx.restore()
  }

  ctx.restore()
}

function drawDimensions(ctx: CanvasRenderingContext2D, W: (p: Pt) => Pt, s: number, tier: Tier) {
  const n = tier.outline.length
  ctx.save()
  ctx.strokeStyle = '#a39d8d'
  ctx.lineWidth = 1
  for (let i = 0; i < n; i++) {
    const a = tier.outline[i]
    const b = tier.outline[(i + 1) % n]
    const L = dist(a, b)
    if (L < 1.2) continue
    const out = edgeOutwardNormal(tier.outline, i)
    const offFt = 26 / s
    const a2 = add(a, mul(out, offFt))
    const b2 = add(b, mul(out, offFt))
    const A = W(a2)
    const B = W(b2)
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.lineTo(B.x, B.y)
    // extension ticks
    const Ao = W(a)
    const Bo = W(b)
    ctx.moveTo(Ao.x + (A.x - Ao.x) * 0.25, Ao.y + (A.y - Ao.y) * 0.25)
    ctx.lineTo(A.x + (A.x - Ao.x) * 0.12, A.y + (A.y - Ao.y) * 0.12)
    ctx.moveTo(Bo.x + (B.x - Bo.x) * 0.25, Bo.y + (B.y - Bo.y) * 0.25)
    ctx.lineTo(B.x + (B.x - Bo.x) * 0.12, B.y + (B.y - Bo.y) * 0.12)
    ctx.stroke()
    // label
    let ang = Math.atan2(B.y - A.y, B.x - A.x)
    if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI
    const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
    ctx.save()
    ctx.translate(m.x, m.y)
    ctx.rotate(ang)
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 3.5
    ctx.strokeStyle = 'rgba(250,250,248,0.95)'
    const txt = ftInlabel(L)
    ctx.strokeText(txt, 0, -1)
    ctx.fillStyle = '#6d675a'
    ctx.fillText(txt, 0, -1)
    ctx.restore()
  }
  ctx.restore()
}

function drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#b9b4a6'
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.arc(0, 0, 20, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(0, -14)
  ctx.lineTo(5, 6)
  ctx.lineTo(0, 2)
  ctx.lineTo(-5, 6)
  ctx.closePath()
  ctx.fillStyle = '#c0392b'
  ctx.fill()
  ctx.font = 'bold 10px ui-sans-serif, system-ui'
  ctx.fillStyle = '#4b463a'
  ctx.textAlign = 'center'
  ctx.fillText('N', 0, -24)
  ctx.restore()
}

function drawScaleBar(ctx: CanvasRenderingContext2D, s: number, h: number) {
  const targetPx = 110
  const candidates = [1, 2, 4, 5, 10, 20, 40]
  let ft = candidates[0]
  for (const c of candidates) {
    if (c * s <= targetPx * 1.4) ft = c
  }
  const px = ft * s
  ctx.save()
  ctx.translate(18, h - 26)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(-8, -18, px + 60, 30)
  ctx.strokeStyle = '#6d675a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(px, 0)
  ctx.moveTo(0, -5)
  ctx.lineTo(0, 5)
  ctx.moveTo(px, -5)
  ctx.lineTo(px, 5)
  ctx.moveTo(px / 2, -3)
  ctx.lineTo(px / 2, 3)
  ctx.stroke()
  ctx.font = '10px ui-sans-serif, system-ui'
  ctx.fillStyle = '#6d675a'
  ctx.textAlign = 'left'
  ctx.fillText(`${ft} ft`, px + 8, 3)
  ctx.restore()
}
