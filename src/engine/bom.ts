import type { Project } from '../model/types'
import { DEPTH_IN, HANGER_NAME, LUMBER_STOCK, SPECIES_LABEL, ledgerFastenerSpacing, stockFor } from '../codes/tables'
import { segLen } from '../geometry/geom'
import { ftIn } from '../ui/format'
import { profileKind, resolveDecking } from '../catalog/compat'
import {
  PRO_TAC,
  RAILING_SYSTEMS,
  railSystemById,
  resolvePost,
  screwColorFor,
  selectedPostOption,
  type RailingSystem,
} from '../catalog/timbertech'
import type { FramingResult } from './framing'
import type { DeckingResult, FastenerCounts } from './decking'
import type { RailingResult } from './railing'
import type { StairsCalc } from './stairs'
import { planCuts, type CutDemand, type CutPlan } from './cutplan'
import { unitCostDetail } from './pricing'

export interface BomLine {
  section: string
  item: string
  detail: string
  qty: number
  unit: 'ea' | 'lf' | 'bags' | 'sq ft' | 'rolls' | 'packs'
  note?: string
  /**
   * Stable machine key for price lookup — independent of the display string, so
   * rewording `item` never orphans a price. Absent = not priceable yet.
   */
  sku?: string
  /** informational rows (areas) — excluded from cost totals */
  informational?: boolean
}

export interface TierParts {
  framing: FramingResult
  decking: DeckingResult
  railing: RailingResult
  fasciaLf: number
  fasteners: FastenerCounts
}

/** Smallest stock length >= len; null when longer than the longest stock. */
export function nextStock(len: number, stocks = LUMBER_STOCK): number | null {
  for (const s of stocks) if (len <= s + 0.02) return s
  return null
}

/** First-fit-decreasing packing of cut lengths into stock lengths. */
export function packCuts(cuts: number[], stocks: number[]): { byStock: Map<number, number>; wasteLf: number; overlong: number } {
  const sorted = [...cuts].sort((a, b) => b - a)
  const stockAsc = [...stocks].sort((a, b) => a - b)
  const bins: { stock: number; remaining: number }[] = []
  let overlong = 0
  const KERF = 0.03
  for (const cut of sorted) {
    if (cut > stockAsc[stockAsc.length - 1] + 0.02) {
      overlong++
      continue
    }
    let bestIdx = -1
    let bestRem = Infinity
    for (let i = 0; i < bins.length; i++) {
      const rem = bins[i].remaining
      if (rem >= cut + KERF && rem - cut < bestRem) {
        bestRem = rem - cut
        bestIdx = i
      }
    }
    if (bestIdx >= 0) {
      bins[bestIdx].remaining -= cut + KERF
    } else {
      const stock = stockAsc.find((s) => s >= cut) ?? stockAsc[stockAsc.length - 1]
      bins.push({ stock, remaining: stock - cut - KERF })
    }
  }
  const byStock = new Map<number, number>()
  let wasteLf = 0
  for (const b of bins) {
    byStock.set(b.stock, (byStock.get(b.stock) ?? 0) + 1)
    wasteLf += Math.max(0, b.remaining)
  }
  return { byStock, wasteLf, overlong }
}

const S = {
  framing: '1 — Framing Lumber',
  hardware: '2 — Framing Hardware',
  tape: '3 — Joist Protection (required)',
  decking: '4 — TimberTech Decking & Fascia',
  fasteners: '5 — Deck Fasteners',
  railing: '6 — Railing',
  stairs: '7 — Stairs',
  concrete: '8 — Footings & Concrete',
  misc: '9 — Flashing & Misc',
}

/**
 * One accumulated order line. Quantities are summed RAW and only rounded to the
 * ordering increment once, at the end — rounding each contribution separately
 * (5 bags here, 9 bags there) silently pads every merged item.
 */
interface AccInput {
  section: string
  item: string
  detail: string
  /** raw, unrounded — e.g. 3.4 boxes of screws, 65.2 bags */
  qty: number
  unit: BomLine['unit']
  note?: string
  /** ordering increment: final = ceil(total / roundTo) * roundTo. Default 1. */
  roundTo?: number
  /** informational lines (areas) — report the sum as-is, don't round up */
  exact?: boolean
  /** stable price-book key */
  sku?: string
}

interface AccEntry {
  section: string
  item: string
  unit: BomLine['unit']
  details: string[]
  notes: string[]
  raw: number
  roundTo: number
  exact: boolean
  sku?: string
}

/** One size's optimized purchase + crew cut list. */
export interface LumberPlan extends CutPlan {
  /** BOM section the boards land in (framing vs stairs — keeps customer categories honest) */
  section: string
  /** '2x8' | '2x10' | '6x6' … */
  size: string
  speciesLabel: string
}

export interface BomResult {
  lines: BomLine[]
  cutPlans: LumberPlan[]
}

