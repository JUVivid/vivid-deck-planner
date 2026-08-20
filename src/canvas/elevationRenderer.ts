import type { AppState } from '../model/store'
import type { Pt, ViewKind } from '../model/types'
import type { ProjectComputed } from '../engine'
import { DEPTH_IN } from '../codes/tables'
import { resolveDecking } from '../catalog/compat'
import { RAILING_SYSTEMS, railSystemById, resolvePost, selectedPostOption } from '../catalog/timbertech'
import { add, dist, dot, edgeOutwardNormal, mul } from '../geometry/geom'
import { ftInlabel } from '../ui/format'

interface ViewBasis {
  /** world direction that maps to screen-right */
  right: Pt
  /** world direction pointing toward the viewer */
  toward: Pt
  title: string
}

function frostDepthFt(project: { settings: { frostDepth: number } }): number {
  return project.settings.frostDepth / 12
}

const BASES: Record<Exclude<ViewKind, 'top'>, ViewBasis> = {
  S: { right: { x: 1, y: 0 }, toward: { x: 0, y: 1 }, title: 'South Elevation (viewed from the south)' },
  N: { right: { x: -1, y: 0 }, toward: { x: 0, y: -1 }, title: 'North Elevation (viewed from the north)' },
  E: { right: { x: 0, y: -1 }, toward: { x: 1, y: 0 }, title: 'East Elevation (viewed from the east)' },
  W: { right: { x: 0, y: 1 }, toward: { x: -1, y: 0 }, title: 'West Elevation (viewed from the west)' },
}

