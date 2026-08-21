import type { Project } from '../model/types'
import { MECKLENBURG_TAX_PCT } from '../model/defaults'
import { priceMaterials } from './pricing'
import type { BomLine } from './bom'
import { resolveDecking } from '../catalog/compat'
import { railSystemById, RAILING_SYSTEMS, selectedPostOption } from '../catalog/timbertech'
import { ftIn } from '../ui/format'
import type { TierComputed } from './index'
import type { StairsCalc } from './stairs'

/**
 * Customer-facing proposal.
 *
 * Every category shows ONE number: the fully-installed price for that scope —
 * materials, labour, the sales tax Vivid pays at the yard, permits and profit,
 * all inside it. Vivid's cost, rates and margin never appear. The categories
 * add up to the total exactly, because the total IS their sum.
 *
 * Internal cost detail lives on `internal`, which the UI renders in a
 * `.no-print` panel for the rep only.
 */

export type QuoteUnit = 'sq ft' | 'lin ft' | 'ea'

export interface QuoteSpec {
  label: string
  value: string
}

export interface QuoteSection {
  id: string
  title: string
  blurb: string
  /** the customer's selections — no money */
  specs: QuoteSpec[]
  /** what the price covers, in plain language */
  includes: string[]
  /** headline quantity for this scope, e.g. 280 sq ft */
  qty: number | null
  unit: QuoteUnit | null
  /** fully-installed price, or null while a rate is still missing */
  price: number | null
  /** in scope but not yet priceable */
  pending: boolean
  /** switched off for this customer */
  omitted?: boolean
}

/** Per-category cost build-up — rep only, never printed. */
export interface CategoryCost {
  id: string
  label: string
  material: number
  labor: number | null
  tax: number
  jobCosts: number
  /** order lines in this category with no price anywhere — they block the sell price */
  unpriced: number
  unpricedItems: string[]
  cost: number | null
  sell: number | null
}

export interface QuoteResult {
  sections: QuoteSection[]
  areaSqft: number
  /** sum of the category prices */
  total: number | null
  pendingLines: number
  internal: {
    labor: number | null
    materialCost: number
    wastePct: number
    materialTax: number
    permit: number
    drawings: number
    jobCost: number | null
    profit: number | null
    profitPct: number
    profitIsMarkup: boolean
    unpricedMaterialLines: number
    estimatedMaterialLines: number
    taxPct: number
    priceBookDate: string
    byCategory: CategoryCost[]
  }
}

/** Infills billed at the specialty railing rate. */
export const SPECIALTY_INFILL = new Set(['cable-horizontal', 'cable-vertical', 'glass'])

type Cat = 'deck' | 'railing' | 'stairs' | 'lighting' | 'demo'

/**
 * Which customer category each material order section belongs to. The deck
 * carries its own substructure — customers buy "a deck", not joists and footings.
 */
function categoryOf(section: string): Cat {
  if (section.includes('Railing')) return 'railing'
  if (section.includes('Stairs')) return 'stairs'
  return 'deck' // framing, hardware, tape, decking, fasteners, concrete, flashing
}

const cents = (n: number): number => Math.round(n * 100) / 100

/** True for a 4-corner axis-aligned rectangle (safe to quote as W × D). */
function isRectangle(outline: { x: number; y: number }[]): boolean {
  if (outline.length !== 4) return false
  for (let i = 0; i < 4; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % 4]
    if (!(Math.abs(a.x - b.x) < 0.02 || Math.abs(a.y - b.y) < 0.02)) return false
  }
  return true
}

/** Finished tread surface of one stair run (sq ft) — the walking surface. */
export function stairSurfaceSqft(sc: StairsCalc): number {
  return sc.treadSqft
}

/**
 * Finished stair surface for labour: treads AND risers together (Vivid bills
 * steps at $/sq ft of everything the crew faces off).
 */
export function stairFinishSqft(sc: StairsCalc): number {
  return sc.finishSqft
}