export function buildBom(project: Project, parts: Map<string, TierParts>, stairs: StairsCalc[]): BomResult {
  // Merge on the SKU (section + item + unit) — NOT on the description. The same
  // 2x8-12' PT bought for joists, rim and blocking is one line on the order.
  const merged = new Map<string, AccEntry>()
  const acc = (l: AccInput) => {
    if (l.qty <= 0) return
    const key = `${l.section}|${l.item}|${l.unit}`
    const ex = merged.get(key)
    if (ex) {
      ex.raw += l.qty
      if (!ex.details.includes(l.detail)) ex.details.push(l.detail)
      if (l.note && !ex.notes.includes(l.note)) ex.notes.push(l.note)
      ex.roundTo = Math.max(ex.roundTo, l.roundTo ?? 1)
      ex.exact = ex.exact && (l.exact ?? false)
      if (!ex.sku && l.sku) ex.sku = l.sku
    } else {
      merged.set(key, {
        section: l.section,
        item: l.item,
        unit: l.unit,
        details: [l.detail],
        notes: l.note ? [l.note] : [],
        raw: l.qty,
        roundTo: l.roundTo ?? 1,
        exact: l.exact ?? false,
        ...(l.sku ? { sku: l.sku } : {}),
      })
    }
  }

  // ---- lumber cut pools ----
  // Every framing-lumber demand is a CUT; the planner (cutplan.ts) packs the
  // cuts of each size into cost-optimal stock boards at the end. Pools are per
  // SECTION so stair lumber still prices into the Steps category.
  const pools = new Map<string, { section: string; speciesLabel: string; size: string; demands: CutDemand[] }>()
  const cut = (section: string, speciesLabel: string, size: string, lenFt: number, label: string, count = 1) => {
    if (lenFt <= 0 || count <= 0) return
    const key = `${section}|${speciesLabel}|${size}`
    let p = pools.get(key)
    if (!p) {
      p = { section, speciesLabel, size, demands: [] }
      pools.set(key, p)
    }
    for (let i = 0; i < count; i++) p.demands.push({ lenFt, label })
  }

  // PRO-TAC accumulators (LF by application)
  let tapeSingleLf = 0 // 1.625" — single joists, rim, blocking, stringers
  let tapeDoubleLf = 0 // 3.25" — 2-ply beams
  let tapeTripleLf = 0 // 4" — 3-ply beams
  let tapeLedgerLf = 0 // 12" — ledger wrap
  let beamLaminationLf = 0 // LF of ply-to-ply lamination (2 rows of screws @ 16" oc)

  for (const tier of project.tiers) {
    const tp = parts.get(tier.id)
    if (!tp) continue
    const { framing: fr, decking: dk, railing: rl, fasteners: fc } = tp
    const f = tier.framing
    const rd = resolveDecking(tier)
    const treated = `${SPECIES_LABEL[f.species]} pressure-treated`
    const productName = `${rd.line.name} — ${rd.color}`
    const sp = SPECIES_LABEL[f.species]

    // ---- ledger ----
    if (fr.ledgerLen > 0.5) {
      // full-length runs, never built up from shorter boards — a demand past
      // the stocked lengths surfaces as a special-order line via the planner
      for (const seg of fr.ledgerSegs) cut(S.framing, sp, f.joistSize, segLen(seg), `${tier.name} ledger board`)
      const spacing = ledgerFastenerSpacing(project.settings.ledgerFastener, fr.maxBackspan + fr.cantilever)
      acc({
        section: S.hardware,
        item: project.settings.ledgerFastener === 'lag' ? '1/2" x 4" structural lag / LedgerLOK' : '1/2" through-bolt w/ washers',
        sku: project.settings.ledgerFastener === 'lag' ? 'hw:ledgerlok' : 'hw:through-bolt',
        detail: `${tier.name} ledger fastening @ ${spacing}" oc staggered`,
        qty: (fr.ledgerLen * 12) / spacing + 1,
        unit: 'ea',
      })
      acc({ section: S.misc, item: 'Ledger flashing (Z + drip cap)', sku: 'misc:ledger-flash', detail: `${tier.name} — full ledger length`, qty: fr.ledgerLen + 2, unit: 'lf' })
      acc({ section: S.hardware, item: 'DTT2Z lateral-load connector', sku: 'hw:dtt2z', detail: `${tier.name} deck-to-house lateral anchors (min 2)`, qty: 2, unit: 'ea' })
      tapeLedgerLf += fr.ledgerLen
    }

    // ---- joists (layout grid + added seam-support joists, each a real board) ----
    for (const j of fr.joists) {
      cut(S.framing, sp, f.joistSize, j.len, `${tier.name} joists @ ${f.spacing}" oc`)
      tapeSingleLf += j.len
    }
    const supportJoists = fr.breakerJoists + fr.pfJoists
    if (supportJoists > 0) {
      acc({
        section: S.framing,
        item: `${f.joistSize} seam-support joists (info)`,
        exact: true,
        detail: `${tier.name}: ${fr.breakerJoists} flanking breaker boards + ${fr.pfJoists} under picture-frame borders`,
        qty: supportJoists,
        unit: 'ea',
        note: 'Informational; lumber already counted in the joist lines.',
      })
    }
    // ---- rim ----
    if (fr.rimLen > 0.5) {
      const rimCuts = fr.rimSegs.map(segLen)
      const allRim = f.doubleRim ? [...rimCuts, ...rimCuts] : rimCuts
      for (const seg of allRim) cut(S.framing, sp, f.joistSize, seg, `${tier.name} rim joist${f.doubleRim ? ' (doubled)' : ''}`)
      // tape caps the ASSEMBLED rim once, even where it is two plies thick
      tapeSingleLf += f.doubleRim ? fr.rimLen / 2 : fr.rimLen
    }

    // ---- beams ----
    for (const bm of fr.beams) {
      cut(S.framing, sp, f.beamSize, bm.len, `${tier.name} beam plies, ${f.beamPly}-ply ${bm.style} beam`, f.beamPly)
      // multi-ply beams are laminated: 2 rows of structural screws @ ~16" oc
      beamLaminationLf += bm.len * (f.beamPly - 1)
      if (f.beamPly === 2) tapeDoubleLf += bm.len
      else tapeTripleLf += bm.len
    }

    // ---- blocking ----
    const blockLf = fr.blocking.reduce((s, b) => s + b.lf, 0)
    if (blockLf > 0.5) {
      // real pieces: one per joist bay, cut on site
      const bayFt = Math.max(0.5, (f.spacing - 1.5) / 12)
      cut(S.framing, sp, f.joistSize, bayFt, `${tier.name} blocking (cut between joists)`, Math.ceil(blockLf / bayFt - 1e-9))
      tapeSingleLf += blockLf
    }

    // ---- posts ----
    if (fr.posts.length > 0) {
      // each post is its own cut at ITS beam's underside (drop girders sit
      // lower than flush girders — the heights can differ on one deck)
      for (const post of fr.posts) cut(S.framing, sp, '6x6', post.heightFt + 0.5, `${tier.name} support posts`)
      acc({ section: S.hardware, item: 'ABA66Z post base', sku: 'hw:aba66z', detail: `${tier.name} standoff post base`, qty: fr.posts.length, unit: 'ea' })
      // each post base sets on a 1/2" anchor in the footing (per Vivid's standard detail)
      acc({ section: S.hardware, item: '1/2" x 5-1/2" concrete anchor bolt + washer', sku: 'hw:anchor-bolt', detail: `${tier.name} post-base anchors`, qty: fr.posts.length, unit: 'ea' })
      // post caps follow each post's beam construction
      const dropPosts = fr.posts.filter((p) => p.beamStyle === 'drop').length
      const flushPosts = fr.posts.length - dropPosts
      if (dropPosts > 0) {
        acc({ section: S.hardware, item: 'BCS2-3/6 post cap', sku: 'hw:bcs2', detail: `${tier.name} post-to-beam connection (drop girders)`, qty: dropPosts, unit: 'ea' })
      }
      if (flushPosts > 0) {
        acc({ section: S.hardware, item: 'LCE/AC post cap', sku: 'hw:lce4', detail: `${tier.name} post-to-beam connection (flush girder)`, qty: flushPosts, unit: 'ea' })
      }
      // lateral / diagonal 6x6 knee bracing above the height threshold
      if (fr.bracingRequired && fr.braceCount > 0) {
        const braceLen = fr.braceLegFt * Math.SQRT2 + 0.5 // 45° brace + cut trim
        cut(
          S.framing,
          sp,
          '6x6',
          braceLen,
          `${tier.name} 6x6 knee braces @ 45° — posts ${ftIn(fr.postTopFt)} tall (≈2 per post)`,
          fr.braceCount,
        )
        acc({
          section: S.hardware,
          item: '1/2" x 6" carriage bolts (brace)',
          sku: 'hw:carriage-bolt-6',
          detail: `${tier.name} knee braces — two per brace end`,
          qty: fr.braceCount * 2,
          unit: 'ea',
        })
      }
    }

    // ---- hangers, ties & band screws ----
    // fr.hangers holds only LOAD-CARRYING joist ends (ledger + flush-beam faces).
    // Cantilever tips are in fr.bandEnds and take structural screws, not hangers.
    const hangerQty = fr.hangers.length
    if (hangerQty > 0) {
      acc({
        section: S.hardware,
        item: `${HANGER_NAME[f.joistSize]} joist hanger`,
        sku: `hw:hanger-${f.joistSize}`,
        detail: `${tier.name} joist hangers — ledger${fr.beams.some((b) => b.style === 'flush') ? ' + flush-beam' : ''} bearings`,
        qty: hangerQty,
        unit: 'ea',
      })
    }
    if (fr.ties.length > 0) {
      acc({ section: S.hardware, item: 'H2.5A hurricane tie', sku: 'hw:h25a', detail: `${tier.name} joist-to-drop-beam ties`, qty: fr.ties.length, unit: 'ea' })
    }
    const nailCount = hangerQty * 10 + fr.ties.length * 5
    if (nailCount > 0) {
      acc({
        section: S.hardware,
        item: 'Joist-hanger nails 1-1/2" (10d)',
        sku: 'hw:hanger-nail',
        detail: `${tier.name} connector nails`,
        qty: nailCount,
        roundTo: 100,
        unit: 'ea',
        note: 'Boxes of 100.',
      })
    }
    // 3 structural screws per band-board/joist-end connection, 2 per LF of
    // blocking, plus ply lamination on multi-ply beams (2 rows @ 16" oc)
    const frameScrewQty = fr.bandEnds.length * 3 + blockLf * 2 + beamLaminationLf * 1.5
    if (frameScrewQty > 0) {
      acc({
        section: S.hardware,
        item: '#10 x 3-1/8" structural frame screws',
        sku: 'hw:frame-screw',
        detail: `${tier.name}: ${fr.bandEnds.length} band/joist-end connections (3 ea), blocking & beam lamination`,
        qty: frameScrewQty,
        roundTo: 50,
        unit: 'ea',
      })
    }

    // ---- decking boards ----
    // Field, breaker and picture-frame boards each carry THEIR OWN color (all
    // from the same collection — families never mix). When an accent matches
    // the field, identical item + SKU merge back into one order line.
    const stocks = tier.decking.stockLengths.length > 0 ? tier.decking.stockLengths : rd.profile.lengthsFt
    const pack = packCuts(dk.fieldCuts, stocks)
    for (const [stock, count] of [...pack.byStock].sort((a, b) => a[0] - b[0])) {
      acc({
        section: S.decking,
        item: `${productName}, ${rd.profile.name} x ${stock}'`,
        sku: `decking:${rd.line.id}|${profileKind(rd.profile)}|${rd.color}|${stock}`,
        detail: `${tier.name} field boards (${rd.line.brand})`,
        qty: count,
        unit: 'ea',
      })
    }
    if (dk.breakerCuts.length > 0) {
      const bpack = packCuts(dk.breakerCuts, stocks)
      for (const [stock, count] of [...bpack.byStock].sort((a, b) => a[0] - b[0])) {
        acc({
          section: S.decking,
          item: `${rd.line.name} — ${rd.breakerColor}, ${rd.profile.name} x ${stock}'`,
          sku: `decking:${rd.line.id}|${profileKind(rd.profile)}|${rd.breakerColor}|${stock}`,
          detail: `${tier.name} breaker (parting) boards`,
          qty: count,
          unit: 'ea',
        })
      }
    }
    if (dk.frameCuts.length > 0) {
      // border boards may be a wider profile than the field (e.g. a 1x8 border
      // around a 1x6 field) — order them on their own stock lengths
      const pfStocks = rd.pfProfile.lengthsFt
      const fpack = packCuts(dk.frameCuts, pfStocks)
      const ringLabel = tier.decking.pictureFrame === 2 ? 'double picture frame' : 'picture frame'
      for (const [stock, count] of [...fpack.byStock].sort((a, b) => a[0] - b[0])) {
        acc({
          section: S.decking,
          item: `${rd.line.name} — ${rd.pfColor}, ${rd.pfProfile.name} x ${stock}'`,
          sku: `decking:${rd.line.id}|${profileKind(rd.pfProfile)}|${rd.pfColor}|${stock}`,
          detail: `${tier.name} ${ringLabel} (mitred) — ${ftIn(tier.decking.pictureFrame * dk.pfPitchFt)} wide border`,
          qty: count,
          unit: 'ea',
        })
      }
      const pfLf = fr.pfBlocking.reduce((s, b) => s + b.lf, 0)
      if (pfLf > 0.5) {
        const bayFt = Math.max(0.5, (f.spacing - 1.5) / 12)
        cut(
          S.framing,
          sp,
          f.joistSize,
          bayFt,
          `${tier.name} picture-frame border blocking (between joists, under the border seam)`,
          Math.ceil(pfLf / bayFt - 1e-9),
        )
        tapeSingleLf += pfLf
      }
    }
    acc({ section: S.decking, item: `Deck surface area — ${productName}`, detail: tier.name, qty: dk.areaSqft, unit: 'sq ft', exact: true })

    // ---- deck fasteners (system packs) ----
    const fastener = rd.fastener
    const screwColor = screwColorFor(rd.line, rd.color)
    if (fc.hidden > 0) {
      const pack0 = fastener.packs[0]
      acc({
        section: S.fasteners,
        item: `${fastener.name} — ${pack0.name}`,
        sku: fastener.id === 'concealoc' ? 'fast:concealoc-carton' : fastener.id === 'edgeloc' ? 'fast:edgeloc-pack' : undefined,
        detail: `${tier.name}: ${fc.hidden} ${fc.label} across joists`,
        qty: dk.areaSqft / pack0.coverSqft,
        unit: 'packs',
        note: fastener.packs.length > 1 ? `Larger packs available (${fastener.packs.slice(1).map((p) => p.coverSqft + ' SF').join(', ')}).` : undefined,
      })
      if (fastener.id === 'sideloc') {
        acc({ section: S.fasteners, item: `SIDELoc guide (${rd.profile.widthIn}" width)`, detail: 'Install guide + driver bits — 1 per crew', qty: 1, unit: 'ea' })
      }
    }
    if (fastener.method === 'top-screw-plug') {
      // Cortex: field + picture-frame + breakers all get screws + color plugs
      const totalScrews = fc.topScrews + fc.frameScrews
      if (totalScrews > 0) {
        acc({
          section: S.fasteners,
          item: `Cortex screws — ${productName}`,
          detail: `${tier.name}: top-down screws w/ plugs, field + picture frame + breakers (2 per joist crossing)`,
          qty: totalScrews,
          roundTo: 25,
          unit: 'ea',
          note: 'Order as 100 SF / 300 SF collated packs; plug packs of 80/400.',
        })
        acc({ section: S.fasteners, item: `Cortex plugs — ${productName}`, detail: `${tier.name}: color-matched plugs (incl. picture frame)`, qty: fc.plugs, roundTo: 80, unit: 'ea' })
      }
    } else {
      // field face screws (TOPLoc) or start/end + perimeter screws for hidden systems
      if (fc.topScrews > 0) {
        acc({
          section: S.fasteners,
          item: `TOPLoc screws — ${screwColor}`,
          sku: 'fast:toploc',
          detail:
            fastener.method === 'top-screw'
              ? `${tier.name}: top-down color-match field screws (2 per board per joist)`
              : `${tier.name}: start/end & perimeter field screws (with ${fastener.name})`,
          qty: fc.topScrews,
          roundTo: 25,
          unit: 'ea',
        })
      }
      // picture-frame + breaker boards are always face-fastened with composite
      // screws (they can't take hidden clips) — a dedicated, color-matched line
      if (fc.frameScrews > 0) {
        acc({
          section: S.fasteners,
          item: `Composite deck screws — ${screwColor} (color-match)`,
          sku: 'fast:composite-screw',
          detail: `${tier.name}: picture frame + breaker boards, 2 per joist/blocking crossing`,
          qty: fc.frameScrews,
          roundTo: 25,
          unit: 'ea',
          note: 'TimberTech composite/color-match screws; Cortex frame kit optional for a plugged finish.',
        })
      }
    }

    // ---- fascia & risers ----
    if (tp.fasciaLf > 0.5 && rd.line.fascia) {
      acc({
        section: S.decking,
        item: `${rd.line.name} fascia ${rd.line.fascia.widthIn}" x 12' — ${rd.fasciaColor}`,
        sku: `fascia:${rd.line.id}|${rd.fasciaColor}|12`,
        detail: `${tier.name} fascia wrap`,
        qty: tp.fasciaLf / 12,
        unit: 'ea',
      })
      acc({
        section: S.fasteners,
        item: `TOPLoc fascia screws — ${screwColor}`,
        sku: 'fast:toploc-fascia',
        detail: `${tier.name} fascia (2 per joist bay)`,
        qty: tp.fasciaLf * 2,
        roundTo: 100,
        unit: 'ea',
        note: 'Cortex fascia packs (50 lin ft) also available for composite.',
      })
    }

    // ---- railing (per-tier runs; system-level parts) ----
    if (rl.totalLf > 0.5) {
      railingBomForTier(project, tier.name, rl, rd.profile.edge === 'square' && !rd.line.scalloped ? productName : null, acc)
    }

    // ---- concrete ----
    if (fr.footings.length > 0) {
      let volCf = 0
      const byDia = new Map<number, number>()
      for (const ftg of fr.footings) {
        const rFt = ftg.diaIn / 24
        volCf += Math.PI * rFt * rFt * ((ftg.depthIn + 6) / 12)
        byDia.set(ftg.diaIn, (byDia.get(ftg.diaIn) ?? 0) + 1)
      }
      const dias = [...byDia.keys()].sort((a, b) => a - b)
      acc({
        section: S.concrete,
        item: '80 lb concrete bag',
        sku: 'yard:SAKRETE 80lb High Strength',
        detail: `${tier.name}: ${fr.footings.length} footings Ø${dias.join('"/')}", ${project.settings.frostDepth}" deep`,
        qty: volCf / 0.6,
        unit: 'bags',
        note: 'Or ready-mix.',
      })
      // forms are a distinct SKU per diameter — one merged line is unorderable
      for (const [dia, count] of [...byDia].sort((a, b) => a[0] - b[0])) {
        acc({ section: S.concrete, item: `Concrete tube form Ø${dia}" x 48"`, sku: `misc:tube-${dia}`, detail: `${tier.name} footings`, qty: count, unit: 'ea' })
      }
    }
  }

  // ---- stairs ----
  for (const sc of stairs) {
    if (!sc.ok) continue
    const rd = resolveDecking(sc.tier)
    const label = `${sc.tier.name} ${sc.wrapped ? 'wrap steps' : 'stairs'} (${sc.riserCount} risers)`
    const sSpecies = SPECIES_LABEL[sc.tier.framing.species]
    cut(
      S.stairs,
      sSpecies,
      '2x12',
      sc.stringerLenFt,
      sc.wrapped ? `${label} — short stringers @ 12" oc along every leg` : `${label} — stringers`,
      sc.stringerCount,
    )
    tapeSingleLf += sc.stringerCount * sc.stringerLenFt
    if (sc.wrapped) {
      // every mitred corner is carried on a hip with solid blocking under it
      const hipLen = sc.totalRunFt + 1.5 // miter run + trim
      cut(S.stairs, sSpecies, '2x12', hipLen, `${label} — corner hip`, sc.wrapCorners)
      cut(S.stairs, sSpecies, '2x12', 1.5, `${label} — blocking under the mitre`, 3 * sc.wrapCorners)
      tapeSingleLf += (hipLen + 4.5) * sc.wrapCorners
    }
    // treads act like a picture frame: the boards that cover each tread + a
    // mitred nose/side border, 45° mitred so no board ends show. Cut loss is
    // covered by the company waste allowance (no extra fudge — no double dip).
    const boardsPerTread = sc.treadBoards.length
    const bwFt = rd.profile.widthIn / 12
    const treadLf = sc.wrapped ? sc.treadSqft / bwFt : sc.treadCount * boardsPerTread * sc.attachWidthFt
    if (treadLf > 0) {
      const borderLf = sc.wrapped ? 0 : sc.treadCount * (sc.attachWidthFt + 2 * (sc.treadIn / 12))
      const ripped = sc.treadBoards.filter((b) => b.ripped)
      acc({
        section: S.stairs,
        item: `${rd.line.name} — ${rd.color}, tread boards x 12'`,
        sku: `decking:${rd.line.id}|${profileKind(rd.profile)}|${rd.color}|12`,
        detail: sc.wrapped
          ? `${label} — cascading treads, mitred through ${sc.wrapCorners} corner${sc.wrapCorners > 1 ? 's' : ''}`
          : `${label} — ${boardsPerTread} boards per ${ftIn(sc.treadIn / 12)} tread, picture-framed + 45° mitred`,
        qty: (treadLf + borderLf) / 12,
        unit: 'ea',
        note: ripped.length > 0 ? `Back board ripped to ${ripped[0].widthIn}" to finish the tread.` : undefined,
      })
    }
    // TimberTech riser boards close each riser (fascia stock where no riser profile)
    const riserLf = sc.riserSqft / (sc.riserIn / 12)
    if (rd.line.riser) {
      acc({
        section: S.stairs,
        item: `${rd.line.name} riser board 7-1/4" x 12' — ${rd.color}`,
        sku: `riser:${rd.line.id}|${rd.color}|12`,
        detail: sc.wrapped
          ? `${label} — riser faces follow the wrap (${sc.wrapCorners} corner${sc.wrapCorners > 1 ? 's' : ''})`
          : `${label} — risers (${sc.riserCount} × ${ftIn(sc.attachWidthFt)} wide)`,
        qty: riserLf / 12,
        unit: 'ea',
      })
    } else if (rd.line.fascia) {
      acc({
        section: S.stairs,
        item: `${rd.line.name} fascia as riser 12" x 12' — ${rd.color}`,
        sku: `fascia:${rd.line.id}|${rd.color}|12`,
        detail: `${label} — risers (no dedicated riser profile in this line)`,
        qty: riserLf / 12,
        unit: 'ea',
      })
    }
    acc({ section: S.stairs, item: 'LSCZ stringer connector', sku: 'hw:lscz', detail: `${label} — hangs each stringer off the rim/header`, qty: sc.stringerCount, unit: 'ea' })
    // mid-span stringer supports: girder + 6x6 posts + footings, like any girder
    for (const ms of sc.midSupports) {
      const girderLen = sc.attachWidthFt + 0.5
      cut(S.stairs, sSpecies, sc.tier.framing.beamSize, girderLen, `${label} — mid-span stringer girder @ ${ftIn(ms.xFt)} out (2-ply)`, 2)
      tapeDoubleLf += girderLen
      cut(S.stairs, sSpecies, '6x6', ms.postTopFt + 0.5, `${label} — mid-span girder posts`, ms.posts.length)
      acc({ section: S.hardware, item: 'ABA66Z post base', sku: 'hw:aba66z', detail: `${label} — stair girder post bases`, qty: ms.posts.length, unit: 'ea' })
      acc({ section: S.hardware, item: '1/2" x 5-1/2" concrete anchor bolt + washer', sku: 'hw:anchor-bolt', detail: `${label} — stair girder post anchors`, qty: ms.posts.length, unit: 'ea' })
      acc({ section: S.hardware, item: 'BCS2-3/6 post cap', sku: 'hw:bcs2', detail: `${label} — stair girder post caps`, qty: ms.posts.length, unit: 'ea' })
      acc({ section: S.hardware, item: 'H2.5A hurricane tie', sku: 'hw:h25a', detail: `${label} — each stringer tied to the mid-span girder`, qty: sc.stringerCount, unit: 'ea' })
      // footings: Ø12 tubes to frost depth under each post
      const rFt = 12 / 24
      const volCf = ms.posts.length * Math.PI * rFt * rFt * ((project.settings.frostDepth + 6) / 12)
      acc({
        section: S.concrete,
        item: '80 lb concrete bag',
        sku: 'yard:SAKRETE 80lb High Strength',
        detail: `${label} — ${ms.posts.length} girder footings Ø12", ${project.settings.frostDepth}" deep`,
        qty: volCf / 0.6,
        unit: 'bags',
        note: 'Or ready-mix.',
      })
      acc({ section: S.concrete, item: 'Concrete tube form Ø12" x 48"', sku: 'misc:tube-12', detail: `${label} — mid-span girder footings`, qty: ms.posts.length, unit: 'ea' })
    }
    // the rim carrying the stringers gets doubled across the opening (header);
    // attachWidthFt already covers every leg of a wrapped span
    const headerLen = sc.attachWidthFt + 2
    cut(S.stairs, sSpecies, sc.tier.framing.joistSize, headerLen, `${label} — rim header doubling across the stair opening (${ftIn(headerLen)})`)
    tapeSingleLf += headerLen
    acc({
      section: S.stairs,
      item: `TOPLoc tread screws — ${screwColorFor(rd.line, rd.color)}`,
      sku: 'fast:toploc',
      detail: `${label} — 2 per board per stringer`,
      qty: sc.wrapped ? sc.treadSqft * 5 : sc.treadCount * boardsPerTread * sc.stringerCount * 2,
      roundTo: 25,
      unit: 'ea',
    })
    if (sc.guardRequired) {
      const system = railSystemById(project.settings.railing.systemId) ?? RAILING_SYSTEMS[0]
      const rcfg = project.settings.railing
      // stair sections come 6' — a long rake splits into equal bays with an
      // intermediate post at every break (matches the drawings)
      const rakeSlopeFt = Math.hypot(sc.totalRunFt, sc.rise)
      const stairBays = Math.max(1, Math.ceil(rakeSlopeFt / 6))
      const stairSectionSku =
        system.id === 'irx'
          ? `rail:irx-stair-panel-${rcfg.heightIn}x6|${rcfg.colorId}`
          : system.id === 'statement' || system.id === 'pinnacle'
            ? `rail:${system.id}-stair-kit-${rcfg.heightIn}|${rcfg.colorId}`
            : 'rail:stair-rail-6'
      acc({
        section: S.railing,
        item: `${system.name} stair ${system.id === 'irx' ? 'panel' : 'rail section'} 6' — ${rcfg.colorId}`,
        sku: stairSectionSku,
        detail: `${label} — guard both sides (${stairBays} bay${stairBays > 1 ? 's' : ''} per side)`,
        qty: 2 * stairBays,
        unit: 'ea',
        note: 'Omit a side that runs along a wall.',
      })
      if (system.id === 'irx') {
        // IRX stair panels are panel-only — the top rail is a separate part, cut on the rake
        const sTop = system.topStyles.find((t) => t.id === rcfg.topStyleId) ?? system.topStyles[0]
        const sTopKind = sTop.id === 'irx-modern' ? 'modern' : 'classic'
        acc({
          section: S.railing,
          item: `IRX ${sTop.drinkRail ? 'Classic Top Rail' : sTop.name} 6' (stair rake) — ${rcfg.colorId}`,
          sku: `rail:irx-top-${sTop.drinkRail ? 'classic' : sTopKind}-6|${rcfg.colorId}`,
          detail: `${label} — top rail over each stair panel`,
          qty: 2 * stairBays,
          unit: 'ea',
        })
      }
      // Statement / Pinnacle stair sections take their own stair bracket kits
      if (system.id === 'statement' || system.id === 'pinnacle') {
        acc({
          section: S.railing,
          item: `${system.name} stair rail bracket kit`,
          sku: `rail:${system.id}-stair-brackets`,
          detail: `${label} — 1 kit per stair section`,
          qty: 2 * stairBays,
          unit: 'ea',
        })
      }
      // top posts are SHARED with the deck guard run (one post per 90° turn —
      // level rail and rake connect on adjacent faces), so a railed edge only
      // adds the 2 bottom posts here; the tops are in the deck run's count
      const edgeRailed = !!sc.tier.edges[sc.stairs.edgeIndex]?.railing
      // use the post the user actually selected — not the system's generic post
      const stairPost = resolvePost(system, rcfg.postOptionId, 'end')
      const midPosts = 2 * (stairBays - 1)
      const stairPostQty = (edgeRailed ? 2 : 4) + midPosts
      const stairPostSku =
        system.id === 'irx'
          ? `rail:irx-post|${rcfg.heightIn === 36 ? '38.25' : '43.5'}|${rcfg.colorId}`
          : system.compositeSteelPosts
            ? 'rail:sleeve-ccs-4x4'
            : `rail:${system.id}-sleeve-${rcfg.heightIn}|${rcfg.colorId}`
      acc({
        section: S.railing,
        item: `${stairPost.name} — ${rcfg.colorId}`,
        sku: stairPostSku,
        detail: `${label} — stair rail ${edgeRailed ? 'bottom' : ''} posts${midPosts > 0 ? ` + ${midPosts} intermediates on the rake` : ''}`,
        qty: stairPostQty,
        unit: 'ea',
        note: edgeRailed ? 'Top posts shared with the deck guard corner posts.' : undefined,
      })
      // every stair post is finished like the deck run's — cap + skirt each
      if (system.postAccessory && !system.postAccessory.integral) {
        const capName2 = system.postAccessory.caps.find((cp) => cp.id === rcfg.postCapId)?.name ?? system.postAccessory.caps[0]?.name ?? 'Post cap'
        acc({
          section: S.railing,
          item: `${capName2} + skirt`,
          sku: `rail:capskirt|${rcfg.colorId}`,
          detail: `${label} — stair rail posts`,
          qty: stairPostQty,
          unit: 'ea',
        })
      }
      // a composite top rail is not graspable — code wants a separate handrail
      acc({
        section: S.railing,
        item: `${system.name} graspable stair handrail kit — ${rcfg.colorId}`,
        sku: 'rail:handrail-kit',
        detail: `${label} — 34"–38" above the nosings, at least one side`,
        qty: 1,
        unit: 'ea',
        note: 'IRC R311.7.8: required at 4+ risers; a composite top rail alone does not satisfy the graspability rule.',
      })
    }
    acc({
      section: S.concrete,
      item: '80 lb concrete bag',
      sku: 'yard:SAKRETE 80lb High Strength',
      detail: `${label} — landing pad`,
      qty: ((sc.baseFrontLf + 1) * 3 * (4 / 12)) / 0.6,
      unit: 'bags',
      note: 'Optional pad 4" thick.',
    })
  }

  // ---- PRO-TAC joist tape (required on every deck) ----
  const tapeLine = (widthIn: number, lf: number, detail: string) => {
    if (lf < 1) return
    const roll = PRO_TAC.rolls.find((r) => r.widthIn === widthIn)
    if (!roll) return
    acc({
      section: S.tape,
      item: `${PRO_TAC.name} ${widthIn}" x ${roll.lengthFt}'`,
      sku: `tape:${widthIn}x${roll.lengthFt}`,
      detail,
      qty: lf / roll.lengthFt,
      unit: 'rolls',
    })
  }
  tapeLine(1.625, tapeSingleLf, `Single joists, rim, blocking & stringers (${Math.round(tapeSingleLf)} lf)`)
  tapeLine(3.25, tapeDoubleLf, `2-ply beams (${Math.round(tapeDoubleLf)} lf)`)
  tapeLine(4, tapeTripleLf, `3-ply beams (${Math.round(tapeTripleLf)} lf)`)
  tapeLine(12, tapeLedgerLf, `Ledger wrap (${Math.round(tapeLedgerLf)} lf)`)

  // ---- lumber: pack every cut pool into cost-optimal stock boards ----
  // Stock = the priced lengths for each size (lumber comes in 2' steps, 8'
  // minimum; a length with no price isn't buyable). The planner compares real
  // per-length prices — lumber does NOT scale $/lf — and every demand is
  // bought at FULL length: a 16' rim is one 16' board, never two 8s.
  const cutPlans: LumberPlan[] = []
  for (const p of [...pools.values()].sort((a, b) => a.section.localeCompare(b.section) || a.size.localeCompare(b.size))) {
    const stocks = stockFor(p.size)
    const plan = planCuts(p.demands, stocks, (L) => unitCostDetail(`lumber:${p.size}-${L}`)?.cost ?? null)
    const isPost = p.size.startsWith('6x6')
    for (const [L, count] of [...plan.byStock].sort((a, b) => a[0] - b[0])) {
      // details: every use that landed on this stock length
      const labels: string[] = []
      for (const b of plan.boards) {
        if (b.stockFt !== L) continue
        for (const c of b.cuts) if (!labels.includes(c.label)) labels.push(c.label)
      }
      acc({
        section: p.section,
        item: isPost ? `6x6-${L}' PT post — ground contact` : `${p.size}-${L}' PT — ${p.speciesLabel}`,
        sku: `lumber:${p.size}-${L}`,
        detail: labels.join('; '),
        qty: count,
        unit: 'ea',
      })
    }
    for (const o of plan.overlong) {
      // lumber comes in 2' steps — the special order is the next even length up
      const evenL = Math.ceil(o.lenFt / 2) * 2
      acc({
        section: p.section,
        item: `${p.size}-${evenL}' special order`,
        sku: `lumber:${p.size}-${evenL}`,
        detail: `${o.label} — ${ftIn(o.lenFt)} exceeds stocked lengths`,
        qty: 1,
        unit: 'ea',
        note: 'Special-order the FULL length — structural runs are never built up from shorter boards.',
      })
    }
    if (plan.boards.length > 0) cutPlans.push({ ...plan, section: p.section, size: p.size, speciesLabel: p.speciesLabel })
  }

  // ONE uniform waste allowance on everything you CUT — lumber, boards, fascia,
  // risers, tape, fasteners, concrete. The list you hand the yard already
  // includes it, so the order and the cost agree. (Per-line 5%/10% fudges were
  // removed so this can't compound.)
  //
  // Rail kits, posts and Simpson connectors are ordered to EXACT count: cutting
  // a rail section to length doesn't consume a second section, and nobody buys
  // 10% of a post.
  const wasteMul = 1 + Math.max(0, project.settings.quote.materialWastePct) / 100
  const exactCount = new Set<string>([S.railing, S.hardware])

  // materialize: round each SKU's summed quantity ONCE to its order increment
  const out: BomLine[] = []
  for (const e of merged.values()) {
    const wasted = e.exact || exactCount.has(e.section) ? e.raw : e.raw * wasteMul
    const qty = e.exact ? Math.round(wasted * 10) / 10 : Math.ceil(wasted / e.roundTo - 1e-9) * e.roundTo
    if (qty <= 0) continue
    out.push({
      section: e.section,
      item: e.item,
      detail: e.details.join('; '),
      qty,
      unit: e.unit,
      ...(e.notes.length > 0 ? { note: e.notes.join(' ') } : {}),
      ...(e.sku ? { sku: e.sku } : {}),
      ...(e.exact ? { informational: true } : {}),
    })
  }
  out.sort((a, b) => a.section.localeCompare(b.section) || a.item.localeCompare(b.item))
  return { lines: out, cutPlans }
}