export function renderElevation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: AppState,
  computed: ProjectComputed,
  view: Exclude<ViewKind, 'top'>,
) {
  const basis = BASES[view]
  const project = state.project
  ctx.save()
  ctx.fillStyle = '#fafaf8'
  ctx.fillRect(0, 0, w, h)

  if (project.tiers.length === 0) {
    ctx.fillStyle = '#8a8577'
    ctx.font = '14px ui-sans-serif, system-ui'
    ctx.textAlign = 'center'
    ctx.fillText('Draw a deck in Top view first.', w / 2, h / 2)
    ctx.restore()
    return
  }

  // fit: horizontal extent across all tiers AND their stairs (a tall flight
  // projects well past the deck — it must never run off the sheet)
  let sxMin = Infinity
  let sxMax = -Infinity
  let maxH = 4
  for (const tier of project.tiers) {
    for (const p of tier.outline) {
      const sx = dot(p, basis.right)
      sxMin = Math.min(sxMin, sx)
      sxMax = Math.max(sxMax, sx)
    }
    maxH = Math.max(maxH, tier.height + 4)
  }
  for (const sc of computed.stairs) {
    if (!sc.ok) continue
    for (const p of sc.footprint) {
      const sx = dot(p, basis.right)
      sxMin = Math.min(sxMin, sx)
      sxMax = Math.max(sxMax, sx)
    }
  }
  const span = Math.max(6, sxMax - sxMin)
  const scale = Math.min((w - 160) / span, (h - 170) / (maxH + frostDepthFt(project)), 48)
  const groundY = h - 70 - frostDepthFt(project) * scale * 0.4
  const xOff = Math.max(50, (w - span * scale) / 2)
  const X = (sx: number) => xOff + (sx - sxMin) * scale
  const Y = (ft: number) => groundY - ft * scale

  // frost line & grade
  const frostFt = project.settings.frostDepth / 12
  ctx.strokeStyle = '#b9b4a6'
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.moveTo(30, Y(-frostFt))
  ctx.lineTo(w - 30, Y(-frostFt))
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#8a8577'
  ctx.font = '10px ui-sans-serif, system-ui'
  ctx.textAlign = 'left'
  ctx.fillText(`frost depth ${project.settings.frostDepth}"`, 34, Y(-frostFt) - 5)

  // tiers far -> near
  const tiersSorted = [...project.tiers].sort((a, b) => {
    const na = Math.max(...a.outline.map((p) => dot(p, basis.toward)))
    const nb = Math.max(...b.outline.map((p) => dot(p, basis.toward)))
    return na - nb
  })

  for (let ti = 0; ti < tiersSorted.length; ti++) {
    const tier = tiersSorted[ti]
    const near = ti === tiersSorted.length - 1
    const parts = computed.byTier.get(tier.id)
    if (!parts) continue
    const fr = parts.framing
    ctx.save()
    ctx.globalAlpha = near ? 1 : 0.45

    let tMin = Infinity
    let tMax = -Infinity
    for (const p of tier.outline) {
      const sx = dot(p, basis.right)
      tMin = Math.min(tMin, sx)
      tMax = Math.max(tMax, sx)
    }
    const deckThk = resolveDecking(tier).profile.thickIn / 12
    const joistD = DEPTH_IN[tier.framing.joistSize] / 12
    const beamD = DEPTH_IN[tier.framing.beamSize] / 12
    const top = tier.height
    const joistBot = top - deckThk - joistD

    // footings (dashed, below grade)
    for (const ftg of fr.footings) {
      const sx = dot(ftg.p, basis.right)
      const wd = (ftg.diaIn / 12) * scale
      ctx.strokeStyle = '#9aa1ab'
      ctx.setLineDash([4, 3])
      ctx.strokeRect(X(sx) - wd / 2, Y(0), wd, (ftg.depthIn / 12) * scale)
      ctx.setLineDash([])
    }
    // posts
    for (const post of fr.posts) {
      const sx = dot(post.p, basis.right)
      const wd = Math.max(3, (5.5 / 12) * scale)
      ctx.fillStyle = '#a97142'
      ctx.fillRect(X(sx) - wd / 2, Y(post.heightFt), wd, post.heightFt * scale)
    }
    // flush beams sit in the joist plane — draw here (behind the fascia band);
    // style is PER BEAM: an interior girder drops even on a flush-rim deck
    for (const bm of fr.beams) {
      if (bm.style !== 'flush') continue
      const a = dot(bm.seg.a, basis.right)
      const b = dot(bm.seg.b, basis.right)
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      ctx.fillStyle = '#d99b52'
      ctx.strokeStyle = '#b97f28'
      ctx.fillRect(X(lo), Y(bm.postTopFt + beamD), (hi - lo) * scale, beamD * scale)
      ctx.strokeRect(X(lo), Y(bm.postTopFt + beamD), (hi - lo) * scale, beamD * scale)
    }
    // joist band + decking band
    ctx.fillStyle = '#ded7c8'
    ctx.strokeStyle = '#a49b87'
    ctx.fillRect(X(tMin), Y(top - deckThk), (tMax - tMin) * scale, joistD * scale)
    ctx.strokeRect(X(tMin), Y(top - deckThk), (tMax - tMin) * scale, joistD * scale)
    ctx.fillStyle = '#c9a86a'
    ctx.fillRect(X(tMin), Y(top), (tMax - tMin) * scale, deckThk * scale)
    ctx.strokeRect(X(tMin), Y(top), (tMax - tMin) * scale, deckThk * scale)
    void joistBot

    // fascia board — 12" tall over the rim; decking overhangs it by 1" (to scale)
    const rdF = resolveDecking(tier)
    const fasciaH = (rdF.line.fascia?.widthIn ?? 12) / 12
    const fasciaThk = (rdF.line.fascia?.thickIn ?? 0.5) / 12
    const OVERHANG = 1 / 12
    const fasciaFill = '#bfa06a'
    const fasciaStroke = '#8f7038'
    for (let i = 0; i < tier.outline.length; i++) {
      const e = tier.edges[i]
      if (!e?.fascia || e?.ledger) continue
      const a = tier.outline[i]
      const b = tier.outline[(i + 1) % tier.outline.length]
      const out = edgeOutwardNormal(tier.outline, i)
      const facing = dot(out, basis.toward)
      const sideMag = dot(out, basis.right)
      const xa = dot(a, basis.right)
      const xb = dot(b, basis.right)
      const lo = Math.min(xa, xb)
      const hi = Math.max(xa, xb)
      if (near && facing > 0.5 && hi - lo > 0.2) {
        // front face: fascia band tucked under the deck cap, 12" tall
        ctx.fillStyle = fasciaFill
        ctx.strokeStyle = fasciaStroke
        ctx.lineWidth = 0.8
        ctx.fillRect(X(lo), Y(top - deckThk), (hi - lo) * scale, fasciaH * scale)
        ctx.strokeRect(X(lo), Y(top - deckThk), (hi - lo) * scale, fasciaH * scale)
      } else if (near && Math.abs(sideMag) > 0.5 && hi - lo > 0.3) {
        // side edge seen edge-on: show fascia thickness + 1" deck overhang in profile
        const endX = sideMag > 0 ? hi : lo
        const dir = sideMag > 0 ? 1 : -1
        ctx.fillStyle = fasciaFill
        ctx.strokeStyle = fasciaStroke
        ctx.lineWidth = 0.8
        ctx.fillRect(X(endX), Y(top - deckThk), dir * fasciaThk * scale, fasciaH * scale)
        ctx.strokeRect(X(endX), Y(top - deckThk), dir * fasciaThk * scale, fasciaH * scale)
        // decking nose overhanging the fascia by 1"
        ctx.fillStyle = '#c9a86a'
        ctx.fillRect(X(endX), Y(top), dir * (fasciaThk + OVERHANG) * scale, deckThk * scale)
        ctx.strokeRect(X(endX), Y(top), dir * (fasciaThk + OVERHANG) * scale, deckThk * scale)
      }
    }

    // drop beams — BELOW the joists (interior girders always draw here, plus
    // the rim girder when a cantilever drops it). Drawn on top of the fascia.
    for (const bm of fr.beams) {
      if (bm.style !== 'drop') continue
      const a = dot(bm.seg.a, basis.right)
      const b = dot(bm.seg.b, basis.right)
      const lo = Math.min(a, b)
      const hi = Math.max(a, b)
      ctx.fillStyle = '#e9b36a'
      ctx.strokeStyle = '#b97f28'
      ctx.lineWidth = 0.8
      ctx.fillRect(X(lo), Y(bm.postTopFt + beamD), (hi - lo) * scale, beamD * scale)
      ctx.strokeRect(X(lo), Y(bm.postTopFt + beamD), (hi - lo) * scale, beamD * scale)
    }

    // diagonal 6x6 knee braces — drawn TO SCALE as real members: a 5.5"-thick
    // stick at 45° with a PLUMB cut bearing on the post face and a LEVEL cut
    // bearing on the girder underside, so every end actually connects
    if (fr.bracingRequired && fr.braceLegFt > 0) {
      const braceFt = fr.braceLegFt
      const wFt = 5.5 / 12
      const halfPost = 5.5 / 24
      const k = (wFt * Math.SQRT2) / 2 // edge offset along the cut planes
      ctx.fillStyle = '#a97142'
      ctx.strokeStyle = '#7a5a2e'
      ctx.lineWidth = 0.8
      for (const bm of fr.beams) {
        const ba = dot(bm.seg.a, basis.right)
        const bb = dot(bm.seg.b, basis.right)
        const blo = Math.min(ba, bb)
        const bhi = Math.max(ba, bb)
        const z1 = bm.postTopFt // girder underside
        for (const post of bm.posts) {
          const sx = dot(post, basis.right)
          for (const d of [-1, 1]) {
            const xPost = sx + d * halfPost
            const xOuter = xPost + d * (braceFt + k)
            // only draw a brace on a side where the beam actually extends
            if (xOuter < blo - 0.02 || xOuter > bhi + 0.02) continue
            if (z1 - braceFt - k < 0.05) continue
            // plumb cut on the post: (xPost, z1−L−k)…(xPost, z1−L+k)
            // level cut on the girder: (xPost+d(L−k), z1)…(xPost+d(L+k), z1)
            ctx.beginPath()
            ctx.moveTo(X(xPost), Y(z1 - braceFt - k))
            ctx.lineTo(X(xPost), Y(z1 - braceFt + k))
            ctx.lineTo(X(xPost + d * (braceFt - k)), Y(z1))
            ctx.lineTo(X(xOuter), Y(z1))
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
          }
        }
      }
    }

    // railing — to scale from the catalog: posts, top/bottom rails, true infill
    const rl = parts.railing
    if (rl.pieces.length > 0) {
      const rcfg = project.settings.railing
      const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
      const rtop = rsys.topStyles.find((t) => t.id === rcfg.topStyleId) ?? rsys.topStyles[0]
      const rinf = rsys.infills.find((i) => i.id === rcfg.infillId) ?? rsys.infills[0]
      const guardFt = rcfg.heightIn / 12
      const topHFt = rtop.heightIn / 12
      const botGapFt = rsys.bottomRail.gapIn / 12
      const botHFt = rsys.bottomRail.heightIn / 12
      const railOpt = selectedPostOption(rsys, rcfg.postOptionId)
      const phFt = railOpt.sizeIn / 24
      const postWpx = Math.max(2.5, (railOpt.sizeIn / 12) * scale)
      const hCable = rinf.kind === 'cable-horizontal'
      const noBottomRail = hCable && rsys.id === 'irx'
      const railFill = '#4a72ab'
      const railStroke = '#33517e'
      const memberW = Math.max(1, ((rinf.memberWidthIn || 0.75) / 12) * scale)
      const yInfillBot = top + (noBottomRail ? 0.29 : botGapFt + botHFt)
      const yInfillTop = top + guardFt - topHFt

      for (const piece of rl.pieces) {
        const sxA = dot(piece.railA, basis.right)
        const sxB = dot(piece.railB, basis.right)
        const lo = Math.min(sxA, sxB)
        const hi = Math.max(sxA, sxB)
        if (hi - lo < 0.4) {
          // run heads toward/away from the viewer: single post face
          ctx.fillStyle = railFill
          ctx.fillRect(X(lo) - postWpx / 2, Y(top + guardFt + 0.04), postWpx, (guardFt + 0.04) * scale)
          continue
        }
        // sections span between the ACTUAL posts (corner-trimmed, evenly spaced)
        const bays = piece.sectionPlan.length
        const bayLenFt = dist(piece.railA, piece.railB) / Math.max(1, bays)
        const postSx = piece.posts.map((pl) => dot(pl.pos, basis.right))

        for (let k = 0; k + 1 < postSx.length; k++) {
          const x0 = Math.min(postSx[k], postSx[k + 1])
          const x1 = Math.max(postSx[k], postSx[k + 1])
          const inX0 = x0 + phFt
          const inX1 = x1 - phFt
          if (inX1 - inX0 < 0.2) continue
          const wpx = (inX1 - inX0) * scale
          // top rail (drink rail = deck board on top)
          ctx.fillStyle = rtop.drinkRail ? '#c9a86a' : railFill
          ctx.strokeStyle = railStroke
          ctx.lineWidth = 0.8
          ctx.fillRect(X(inX0), Y(top + guardFt), wpx, topHFt * scale)
          ctx.strokeRect(X(inX0), Y(top + guardFt), wpx, topHFt * scale)
          // bottom rail
          if (!noBottomRail) {
            ctx.fillStyle = railFill
            ctx.fillRect(X(inX0), Y(top + botGapFt + botHFt), wpx, botHFt * scale)
            ctx.strokeRect(X(inX0), Y(top + botGapFt + botHFt), wpx, botHFt * scale)
            // footblock: kits include a center support foot under the bottom rail
            const fbW = Math.max(2, (1.5 / 12) * scale)
            ctx.fillRect(X((inX0 + inX1) / 2) - fbW / 2, Y(top + botGapFt), fbW, botGapFt * scale)
          }
          // infill
          const secLenKey = piece.sectionPlan[k]
          if (rinf.kind === 'baluster' || rinf.kind === 'open-mid') {
            // open mid-rail (per the IRX config sheet): a SECOND rail sits a
            // hand-gap below the top rail, balusters run bottom rail → mid
            // rail, and the band above the mid rail stays open
            const openMid = rinf.kind === 'open-mid'
            const OPEN_GAP_FT = 6 / 12
            const midRailHFt = 1.5 / 12
            const balTop = openMid ? yInfillTop - OPEN_GAP_FT - midRailHFt : yInfillTop
            const kitCount = rinf.balustersPer[secLenKey] ?? Math.max(2, Math.round((secLenKey * 12) / 4.75))
            // sections are cut down to the bay length — balusters scale with them
            const n = Math.max(1, Math.round((kitCount * bayLenFt) / secLenKey))
            const clear = inX1 - inX0
            const bw = (rinf.memberWidthIn || 0.75) / 12
            const step = (clear - n * bw) / (n + 1)
            ctx.fillStyle = '#5b81b8'
            for (let i2 = 1; i2 <= n; i2++) {
              const bx = inX0 + step * i2 + bw * (i2 - 1) + bw / 2
              ctx.fillRect(X(bx) - memberW / 2, Y(balTop), memberW, (balTop - yInfillBot) * scale)
            }
            if (openMid) {
              ctx.fillStyle = railFill
              ctx.strokeStyle = railStroke
              ctx.fillRect(X(inX0), Y(balTop + midRailHFt), wpx, midRailHFt * scale)
              ctx.strokeRect(X(inX0), Y(balTop + midRailHFt), wpx, midRailHFt * scale)
            }
          } else if (rinf.kind === 'glass') {
            // channel kit: aluminum channels top + bottom, tempered pane between
            const chFt = 1 / 12
            const gx0 = inX0 + 0.04
            const gw = wpx - 0.08 * scale
            ctx.fillStyle = railFill
            ctx.fillRect(X(gx0), Y(yInfillTop), gw, chFt * scale)
            ctx.fillRect(X(gx0), Y(yInfillBot + chFt), gw, chFt * scale)
            ctx.fillStyle = 'rgba(150,185,215,0.3)'
            ctx.strokeStyle = '#8aa6c2'
            ctx.lineWidth = 0.8
            ctx.fillRect(X(gx0), Y(yInfillTop - chFt), gw, (yInfillTop - yInfillBot - 2 * chFt) * scale)
            ctx.strokeRect(X(gx0), Y(yInfillTop - chFt), gw, (yInfillTop - yInfillBot - 2 * chFt) * scale)
            // glare line
            ctx.strokeStyle = 'rgba(255,255,255,0.7)'
            ctx.beginPath()
            ctx.moveTo(X(gx0 + (inX1 - inX0) * 0.18), Y(yInfillBot + 0.25))
            ctx.lineTo(X(gx0 + (inX1 - inX0) * 0.45), Y(yInfillTop - 0.2))
            ctx.stroke()
          } else if (rinf.kind === 'panel') {
            // Pinnacle deco panels are SQUARE (29¾" for 36" rails / 35¾" for
            // 42") — a bay holds whole squares side by side, framed, with the
            // pattern routed inside
            const side = (rcfg.heightIn === 42 ? 35.75 : 29.75) / 12
            const clear = inX1 - inX0
            const nP = Math.max(1, Math.floor((clear + 0.1) / (side + 0.1)))
            const gap = (clear - nP * side) / (nP + 1)
            ctx.strokeStyle = '#5b81b8'
            ctx.lineWidth = Math.max(1, (1.25 / 12) * scale * 0.6)
            for (let pI = 0; pI < nP; pI++) {
              const px0 = inX0 + gap + pI * (side + gap)
              const py0 = yInfillBot
              const py1 = Math.min(yInfillTop, yInfillBot + side)
              const h = py1 - py0
              ctx.strokeRect(X(px0), Y(py1), side * scale, h * scale)
              ctx.beginPath()
              if (rinf.id.includes('web')) {
                // square web: orthogonal grid, 3 × 3
                for (let g = 1; g <= 2; g++) {
                  const gx = px0 + (side * g) / 3
                  ctx.moveTo(X(gx), Y(py1))
                  ctx.lineTo(X(gx), Y(py0))
                  const gy = py0 + (h * g) / 3
                  ctx.moveTo(X(px0), Y(gy))
                  ctx.lineTo(X(px0 + side), Y(gy))
                }
              } else {
                // chippendale type 1: crossing diagonals + center diamond
                ctx.moveTo(X(px0), Y(py1))
                ctx.lineTo(X(px0 + side), Y(py0))
                ctx.moveTo(X(px0), Y(py0))
                ctx.lineTo(X(px0 + side), Y(py1))
                const mx = px0 + side / 2
                const my = py0 + h / 2
                ctx.moveTo(X(mx), Y(py1))
                ctx.lineTo(X(px0 + side), Y(my))
                ctx.lineTo(X(mx), Y(py0))
                ctx.lineTo(X(px0), Y(my))
                ctx.lineTo(X(mx), Y(py1))
              }
              ctx.stroke()
            }
          } else if (rinf.kind === 'cable-vertical') {
            ctx.strokeStyle = '#6b7f99'
            ctx.lineWidth = 1
            for (let bx = inX0 + 0.29; bx < inX1; bx += 3.5 / 12) {
              ctx.beginPath()
              ctx.moveTo(X(bx), Y(yInfillBot))
              ctx.lineTo(X(bx), Y(yInfillTop))
              ctx.stroke()
            }
          }
        }
        // horizontal cables run continuously through the posts
        if (hCable) {
          const nCables = rinf.cable?.cablesPerHeight[rcfg.heightIn] ?? 11
          ctx.strokeStyle = '#6b7f99'
          ctx.lineWidth = 1
          for (let c = 0; c < nCables; c++) {
            const yC = yInfillBot + ((yInfillTop - yInfillBot) * c) / Math.max(1, nCables - 1)
            ctx.beginPath()
            ctx.moveTo(X(lo + 0.05), Y(yC))
            ctx.lineTo(X(hi - 0.05), Y(yC))
            ctx.stroke()
          }
        }
      }
      // posts from the deduped placements (corner posts drawn once, lined up).
      // A surface-mount (Secure Mount) post is only a steel CORE — the sleeve,
      // cap and skirt go over it, so the FINISHED post looks exactly like its
      // neighbours; the only tell is the base plate at the deck.
      for (const pl of rl.postPlacements) {
        const px = dot(pl.pos, basis.right)
        const opt = resolvePost(rsys, rcfg.postOptionId, pl.role)
        const surface = opt.mount === 'surface-mount'
        const drawSizeIn = surface ? resolvePost(rsys, rcfg.postOptionId, 'end').sizeIn : opt.sizeIn
        const wpx = Math.max(2.5, (drawSizeIn / 12) * scale)
        ctx.fillStyle = railFill
        ctx.strokeStyle = railStroke
        ctx.lineWidth = 0.8
        ctx.fillRect(X(px) - wpx / 2, Y(top + guardFt + 0.06), wpx, (guardFt + 0.06) * scale)
        ctx.strokeRect(X(px) - wpx / 2, Y(top + guardFt + 0.06), wpx, (guardFt + 0.06) * scale)
        if (surface) {
          // base plate hint under the skirt
          ctx.fillStyle = '#3a3f47'
          ctx.fillRect(X(px) - wpx * 0.75, Y(top + 0.02), wpx * 1.5, 0.06 * scale)
          ctx.fillStyle = railFill
        }
        if (rsys.postAccessory) {
          // cap: overhanging slab, with a raised tier for the pyramid-style
          // Post Cap; skirt: flared ring where the post meets the deck
          const capW = wpx * 1.3
          const capH = Math.max(2, (1 / 12) * scale)
          const capY = Y(top + guardFt + 0.06)
          ctx.fillRect(X(px) - capW / 2, capY - capH, capW, capH)
          const capId = rcfg.postCapId ?? rsys.postAccessory.caps[0]?.id
          if (capId === 'cap' || capId === 'std') {
            const tierH = Math.max(1.5, (0.75 / 12) * scale)
            ctx.fillRect(X(px) - (wpx * 0.7) / 2, capY - capH - tierH, wpx * 0.7, tierH)
          }
          if (rsys.postAccessory.skirt) {
            const skW = wpx * 1.35
            const skH = Math.max(2, (3 / 12) * scale)
            ctx.fillRect(X(px) - skW / 2, Y(top + 3 / 12), skW, skH)
          }
        } else {
          ctx.fillRect(X(px) - (wpx * 1.25) / 2, Y(top + guardFt + 0.06 + 0.1), wpx * 1.25, 0.1 * scale)
        }
      }
    }

    // height labels
    ctx.fillStyle = '#6d675a'
    ctx.font = '11px ui-sans-serif, system-ui'
    ctx.textAlign = 'left'
    ctx.fillText(`${tier.name}: ${ftInlabel(tier.height)}`, X(tMax) + 10, Y(top) + 4)
    ctx.restore()
  }

  // stairs — the real assembly: cut stringer body carrying tread boards with a
  // 1" nose, riser boards closing each rise, landing at grade. Nothing floats.
  for (const sc of computed.stairs) {
    if (!sc.ok) continue
    ctx.save()
    const dirX = dot(sc.outDir, basis.right)
    const towards = dot(sc.outDir, basis.toward)
    const originSx = dot(sc.origin, basis.right)
    const top = sc.tier.height
    const scDeckThk = resolveDecking(sc.tier).profile.thickIn / 12
    const rFt = sc.riserIn / 12
    const tFt = sc.treadIn / 12
    const noseFt = sc.noseIn / 12
    const gapFt = sc.treadGapIn / 12

    if (sc.wrapped && sc.frame && sc.rings.length > 0) {
      // ---- wrapped flight: TRUE projection of every leg, so the drawing
      // cross-checks the material list. Each step's riser face and tread edge
      // is the projected extent of its ring — the cascade widens as it drops,
      // legs parallel to the view read as the stepped side profile. ----
      const { verts, dirs, legs } = sc.frame
      const anyVisible = legs.some((leg) => dot(leg.normal, basis.toward) > -0.3)
      if (!anyVisible) {
        ctx.restore()
        continue
      }
      const path = (d: number): Pt[] => verts.map((v2, k2) => add(v2, mul(dirs[k2], d)))
      const extent = (d: number): [number, number] => {
        let lo = Infinity
        let hi = -Infinity
        for (const p of path(d)) {
          const sx = dot(p, basis.right)
          lo = Math.min(lo, sx)
          hi = Math.max(hi, sx)
        }
        return [lo, hi]
      }
      const landZ = top - sc.rise
      const riserThk = 0.55 / 12
      for (let k = 1; k <= sc.riserCount; k++) {
        const zUpper = top - (k - 1) * rFt
        const zLower = top - k * rFt
        // riser board face at this step's front line
        const [r0, r1] = extent((k - 1) * tFt)
        ctx.fillStyle = '#b58a52'
        ctx.strokeStyle = '#8f7038'
        ctx.lineWidth = 0.8
        ctx.fillRect(X(r0), Y(zUpper - scDeckThk), (r1 - r0) * scale, (zUpper - scDeckThk - zLower) * scale)
        ctx.strokeRect(X(r0), Y(zUpper - scDeckThk), (r1 - r0) * scale, (zUpper - scDeckThk - zLower) * scale)
        // tread band (board thickness) with the nosing past the riser below
        if (k <= sc.treadCount) {
          const [t0, t1] = extent(k * tFt + noseFt)
          ctx.fillStyle = '#c9a86a'
          ctx.fillRect(X(t0), Y(zLower), (t1 - t0) * scale, scDeckThk * scale)
          ctx.strokeRect(X(t0), Y(zLower), (t1 - t0) * scale, scDeckThk * scale)
        }
      }
      // short stringers on every leg facing the viewer (@ 12" oc — count
      // matches the BOM so the drawing is checkable)
      ctx.strokeStyle = '#8a6a3a'
      ctx.lineWidth = Math.max(1, (1.5 / 12) * scale)
      for (const leg of legs) {
        if (dot(leg.normal, basis.toward) < 0.5) continue
        const count = Math.floor(leg.lenFt + 1e-6) + 1
        for (let k = 0; k < count; k++) {
          const x = leg.lenFt * (0.06 + (count === 1 ? 0.5 : k / (count - 1)) * 0.88)
          const sxP = dot(add(leg.a, mul(leg.dir, x)), basis.right)
          ctx.beginPath()
          ctx.moveTo(X(sxP), Y(top - scDeckThk))
          ctx.lineTo(X(sxP), Y(landZ))
          ctx.stroke()
        }
      }
      // landing pad under the whole bottom front (grade landings)
      if (sc.stairs.landing.kind === 'grade') {
        const [p0, p1] = extent(sc.riserCount * tFt)
        ctx.fillStyle = '#c8c4bb'
        ctx.strokeStyle = '#9a958a'
        ctx.fillRect(X(p0 - 0.5), Y(0), (p1 - p0 + 1) * scale, (4 / 12) * scale)
        ctx.strokeRect(X(p0 - 0.5), Y(0), (p1 - p0 + 1) * scale, (4 / 12) * scale)
      }
      ctx.restore()
      continue
    }

    if (Math.abs(dirX) > 0.7) {
      const sgn = dirX > 0 ? 1 : -1
      const landZ = top - sc.rise // grade (0) or the lower tier's surface
      // ---- stringer body: sawtooth cuts under the treads + solid chord below ----
      ctx.beginPath()
      ctx.moveTo(X(originSx), Y(top - scDeckThk)) // hangs at the deck rim (LSCZ)
      for (let k = 1; k <= sc.riserCount; k++) {
        const zCut = top - k * rFt - scDeckThk // tread cut = surface − board thickness
        const xBack = originSx + sgn * (k - 1) * tFt
        ctx.lineTo(X(xBack), Y(Math.max(zCut, landZ))) // down the riser cut
        if (k < sc.riserCount) {
          ctx.lineTo(X(xBack + sgn * tFt), Y(zCut)) // out along the tread cut
        }
      }
      const xEnd = originSx + sgn * sc.totalRunFt
      ctx.lineTo(X(xEnd), Y(landZ)) // bottom plumb cut bears on the landing
      // underside PARALLEL TO THE NOSING LINE (riser/tread pitch — the line a
      // framing square lays out, NOT the flight hypotenuse) at the 2x12's true
      // plumb depth, with a horizontal seat cut where it meets the landing.
      const cosSlope = sc.treadIn / Math.hypot(sc.treadIn, sc.riserIn)
      const plumbFt = 11.25 / 12 / Math.max(0.5, cosSlope)
      const topUnder = top - scDeckThk - plumbFt
      const nosingPitch = rFt / tFt // rise per foot of run along the nosings
      const xSeat = originSx + sgn * Math.min(sc.totalRunFt, Math.max(0, (topUnder - landZ) / nosingPitch))
      ctx.lineTo(X(xSeat), Y(landZ)) // seat cut on the landing
      ctx.lineTo(X(originSx), Y(Math.max(landZ, topUnder))) // nosing-parallel underside
      ctx.closePath()
      ctx.fillStyle = '#caa06b'
      ctx.strokeStyle = '#8a6a3a'
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()
      // ---- tread boards (with 1" nose) + riser boards, every piece bearing ----
      const riserThk = 0.55 / 12
      for (let k = 1; k <= sc.riserCount; k++) {
        const zUpper = top - (k - 1) * rFt // surface above this riser
        const zLower = top - k * rFt // surface below (grade/landing at last)
        const xFace = originSx + sgn * (k - 1) * tFt
        // riser board closes the rise (TimberTech riser stock)
        ctx.fillStyle = '#b58a52'
        const rx = Math.min(xFace, xFace + sgn * riserThk)
        ctx.fillRect(X(rx), Y(zUpper - scDeckThk), riserThk * scale, (zUpper - scDeckThk - zLower) * scale)
        // tread boards on the step below (not after the final riser — that's the
        // landing): the real board layout, covering run + nosing edge to edge
        if (k <= sc.treadCount) {
          ctx.fillStyle = '#c9a86a'
          ctx.strokeStyle = '#8f7038'
          let off = 0
          for (const tb of sc.treadBoards) {
            const wFt = tb.widthIn / 12
            const xb = xFace + sgn * off
            const xs = Math.min(xb, xb + sgn * wFt)
            ctx.fillRect(X(xs), Y(zLower), wFt * scale, scDeckThk * scale)
            ctx.strokeRect(X(xs), Y(zLower), wFt * scale, scDeckThk * scale)
            off += wFt + gapFt
          }
        }
      }
      // ---- mid-span stringer girder + 6x6 posts (tall flights) ----
      for (const ms of sc.midSupports) {
        const gx = originSx + sgn * ms.xFt
        const postW = Math.max(3, (5.5 / 12) * scale)
        const gd = 9.25 / 12
        // footing (dashed, below grade)
        ctx.strokeStyle = '#9aa1ab'
        ctx.setLineDash([4, 3])
        ctx.strokeRect(X(gx) - (12 / 24) * scale, Y(0), (12 / 12) * scale, (project.settings.frostDepth / 12) * scale)
        ctx.setLineDash([])
        // post to grade
        ctx.fillStyle = '#a97142'
        ctx.fillRect(X(gx) - postW / 2, Y(ms.postTopFt), postW, ms.postTopFt * scale)
        // (2)-ply girder seen end-on, under the stringers
        const gw = Math.max(3, (3 / 12) * scale)
        ctx.fillStyle = '#e9b36a'
        ctx.strokeStyle = '#b97f28'
        ctx.lineWidth = 0.8
        ctx.fillRect(X(gx) - gw / 2, Y(ms.postTopFt + gd), gw, gd * scale)
        ctx.strokeRect(X(gx) - gw / 2, Y(ms.postTopFt + gd), gw, gd * scale)
      }

      // ---- landing pad under the bottom plumb cut (grade landings) ----
      if (sc.stairs.landing.kind === 'grade') {
        ctx.fillStyle = '#c8c4bb'
        ctx.strokeStyle = '#9a958a'
        const padStart = originSx + sgn * (sc.totalRunFt - 1)
        const padW = sgn * 4
        const px0 = Math.min(padStart, padStart + padW)
        ctx.fillRect(X(px0), Y(0), Math.abs(padW) * scale, (4 / 12) * scale)
        ctx.strokeRect(X(px0), Y(0), Math.abs(padW) * scale, (4 / 12) * scale)
      }
      // ---- raked stair guard (4+ risers): posts top & bottom, raked rails, balusters ----
      if (sc.guardRequired) {
        const rcfg = project.settings.railing
        const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
        const rtop = rsys.topStyles.find((t) => t.id === rcfg.topStyleId) ?? rsys.topStyles[0]
        const guardFt = rcfg.heightIn / 12
        const sizeIn = selectedPostOption(rsys, rcfg.postOptionId).sizeIn
        const postW = Math.max(2.5, (sizeIn / 12) * scale)
        const railFill = '#4a72ab'
        const zNoseBot = landZ + rFt // last nosing
        // top post = the deck run's shared corner post: rail centerline inset
        // inside the deck edge, so the level rail ends on one face of it and
        // the rake leaves the adjacent face — ONE post, not two
        const topSx = originSx - sgn * (2 / 12 + sizeIn / 24)
        // posts: shared top post on the deck, bottom post at the landing
        ctx.fillStyle = railFill
        ctx.strokeStyle = '#33517e'
        ctx.lineWidth = 0.8
        // stair posts get the same cap + skirt treatment as the deck run
        const stairCapSkirt = (x: number, topZ: number, baseZ: number) => {
          if (!rsys.postAccessory) return
          const capW = postW * 1.3
          const capH = Math.max(2, (1 / 12) * scale)
          ctx.fillRect(X(x) - capW / 2, Y(topZ) - capH, capW, capH)
          const capId = rcfg.postCapId ?? rsys.postAccessory.caps[0]?.id
          if (capId === 'cap' || capId === 'std') {
            const tierH = Math.max(1.5, (0.75 / 12) * scale)
            ctx.fillRect(X(x) - (postW * 0.7) / 2, Y(topZ) - capH - tierH, postW * 0.7, tierH)
          }
          if (rsys.postAccessory.skirt) {
            const skW = postW * 1.35
            ctx.fillRect(X(x) - skW / 2, Y(baseZ + 3 / 12), skW, Math.max(2, (3 / 12) * scale))
          }
        }
        ctx.fillRect(X(topSx) - postW / 2, Y(top + guardFt + 0.05), postW, (guardFt + 0.05) * scale)
        ctx.fillRect(X(xEnd) - postW / 2, Y(zNoseBot + guardFt + 0.05), postW, (zNoseBot + guardFt + 0.05 - landZ) * scale)
        stairCapSkirt(xEnd, zNoseBot + guardFt + 0.05, landZ)
        // intermediate posts: stair rail sections come 6' — a long rake can't
        // run unsupported, so mids split it into equal bays. Each mid post
        // stands ON the exact tread beneath it (never inside a step).
        const rakeHoriz = Math.abs(xEnd - topSx)
        const rakeSlope = Math.hypot(rakeHoriz, top - zNoseBot)
        const stairBays = Math.max(1, Math.ceil(rakeSlope / 6))
        for (let m = 1; m < stairBays; m++) {
          const tM = m / stairBays
          const xm = topSx + sgn * rakeHoriz * tM
          const zm = top + (zNoseBot - top) * tM
          // the tread under xm: tread n covers ((n−1)·t, n·t] out from the rim
          const xRel = Math.max(0, Math.abs(xm - originSx))
          const treadN = Math.min(sc.treadCount, Math.max(1, Math.floor(xRel / tFt) + 1))
          const zBase = Math.max(landZ, top - treadN * rFt)
          ctx.fillRect(X(xm) - postW / 2, Y(zm + guardFt + 0.05), postW, (zm + guardFt + 0.05 - zBase) * scale)
          stairCapSkirt(xm, zm + guardFt + 0.05, zBase)
        }
        // raked top rail (springs off the shared post, follows the nosing line)
        ctx.strokeStyle = railFill
        ctx.lineWidth = Math.max(2, (rtop.heightIn / 12) * scale)
        ctx.beginPath()
        ctx.moveTo(X(topSx), Y(top + guardFt))
        ctx.lineTo(X(xEnd), Y(zNoseBot + guardFt))
        ctx.stroke()
        // raked bottom rail
        ctx.lineWidth = Math.max(1.5, (rsys.bottomRail.heightIn / 12) * scale)
        ctx.beginPath()
        ctx.moveTo(X(topSx), Y(top + rsys.bottomRail.gapIn / 12))
        ctx.lineTo(X(xEnd), Y(zNoseBot + rsys.bottomRail.gapIn / 12))
        ctx.stroke()
        // balusters between the rakes
        ctx.lineWidth = Math.max(1, (0.75 / 12) * scale)
        const runFt = Math.abs(xEnd - topSx)
        const nBal = Math.max(2, Math.floor((runFt * 12) / 4.75))
        for (let i2 = 1; i2 < nBal; i2++) {
          const t = i2 / nBal
          const xb = topSx + sgn * runFt * t
          const zn = top + (zNoseBot - top) * t
          ctx.beginPath()
          ctx.moveTo(X(xb), Y(zn + rsys.bottomRail.gapIn / 12))
          ctx.lineTo(X(xb), Y(zn + guardFt))
          ctx.stroke()
        }
      }
    } else if (towards > 0.7) {
      // facing the viewer: stringers + treads + risers face-on
      const faceW = sc.attachWidthFt
      const faceStringers = sc.stringerCount
      const halfW = faceW / 2
      ctx.strokeStyle = '#3f4753'
      ctx.lineWidth = 1.2
      ctx.strokeRect(X(originSx - halfW), Y(top), faceW * scale, sc.rise * scale)
      for (let k = 1; k < sc.riserCount; k++) {
        const z = top - k * rFt
        ctx.beginPath()
        ctx.moveTo(X(originSx - halfW), Y(z))
        ctx.lineTo(X(originSx + halfW), Y(z))
        ctx.stroke()
      }
      // stringer positions show through as verticals
      ctx.strokeStyle = '#8a6a3a'
      ctx.lineWidth = Math.max(1, (1.5 / 12) * scale)
      for (let k = 0; k < faceStringers; k++) {
        const t = faceStringers === 1 ? 0.5 : k / (faceStringers - 1)
        const sxP = originSx - halfW + faceW * (0.06 + t * 0.88)
        ctx.beginPath()
        ctx.moveTo(X(sxP), Y(top - scDeckThk))
        ctx.lineTo(X(sxP), Y(0))
        ctx.stroke()
      }
      // mid-span girder (face-on: full band) + its posts
      for (const ms of sc.midSupports) {
        const g0 = dot(ms.a, basis.right)
        const g1 = dot(ms.b, basis.right)
        const lo = Math.min(g0, g1)
        const gd = 9.25 / 12
        ctx.fillStyle = '#e9b36a'
        ctx.strokeStyle = '#b97f28'
        ctx.lineWidth = 0.8
        ctx.fillRect(X(lo), Y(ms.postTopFt + gd), Math.abs(g1 - g0) * scale, gd * scale)
        ctx.strokeRect(X(lo), Y(ms.postTopFt + gd), Math.abs(g1 - g0) * scale, gd * scale)
        ctx.fillStyle = '#a97142'
        const pw = Math.max(3, (5.5 / 12) * scale)
        for (const p of ms.posts) {
          const sxP = dot(p, basis.right)
          ctx.fillRect(X(sxP) - pw / 2, Y(ms.postTopFt), pw, ms.postTopFt * scale)
        }
      }
    }
    ctx.restore()
  }

  // grade line
  ctx.strokeStyle = '#57534e'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(30, groundY)
  ctx.lineTo(w - 30, groundY)
  ctx.stroke()
  ctx.strokeStyle = '#a8a29e'
  ctx.lineWidth = 1
  for (let x = 30; x < w - 30; x += 14) {
    ctx.beginPath()
    ctx.moveTo(x, groundY)
    ctx.lineTo(x - 7, groundY + 8)
    ctx.stroke()
  }

  // title
  ctx.fillStyle = '#4b463a'
  ctx.font = '600 13px ui-sans-serif, system-ui'
  ctx.textAlign = 'left'
  ctx.fillText(basis.title, 20, 28)
  ctx.font = '11px ui-sans-serif, system-ui'
  ctx.fillStyle = '#8a8577'
  ctx.fillText('Elevations are schematic — heights, posts, beams and footings are to scale; use Top view for editing.', 20, 46)

  ctx.restore()
}