export function buildQuote(
  project: Project,
  byTier: Map<string, TierComputed>,
  stairs: StairsCalc[],
  bom: BomLine[],
): QuoteResult {
  const q = project.settings.quote
  const areaSqft = [...byTier.values()].reduce((s, t) => s + t.decking.areaSqft, 0)
  const okStairs = stairs.filter((s) => s.ok)
  const railLf = [...byTier.values()].reduce((s, t) => s + t.railing.totalLf, 0)

  // ---------------- material cost, bucketed by customer category ----------------
  const mat = priceMaterials(bom)
  const material: Record<Cat, number> = { deck: 0, railing: 0, stairs: 0, lighting: 0, demo: 0 }
  const unpricedBy: Record<Cat, string[]> = { deck: [], railing: [], stairs: [], lighting: [], demo: [] }
  for (const pl of mat.lines) {
    if (pl.line.informational) continue
    const cat = categoryOf(pl.line.section)
    if (pl.extended === null) {
      unpricedBy[cat].push(pl.line.item)
      continue
    }
    material[cat] += pl.extended
  }
  if (q.materialsOverride !== null && mat.priced > 0) {
    // scale a manual override across the categories in the same proportions
    const k = q.materialsOverride / mat.priced
    for (const c of Object.keys(material) as Cat[]) material[c] *= k
  }

  // ---------------- labour, by category ----------------
  const labor: Record<Cat, number | null> = { deck: 0, railing: 0, stairs: 0, lighting: 0, demo: 0 }
  let pendingLines = 0
  const rate = (v: number | null, qty: number, cat: Cat) => {
    if (v === null) {
      labor[cat] = null
      pendingLines++
      return
    }
    if (labor[cat] !== null) labor[cat] = (labor[cat] as number) + qty * v
  }

  for (const t of project.tiers) {
    const parts = byTier.get(t.id)
    if (!parts) continue
    const rd = resolveDecking(t)
    const isComposite = rd.line.material === 'composite' || rd.line.material === 'pvc' || rd.line.material === 'porch'
    rate(isComposite ? q.rates.deckingPerSqft : q.rates.deckingWoodPerSqft, parts.decking.areaSqft, 'deck')
  }

  const rcfg = project.settings.railing
  const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
  const rTop = rsys.topStyles.find((t) => t.id === rcfg.topStyleId) ?? rsys.topStyles[0]
  const rInf = rsys.infills.find((i) => i.id === rcfg.infillId) ?? rsys.infills[0]
  const rPost = selectedPostOption(rsys, rcfg.postOptionId)
  if (railLf > 0.5) {
    rate(SPECIALTY_INFILL.has(rInf.kind) ? q.rates.railingSpecialtyPerLf : q.rates.railingPerLf, railLf, 'railing')
  }

  const stairFinish = okStairs.reduce((s, sc) => s + stairFinishSqft(sc), 0)
  if (okStairs.length > 0) rate(q.rates.stepsPerSqft, stairFinish, 'stairs')
  if (q.lighting.enabled) rate(q.rates.lightingPerFixture, q.lighting.fixtures, 'lighting')
  if (q.demo.enabled) rate(q.rates.demoPerSqft, q.demo.areaSqft, 'demo')

  // ---------------- cost -> price, per category ----------------
  const taxPct = q.mecklenburg ? MECKLENBURG_TAX_PCT : q.taxPct
  const permit = q.costs.permit + (q.mecklenburg ? q.costs.mecklenburgPermitSurcharge : 0)
  const drawings = q.costs.drawings
  const p = q.profitMarginPct / 100
  const uplift = (cost: number) => cents(q.marginIsMarkup ? cost * (1 + p) : cost / Math.max(0.01, 1 - p))

  const LABEL: Record<Cat, string> = {
    deck: 'Deck',
    railing: 'Railing',
    stairs: 'Steps',
    lighting: 'Lighting',
    demo: 'Demolition',
  }
  const byCategory: CategoryCost[] = (Object.keys(LABEL) as Cat[]).map((id) => {
    const m = cents(material[id])
    const tax = cents((m * taxPct) / 100)
    // permits and engineered drawings are part of delivering the deck itself
    const jobCosts = id === 'deck' ? permit + drawings : 0
    const l = labor[id]
    // a category holding unpriced material must never quote low — it shows
    // "Pricing to follow" unless the rep took over with a materials override
    const matPending = unpricedBy[id].length > 0 && q.materialsOverride === null
    const cost = l === null || matPending ? null : cents(m + tax + l + jobCosts)
    return {
      id,
      label: LABEL[id],
      material: m,
      labor: l,
      tax,
      jobCosts,
      unpriced: unpricedBy[id].length,
      unpricedItems: unpricedBy[id],
      cost,
      sell: cost === null ? null : uplift(cost),
    }
  })
  const catById = (id: Cat) => byCategory.find((c) => c.id === id)!

  // ---------------- sections ----------------
  const sections: QuoteSection[] = []

  const levelSpecs: QuoteSpec[] = project.tiers.map((t) => {
    const parts = byTier.get(t.id)
    const area = Math.round(parts?.decking.areaSqft ?? 0)
    const size = isRectangle(t.outline)
      ? `${ftIn(Math.max(...t.outline.map((pt) => pt.x)) - Math.min(...t.outline.map((pt) => pt.x)))} × ${ftIn(
          Math.max(...t.outline.map((pt) => pt.y)) - Math.min(...t.outline.map((pt) => pt.y)),
        )} · ${area} sq ft`
      : `${area} sq ft · custom shape`
    return { label: t.name, value: `${size} · ${ftIn(t.height)} above grade` }
  })

  const deckSpecs: QuoteSpec[] = []
  for (const t of project.tiers) {
    const rd = resolveDecking(t)
    const feature: string[] = []
    if (t.decking.pictureFrame > 0) {
      const accent = rd.pfColor !== rd.color ? ` in ${rd.pfColor}` : ''
      feature.push(`${t.decking.pictureFrame === 2 ? 'double' : 'single'} picture-frame border${accent}`)
    }
    if (t.decking.angle === 45) feature.push('45° diagonal pattern')
    if (rd.breakerColor !== rd.color) feature.push(`${rd.breakerColor} inlay boards`)
    if (rd.fasciaColor !== rd.color && rd.line.fascia) feature.push(`${rd.fasciaColor} fascia`)
    deckSpecs.push({
      label: project.tiers.length > 1 ? t.name : 'Decking',
      value: `${rd.line.name} · ${rd.color} · ${rd.profile.name}${feature.length ? ` · ${feature.join(', ')}` : ''}`,
    })
  }

  sections.push({
    id: 'deck',
    title: project.tiers.length > 1 ? `Deck — ${project.tiers.length} levels` : 'Deck',
    blurb: `${Math.round(areaSqft)} square feet of finished outdoor living space, built on an engineered pressure-treated substructure.`,
    specs: [...levelSpecs, ...deckSpecs],
    includes: [
      'Engineered footings, posts, beams and joists to 2021 IRC',
      'Joist tape on every framing member',
      'Capped decking with concealed fasteners and a finished fascia wrap',
      'Building permit and engineered drawings',
    ],
    qty: Math.round(areaSqft * 10) / 10,
    unit: 'sq ft',
    price: catById('deck').sell,
    pending: catById('deck').sell === null,
  })

  sections.push({
    id: 'railing',
    title: 'Railing',
    blurb: railLf > 0.5 ? 'Top-mounted guard railing, colour-matched throughout.' : 'No railing in this design.',
    specs:
      railLf > 0.5
        ? [
            { label: 'System', value: `${rsys.name} — ${rcfg.colorId}` },
            { label: 'Top rail', value: rTop.name },
            { label: 'Infill', value: rInf.name },
            { label: 'Height', value: `${rcfg.heightIn}"` },
            { label: 'Posts', value: rPost.name },
          ]
        : [],
    includes: railLf > 0.5 ? ['Posts, rails, infill and all mounting hardware', 'Cut to even bays on every run'] : [],
    qty: railLf > 0.5 ? Math.round(railLf * 10) / 10 : null,
    unit: railLf > 0.5 ? 'lin ft' : null,
    price: railLf > 0.5 ? catById('railing').sell : null,
    pending: railLf > 0.5 && catById('railing').sell === null,
    omitted: railLf <= 0.5,
  })

  sections.push({
    id: 'stairs',
    title: 'Steps',
    blurb:
      okStairs.length > 0
        ? 'Treads picture-framed to match the deck — no exposed board ends — with matching riser boards.'
        : 'No steps in this design.',
    specs: okStairs.map((sc) => ({
      label: `${sc.tier.name} steps`,
      value: sc.wrapped
        ? `${sc.riserCount} risers · wrap around ${sc.wrapCorners} corner${sc.wrapCorners > 1 ? 's' : ''} · down to ${sc.landingLabel}`
        : `${sc.riserCount} risers · ${ftIn(sc.attachWidthFt)} wide · down to ${sc.landingLabel}`,
    })),
    includes:
      okStairs.length > 0
        ? ['Cut stringers, framed and hung off the deck', 'Picture-framed treads with matching risers', 'Concrete landing pad']
        : [],
    qty: okStairs.length > 0 ? okStairs.length : null,
    unit: okStairs.length > 0 ? 'ea' : null,
    price: okStairs.length > 0 ? catById('stairs').sell : null,
    pending: okStairs.length > 0 && catById('stairs').sell === null,
    omitted: okStairs.length === 0,
  })

  sections.push({
    id: 'lighting',
    title: 'Lighting',
    blurb: q.lighting.enabled
      ? 'Low-voltage lighting for posts, risers and accents.'
      : 'Lighting is not included in this proposal.',
    specs: [],
    includes: q.lighting.enabled ? ['Transformer, wiring and fixtures, fully installed'] : [],
    qty: q.lighting.enabled ? q.lighting.fixtures : null,
    unit: q.lighting.enabled ? 'ea' : null,
    price: q.lighting.enabled ? catById('lighting').sell : null,
    pending: q.lighting.enabled && catById('lighting').sell === null,
    omitted: !q.lighting.enabled,
  })

  sections.push({
    id: 'demo',
    title: 'Demolition',
    blurb: q.demo.enabled
      ? 'Tear-out and disposal of the existing structure before the new build begins.'
      : 'No demolition required.',
    specs: [],
    includes: q.demo.enabled ? ['Remove the existing structure', 'Haul away and dispose of all debris'] : [],
    qty: q.demo.enabled ? q.demo.areaSqft : null,
    unit: q.demo.enabled ? 'sq ft' : null,
    price: q.demo.enabled ? catById('demo').sell : null,
    pending: q.demo.enabled && catById('demo').sell === null,
    omitted: !q.demo.enabled,
  })

  // ---------------- totals ----------------
  const live = sections.filter((s) => !s.omitted)
  const total = live.some((s) => s.price === null) ? null : cents(live.reduce((s, x) => s + (x.price ?? 0), 0))

  const totalLabor = (Object.keys(labor) as Cat[]).some((c) => labor[c] === null)
    ? null
    : cents((Object.keys(labor) as Cat[]).reduce((s, c) => s + (labor[c] as number), 0))
  const materialCost = cents((Object.keys(material) as Cat[]).reduce((s, c) => s + material[c], 0))
  const materialTax = cents(byCategory.reduce((s, c) => s + c.tax, 0))
  const jobCost = totalLabor === null ? null : cents(materialCost + materialTax + totalLabor + permit + drawings)

  return {
    sections,
    areaSqft,
    total,
    pendingLines,
    internal: {
      labor: totalLabor,
      materialCost,
      wastePct: q.materialWastePct,
      materialTax,
      permit,
      drawings,
      jobCost,
      profit: jobCost === null || total === null ? null : cents(total - jobCost),
      profitPct: q.profitMarginPct,
      profitIsMarkup: q.marginIsMarkup,
      unpricedMaterialLines: mat.unpriced.length,
      estimatedMaterialLines: mat.estimated.length,
      taxPct,
      priceBookDate: mat.priceBookDate,
      byCategory,
    },
  }
}