/** Map a catalog infill id to the price sheet's baluster family. */
function balKind(id: string): string {
  if (id.includes('comp')) return 'composite'
  if (id.includes('square')) return 'square-al'
  return 'round-al'
}

/** Map a catalog top-style id to the price sheet's rail family. */
function topKey(id: string): string {
  if (id.includes('radiance')) return 'radiance'
  if (id.includes('trademark')) return 'trademark'
  return 'premier'
}

/** Product-level railing takeoff for one tier's runs. */
function railingBomForTier(
  project: Project,
  tierName: string,
  rl: RailingResult,
  drinkBoardName: string | null,
  acc: (l: AccInput) => void,
) {
  const cfg = project.settings.railing
  const system: RailingSystem = railSystemById(cfg.systemId) ?? RAILING_SYSTEMS[0]
  const top = system.topStyles.find((t) => t.id === cfg.topStyleId) ?? system.topStyles[0]
  const inf = system.infills.find((i) => i.id === cfg.infillId) ?? system.infills[0]
  const color = cfg.colorId
  const S6 = '6 — Railing'
  const irxHCable = system.id === 'irx' && inf.kind === 'cable-horizontal'
  const irxTopKind = top.id === 'irx-modern' ? 'modern' : 'classic'

  // stock sections per equal bay (posts evenly spaced; sections cut down on site)
  const sectionCounts = new Map<number, number>()
  for (const piece of rl.pieces) {
    for (const s of piece.sectionPlan) sectionCounts.set(s, (sectionCounts.get(s) ?? 0) + 1)
  }
  const cutNote = rl.pieces.some((p) => p.len / p.sectionPlan.length < p.sectionPlan[0] - 0.05)
    ? 'Sections cut on site to the even post spacing.'
    : undefined

  for (const [len, count] of [...sectionCounts].sort((a, b) => a[0] - b[0])) {
    if (system.id === 'classic-composite') {
      acc({ section: S6, item: `Universal Rail Pack ${len}' — ${color}`, sku: `rail:ccs-pack|${len}|${color}`, detail: `${tierName}: bottom + support rails, hardware, footblocks`, qty: count, unit: 'ea', note: cutNote })
      acc({
        section: S6,
        item: `${top.name} ${len}' — ${top.drinkRail ? 'panel cover' : color}`,
        sku: top.drinkRail ? `rail:ccs-drink-${len}|${color}` : `rail:top|${topKey(top.id)}|${len}|${color}`,
        detail: top.drinkRail && drinkBoardName ? `${tierName}: drink rail capped with ${drinkBoardName}` : `${tierName}: top rail`,
        qty: count,
        unit: 'ea',
      })
    } else if (irxHCable) {
      // horizontal cable is NOT panelized: per opening = cable rail kit (center
      // baluster + top support channel + brackets) + top rail; cables ordered per run below
      acc({
        section: S6,
        item: `IRX Horizontal Cable Rail Kit ${len}' — ${color}`,
        sku: `rail:irx-hcable-kit-${len}|${color}`,
        detail: `${tierName}: center cable support + top channel + brackets (top rail separate)`,
        qty: count,
        unit: 'ea',
        note: cutNote,
      })
      acc({ section: S6, item: `IRX ${top.name} ${len}' — ${color}`, sku: `rail:irx-top-${irxTopKind}-${len}|${color}`, detail: `${tierName}: top rail`, qty: count, unit: 'ea' })
    } else if (system.id === 'irx') {
      const panelName =
        inf.kind === 'cable-vertical'
          ? 'Vertical Cable Panel'
          : inf.kind === 'glass'
            ? 'Universal Glass Panel Kit'
            : 'Universal Panel'
      acc({
        section: S6,
        item: `IRX ${panelName} ${len}' x ${cfg.heightIn}" — ${color}`,
        sku:
          inf.kind === 'glass'
            ? `rail:irx-glass-${cfg.heightIn}x${len}|${color}`
            : inf.kind === 'cable-vertical'
              ? `rail:irx-vcable-${cfg.heightIn}x${len}|${color}`
              : `rail:irx-panel-${cfg.heightIn}x${len}|${color}`,
        detail: `${tierName}: ${inf.name} (pre-assembled, top rail separate)`,
        qty: count,
        unit: 'ea',
        note: inf.kind === 'glass' ? '1/4" tempered glass sourced locally; 6\' kits only.' : undefined,
      })
      if (top.drinkRail) {
        // drink rail = Universal Panel Cover over the panel + clip hardware,
        // capped with the deck board (the board itself rides the decking order)
        acc({
          section: S6,
          item: `IRX Universal Panel Cover ${len}' (drink rail) — ${color}`,
          sku: `rail:irx-panel-cover-${len}|${color}`,
          detail: drinkBoardName ? `${tierName}: capped with ${drinkBoardName}` : `${tierName}: drink rail base`,
          qty: count,
          unit: 'ea',
        })
        acc({
          section: S6,
          item: 'IRX Drink Rail clip hardware kit (12 clips)',
          sku: 'rail:irx-drink-cliphw',
          detail: `${tierName}: 4 clips per 6' section, 6 per 8'`,
          qty: (count * (len === 8 ? 6 : 4)) / 12,
          unit: 'ea',
        })
      } else {
        acc({
          section: S6,
          item: `IRX ${top.name} ${len}' — ${color}`,
          sku: `rail:irx-top-${irxTopKind}-${len}|${color}`,
          detail: `${tierName}: top rail w/ collars`,
          qty: count,
          unit: 'ea',
        })
      }
      if (inf.kind === 'cable-vertical') {
        acc({
          section: S6,
          item: 'IRX vertical-cable support kit',
          sku: 'rail:irx-vcable-support',
          detail: `${tierName}: tensioning blocks + tool — 1 per panel; tension before securing posts`,
          qty: count,
          unit: 'ea',
        })
      }
      if (inf.kind === 'open-mid') {
        // per the 2026 guide: open mid-rail takes a Universal Panel Cover (the
        // mid rail itself) + an unpunched support channel, per section
        acc({
          section: S6,
          item: `IRX Universal Panel Cover ${len}' (open mid-rail) — ${color}`,
          sku: `rail:irx-panel-cover-${len}|${color}`,
          detail: `${tierName}: the mid rail below the open band`,
          qty: count,
          unit: 'ea',
        })
        acc({
          section: S6,
          item: `IRX unpunched support channel ${len}' (open mid-rail) — ${color}`,
          sku: `rail:irx-channel-${len}|${color}`,
          detail: `${tierName}: carries the balusters under the mid rail`,
          qty: count,
          unit: 'ea',
        })
      }
    } else {
      acc({
        section: S6,
        item: `${system.name} ${top.drinkRail ? 'rail panel (drink rail)' : 'rail kit'} ${len}' x ${cfg.heightIn}" — ${color}`,
        sku: `rail:${system.id}-kit|${len}x${cfg.heightIn}|${color}`,
        detail: `${tierName}: ${inf.name}`,
        qty: count,
        unit: 'ea',
        note: cutNote,
      })
      if (top.drinkRail) {
        acc({ section: S6, item: `${system.name} drink rail clip kit`, sku: `rail:${system.id}-drink-clips`, detail: `${tierName}: board-to-rail clips`, qty: count, unit: 'ea' })
      }
      // Statement / Pinnacle rail sections mount on bracket kits — one per section
      if (system.id === 'statement' || system.id === 'pinnacle') {
        acc({
          section: S6,
          item: `${system.name} rail bracket kit (4 brackets + screws)`,
          sku: `rail:${system.id}-brackets`,
          detail: `${tierName}: 1 kit per straight level section`,
          qty: count,
          unit: 'ea',
        })
      }
      // Pinnacle decorative panels are SQUARE (29¾" / 35¾") — whole panels per
      // section, replacing the kit's balusters
      if (inf.kind === 'panel') {
        const sideFt = (cfg.heightIn === 42 ? 35.75 : 29.75) / 12
        const perSection = Math.max(1, Math.floor((len + 0.1) / (sideFt + 0.1)))
        acc({
          section: S6,
          item: `Pinnacle Decorative Panel "${inf.id.includes('web') ? 'Square Web' : 'Chippendale Type 1'}" for ${cfg.heightIn}" rails`,
          sku: `rail:pinnacle-panel|${inf.id.includes('web') ? 'square-web' : 'chippendale'}|${cfg.heightIn}`,
          detail: `${tierName}: ${perSection} per ${len}' section — panels replace the kit balusters; level sections only`,
          qty: count * perSection,
          unit: 'ea',
        })
      }
    }
  }

  // ---- infill extras ----
  if (system.id === 'classic-composite') {
    if (inf.kind === 'baluster' && rl.balusters > 0) {
      const packSize = inf.id === 'comp-bal' ? 18 : 20
      acc({
        section: S6,
        item: `${inf.name} ${cfg.heightIn === 36 ? '29"–31"' : '35"–37"'} — ${color}`,
        sku: `rail:bal|${balKind(inf.id)}|${cfg.heightIn === 36 ? '31"' : '37"'}|${color}`,
        detail: `${tierName}: ${rl.balusters} balusters`,
        qty: rl.balusters / packSize,
        unit: 'packs',
        note: `Packs of ${packSize}.`,
      })
    } else if (inf.kind === 'glass') {
      acc({ section: S6, item: `Glass channel kit 6' — ${color}`, sku: `rail:glass-channel-6|${color}`, detail: `${tierName}: tempered glass sourced locally`, qty: rl.sections, unit: 'ea' })
    } else if (inf.kind === 'cable-horizontal' && inf.cable) {
      // CableRail by Feeney: EACH SECTION is its own tensioned run
      const cables = inf.cable.cablesPerHeight[cfg.heightIn] ?? 9
      let intermediates = 0
      let cableLf = 0
      for (const [len, count] of sectionCounts) {
        intermediates += (inf.cable.intermediatesPer?.[len] ?? Math.max(1, Math.round(len / 6))) * count
        cableLf += (len + 1.5) * cables * count // +18" per section for terminations
      }
      acc({
        section: S6,
        item: `CableRail hardware kit ${cfg.heightIn}" (quick-connect + swivel fittings)`,
        sku: `rail:feeney-kit-${cfg.heightIn}`,
        detail: `${tierName}: 1 kit per section — each section is an independent tensioned run of ${cables} cables`,
        qty: rl.sections,
        unit: 'ea',
      })
      acc({
        section: S6,
        item: `CableRail intermediate baluster ${cfg.heightIn}" + support block`,
        sku: `rail:feeney-intermediate-${cfg.heightIn}`,
        detail: `${tierName}: 1 per 6' / 2 per 8' / 3 per 10' section`,
        qty: intermediates,
        unit: 'ea',
      })
      const spool500 = cableLf > 350
      acc({
        section: S6,
        item: `CableRail 1/8" stainless cable — ${spool500 ? "500'" : "100'"} spool`,
        sku: `rail:feeney-spool-${spool500 ? 500 : 100}`,
        detail: `${tierName}: ≈${Math.ceil(cableLf)} lf across ${rl.sections} sections`,
        qty: cableLf / (spool500 ? 500 : 100),
        unit: 'ea',
        note: 'Cut per section; cables cannot be reused once cut short.',
      })
    }
  }

  if (irxHCable && inf.cable) {
    // cables run continuously through inline/corner posts; one kit per cable per run, max 60'
    const cables = inf.cable.cablesPerHeight[cfg.heightIn] ?? 11
    const maxRun = inf.cable.maxRunFt ?? 60
    const kitLens = inf.cable.kitLengthsFt ?? [10, 20, 30, 40, 50, 60]
    const kitCounts = new Map<number, number>()
    let totalRuns = 0
    for (const chain of rl.chains) {
      const runs = Math.max(1, Math.ceil(chain.lenFt / maxRun))
      totalRuns += runs
      const runLen = chain.lenFt / runs + 1 // slack for terminations
      const kit = kitLens.find((k) => k >= runLen) ?? kitLens[kitLens.length - 1]
      kitCounts.set(kit, (kitCounts.get(kit) ?? 0) + runs * cables)
    }
    for (const [kitLen, count] of [...kitCounts].sort((a, b) => a[0] - b[0])) {
      acc({
        section: S6,
        item: `IRX cable kit ${kitLen}' (1 cable + stud, receiver & fast-receiver fittings, end caps)`,
        sku: `rail:irx-cable-kit-${kitLen}`,
        detail: `${tierName}: ${cables} cables per run × ${totalRuns} run(s); kits cannot be cut into two runs`,
        qty: count,
        unit: 'ea',
      })
    }
    acc({
      section: S6,
      item: 'IRX intermediate cable support (cut to height)',
      sku: 'rail:irx-cable-intermediate',
      detail: `${tierName}: 1 per opening, center of each post-to-post span`,
      qty: rl.sections,
      unit: 'ea',
    })
  }

  // posts
  if (irxHCable) {
    // dedicated pre-drilled posts by role — never standard rail posts
    let ends = 0
    let corners = 0
    for (const chain of rl.chains) {
      const runs = Math.max(1, Math.ceil(chain.lenFt / (inf.cable?.maxRunFt ?? 60)))
      ends += 2 * runs
      corners += chain.corners
    }
    const inline = Math.max(0, rl.posts - ends - corners)
    const h = cfg.heightIn === 36 ? '38"' : '43"'
    const hk = cfg.heightIn === 36 ? '38' : '43'
    acc({ section: S6, item: `IRX 3"x3" horizontal-cable END post kit ${h} — ${color}`, sku: `rail:irx-hcable-post-end|${hk}|${color}`, detail: `${tierName}: cable terminations (receiver / fast-receiver)`, qty: ends, unit: 'ea' })
    if (inline > 0)
      acc({ section: S6, item: `IRX 3"x3" horizontal-cable INLINE post kit ${h} — ${color}`, sku: `rail:irx-hcable-post-inline|${hk}|${color}`, detail: `${tierName}: cables pass through pre-drilled holes`, qty: inline, unit: 'ea' })
    if (corners > 0)
      acc({ section: S6, item: `IRX 3"x3" horizontal-cable 90° CORNER post kit (w/ insert) ${h} — ${color}`, sku: `rail:irx-hcable-post-corner|${hk}|${color}`, detail: `${tierName}: cables turn corners inside the post`, qty: corners, unit: 'ea' })
  } else {
    // count posts by role from the deduped placements (corners counted once)
    let lineCount = 0
    for (const pl of rl.postPlacements) {
      if (pl.role === 'line') lineCount++
    }
    const total = rl.postPlacements.length
    const capName = system.postAccessory?.caps.find((c) => c.id === cfg.postCapId)?.name ?? system.postAccessory?.caps[0]?.name ?? 'Post cap'
    if (system.compositeSteelPosts) {
      const line = lineCount
      const ends = Math.max(0, total - line)
      const smp = resolvePost(system, cfg.postOptionId, 'line')
      const sleeve = resolvePost(system, cfg.postOptionId, 'end')
      if (line > 0) {
        acc({
          section: S6,
          item: `${smp.name} — ${color}`,
          sku: 'rail:secure-mount',
          detail: `${tierName}: interior (line) posts — steel core, no 4x4 wood`,
          qty: line,
          unit: 'ea',
        })
        acc({ section: S6, item: 'Surface-mount post hardware + base cover', sku: 'rail:surface-mount-hw', detail: `${tierName}: lag/thru-bolt to doubled blocking below`, qty: line, unit: 'ea' })
      }
      if (ends > 0) {
        acc({ section: S6, item: "4x4-8' PT post", sku: 'lumber:4x4-8', detail: `${tierName}: structural post inside each end/corner sleeve, bolted to rim/blocking`, qty: ends, unit: 'ea' })
      }
      // EVERY post gets the same finished look: the sleeve goes over the steel
      // core on line posts just like it goes over the 4x4 on ends/corners,
      // then the cap + skirt on top — mid-run posts never read different
      acc({ section: S6, item: `${sleeve.name} — ${color}`, sku: 'rail:sleeve-ccs-4x4', detail: `${tierName}: sleeves over every post (steel cores + 4x4s)`, qty: total, unit: 'ea' })
      acc({ section: S6, item: `${capName} + skirt`, sku: `rail:capskirt|${color}`, detail: `${tierName}: every post — ${color}`, qty: total, unit: 'ea' })
    } else {
      const opt = selectedPostOption(system, cfg.postOptionId)
      const heightNote = system.post.sleeveOverWood && cfg.heightIn === 42 ? " (8' for 42\" rail)" : ''
      const postSku =
        system.id === 'irx'
          ? `rail:irx-post|${cfg.heightIn === 36 ? '38.25' : '43.5'}|${color}`
          : `rail:${system.id}-sleeve-${cfg.heightIn}|${color}`
      acc({ section: S6, item: `${opt.name}${heightNote} — ${color}`, sku: postSku, detail: `${tierName}: rail posts`, qty: total, unit: 'ea' })
      if (opt.mount === 'sleeve') {
        acc({ section: S6, item: "4x4-8' PT post", sku: 'lumber:4x4-8', detail: `${tierName}: plumb/level structural post inside each sleeve`, qty: total, unit: 'ea' })
        acc({ section: S6, item: `${capName} + skirt`, sku: `rail:capskirt|${color}`, detail: `${tierName}: ${color}`, qty: total, unit: 'ea' })
      }
    }
  }
  acc({
    section: S6,
    item: 'Rail-post hardware set',
    sku: 'rail:post-hw-set',
    detail: `${tierName}: brackets/bolts + 5/4 blocking under deck at each post location`,
    qty: rl.posts,
    unit: 'ea',
  })
  if (rl.gatesNote) {
    acc({ section: S6, item: `${system.name} gate kit (optional)`, detail: rl.gatesNote, qty: 0, unit: 'ea' })
  }
}

export function bomToCsv(lines: BomLine[], projectName: string, cutPlans?: LumberPlan[]): string {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const rows = [
    ['Vivid Outdoor Living — Material Order', '', '', '', '', ''],
    [`Project: ${projectName}`, '', '', '', '', ''],
    [`Generated: ${new Date().toLocaleDateString()}`, '', '', '', '', ''],
    ['Section', 'Item', 'Detail', 'Qty', 'Unit', 'Note'],
    ...lines.map((l) => [l.section, l.item, l.detail, String(l.qty), l.unit, l.note ?? '']),
  ]
  if (cutPlans && cutPlans.length > 0) {
    rows.push(['', '', '', '', '', ''])
    rows.push(['Lumber Cut Plan (order quantities above include the waste allowance)', '', '', '', '', ''])
    rows.push(['Size', 'Board', 'Stock', 'Cuts', 'Offcut', ''])
    for (const p of cutPlans) {
      p.boards.forEach((b, i) => {
        rows.push([
          `${p.size} ${p.speciesLabel}`,
          String(i + 1),
          `${b.stockFt}'`,
          b.cuts.map((c) => `${ftIn(c.lenFt)} — ${c.label}`).join(' | '),
          ftIn(b.offcutFt),
          '',
        ])
      })
    }
  }
  return rows.map((r) => r.map(esc).join(',')).join('\r\n')
}
