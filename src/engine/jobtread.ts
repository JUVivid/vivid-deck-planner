import type { Project } from '../model/types'
import { MECKLENBURG_TAX_PCT } from '../model/defaults'
import { resolveDecking } from '../catalog/compat'
import { railSystemById, RAILING_SYSTEMS } from '../catalog/timbertech'
import type { ProjectComputed } from './index'
import { priceMaterials } from './pricing'
import { SPECIALTY_INFILL, stairFinishSqft } from './quote'

/**
 * JobTread "Cost Group Template" import — Vivid's catalog-template.csv, one
 * row per cost item, EVERY column present in JobTread's order.
 *
 * How the estimate is reproduced exactly:
 *  - every material order line is a cost item (qty already carries the waste
 *    allowance), priced from the same book/receipt/retail chain as the quote;
 *  - the sales tax Vivid pays at the yard is its own cost item per material
 *    group (NC real-property contract: the customer is never charged tax, so
 *    `Taxable` is FALSE on everything and the tax is a cost);
 *  - labour is a cost item per scope at the rate card; permit and drawings
 *    are cost items under Permits & Drawings;
 *  - every item carries the company margin (45% by default) and an explicit
 *    unit price derived from it, so JobTread's totals equal the planner's.
 * A line the price book cannot price exports with a blank cost and a
 * "[PRICE NEEDED]" flag in its description — never a silent zero.
 */

export const JOBTREAD_HEADER = [
  'Cost Group Template Name',
  'Cost Group Name',
  'Cost Item Name',
  'Description',
  'Quantity',
  'Quantity Formula',
  'Unit',
  'Unit Cost',
  'Unit Cost Formula',
  'Unit Price',
  'Unit Price Formula',
  'Margin',
  'Cost Type',
  'Cost Code',
  'Taxable',
  'Selected',
  'Minimum Selections',
  'Maximum Selections',
  'Allowance Type',
  'Allows Customer Write-In',
  'Specification',
  'Require Specification Approval',
  'Show Child Costs',
  'Show Child Deltas',
  'Show Children',
  'Show Description',
  'Show Quantity',
  'Custom Field: Status',
] as const

/** JobTread's standard cost types (singular "Material"); "Other" for permits, drawings and tax. */
export type JobTreadCostType = 'Material' | 'Labor' | 'Other'

export interface JobTreadRow {
  group: string
  name: string
  description: string
  qty: number
  unit: string
  /** Vivid's cost per unit, or null when no price is on file */
  unitCost: number | null
  costType: JobTreadCostType
}

export const PRICE_NEEDED_FLAG = '[PRICE NEEDED — no supplier price on file]'

const GROUP_LABOR = 'Labor'
const GROUP_PERMITS = 'Permits & Drawings'

/** "1 — Framing Lumber" -> "Framing Lumber" */
export function groupNameOf(section: string): string {
  return section.replace(/^\d+\s+—\s+/, '')
}

/** JobTread-friendly unit names (singular). */
function unitOf(u: string): string {
  switch (u) {
    case 'sq ft':
      return 'sf'
    case 'bags':
      return 'bag'
    case 'rolls':
      return 'roll'
    case 'packs':
      return 'pack'
    default:
      return u
  }
}

const round = (n: number, places: number): number => {
  const k = 10 ** places
  return Math.round(n * k) / k
}

/** Every cost item of the estimate, in JobTread group order. */
export function buildJobTreadRows(project: Project, computed: ProjectComputed): JobTreadRow[] {
  const q = project.settings.quote
  const taxPct = q.mecklenburg ? MECKLENBURG_TAX_PCT : q.taxPct
  const rows: JobTreadRow[] = []

  // ---- materials: one item per order line, grouped by order section ----
  const priced = priceMaterials(computed.bom)
  const groupMaterial = new Map<string, number>()
  const groupOrder: string[] = []
  for (const pl of priced.lines) {
    const l = pl.line
    if (l.informational) continue
    const group = groupNameOf(l.section)
    if (!groupMaterial.has(group)) {
      groupMaterial.set(group, 0)
      groupOrder.push(group)
    }
    const unpriced = pl.unitCost === null
    const desc = [l.detail, l.note ?? '', unpriced ? PRICE_NEEDED_FLAG : ''].filter(Boolean).join(' ')
    rows.push({
      group,
      name: l.item,
      description: desc,
      qty: round(l.qty, 2),
      unit: unitOf(l.unit),
      unitCost: pl.unitCost,
      costType: 'Material',
    })
    if (pl.extended !== null) groupMaterial.set(group, groupMaterial.get(group)! + pl.extended)
  }
  // the yard tax on each group's materials — a cost, never a customer charge
  const taxRows: JobTreadRow[] = []
  for (const group of groupOrder) {
    const m = groupMaterial.get(group) ?? 0
    if (m <= 0) continue
    taxRows.push({
      group,
      name: `NC sales tax on materials (${taxPct}%)`,
      description: `Paid at the yard on this group's materials ($${round(m, 2).toFixed(2)}) — real property contract, not charged to the customer`,
      qty: 1,
      unit: 'ea',
      unitCost: round((m * taxPct) / 100, 2),
      costType: 'Other',
    })
  }
  // keep each group's tax row at the END of its group
  const ordered: JobTreadRow[] = []
  for (const group of groupOrder) {
    ordered.push(...rows.filter((r) => r.group === group))
    const t = taxRows.find((r) => r.group === group)
    if (t) ordered.push(t)
  }
  rows.length = 0
  rows.push(...ordered)

  // ---- labour, per scope, at the rate card ----
  for (const t of project.tiers) {
    const parts = computed.byTier.get(t.id)
    if (!parts) continue
    const rd = resolveDecking(t)
    const isComposite = rd.line.material === 'composite' || rd.line.material === 'pvc' || rd.line.material === 'porch'
    rows.push({
      group: GROUP_LABOR,
      name: `Decking installation — ${t.name}`,
      description: `${rd.line.name} ${rd.color}, ${isComposite ? 'composite/PVC' : 'wood'} rate; substructure, joist tape and fascia included`,
      qty: round(parts.decking.areaSqft, 1),
      unit: 'sf',
      unitCost: isComposite ? q.rates.deckingPerSqft : q.rates.deckingWoodPerSqft,
      costType: 'Labor',
    })
  }
  const railLf = [...computed.byTier.values()].reduce((s, t) => s + t.railing.totalLf, 0)
  if (railLf > 0.5) {
    const rcfg = project.settings.railing
    const rsys = railSystemById(rcfg.systemId) ?? RAILING_SYSTEMS[0]
    const rInf = rsys.infills.find((i) => i.id === rcfg.infillId) ?? rsys.infills[0]
    const specialty = SPECIALTY_INFILL.has(rInf.kind)
    rows.push({
      group: GROUP_LABOR,
      name: `Railing installation — ${rsys.name}${specialty ? ' (specialty infill)' : ''}`,
      description: `${rInf.name}, ${rcfg.heightIn}" — posts, rails, infill and mounting hardware${specialty ? '; cable/glass rate' : ''}`,
      qty: round(railLf, 1),
      unit: 'lf',
      unitCost: specialty ? q.rates.railingSpecialtyPerLf : q.rates.railingPerLf,
      costType: 'Labor',
    })
  }
  for (const sc of computed.stairs) {
    if (!sc.ok) continue
    rows.push({
      group: GROUP_LABOR,
      name: `Steps — ${sc.tier.name} · ${sc.riserCount} risers to ${sc.landingLabel}`,
      description: `${sc.riserCount} risers — treads and risers faced, stringers cut and hung, landing pad`,
      qty: round(stairFinishSqft(sc), 1),
      unit: 'sf',
      unitCost: q.rates.stepsPerSqft,
      costType: 'Labor',
    })
  }
  if (q.lighting.enabled) {
    rows.push({
      group: GROUP_LABOR,
      name: 'Lighting installation',
      description: 'Transformer, wiring and fixtures, fully installed',
      qty: q.lighting.fixtures,
      unit: 'ea',
      unitCost: q.rates.lightingPerFixture,
      costType: 'Labor',
    })
  }
  if (q.demo.enabled) {
    rows.push({
      group: GROUP_LABOR,
      name: 'Demolition & haul-away',
      description: 'Remove the existing structure, haul away and dispose of all debris',
      qty: q.demo.areaSqft,
      unit: 'sf',
      unitCost: q.rates.demoPerSqft,
      costType: 'Labor',
    })
  }

  // ---- permits & drawings ----
  rows.push({
    group: GROUP_PERMITS,
    name: q.mecklenburg ? 'Building permit + Mecklenburg zoning review' : 'Building permit',
    description: q.mecklenburg
      ? `Residential deck permit ($${q.costs.permit}) + City of Charlotte zoning review ($${q.costs.mecklenburgPermitSurcharge})`
      : 'Residential deck permit',
    qty: 1,
    unit: 'ea',
    unitCost: q.costs.permit + (q.mecklenburg ? q.costs.mecklenburgPermitSurcharge : 0),
    costType: 'Other',
  })
  rows.push({
    group: GROUP_PERMITS,
    name: 'Engineered drawings',
    description: 'Stamped plan set for permit submission',
    qty: 1,
    unit: 'ea',
    unitCost: q.costs.drawings,
    costType: 'Other',
  })
  return rows
}

/** Sell price per unit from Vivid's cost at the company margin (or markup). */
export function jobTreadUnitPrice(unitCost: number, project: Project): number {
  const q = project.settings.quote
  const p = q.profitMarginPct / 100
  return round(q.marginIsMarkup ? unitCost * (1 + p) : unitCost / Math.max(0.01, 1 - p), 4)
}

/** The catalog-template.csv text (no BOM — download() adds it). */
export function jobTreadCsv(project: Project, computed: ProjectComputed, opts: { date?: Date } = {}): string {
  const q = project.settings.quote
  const d = opts.date ?? new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const template = `${project.name || 'Deck'} — Vivid Deck Planner ${stamp}`
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const money = (n: number, places = 4) => (Math.round(n * 10 ** places) / 10 ** places).toString()
  const margin = q.marginIsMarkup ? '' : `${q.profitMarginPct}%`
  const lines = [JOBTREAD_HEADER.map(esc).join(',')]
  for (const r of buildJobTreadRows(project, computed)) {
    const cost = r.unitCost === null ? '' : money(r.unitCost)
    const price = r.unitCost === null ? '' : money(jobTreadUnitPrice(r.unitCost, project), 2)
    const fields: string[] = [
      template, // Cost Group Template Name
      r.group, // Cost Group Name
      r.name, // Cost Item Name
      r.description, // Description
      String(r.qty), // Quantity
      '', // Quantity Formula
      r.unit, // Unit
      cost, // Unit Cost
      '', // Unit Cost Formula
      price, // Unit Price
      '', // Unit Price Formula
      r.unitCost === null ? '' : margin, // Margin
      r.costType, // Cost Type
      '', // Cost Code — Vivid's accounting codes, assigned in JobTread
      'FALSE', // Taxable — NC real property contract: customer is not charged sales tax
      'TRUE', // Selected
      '', // Minimum Selections
      '', // Maximum Selections
      '', // Allowance Type
      'FALSE', // Allows Customer Write-In
      '', // Specification
      'FALSE', // Require Specification Approval
      'FALSE', // Show Child Costs — customer sees group totals, not the cost build-up
      'FALSE', // Show Child Deltas
      'FALSE', // Show Children
      'TRUE', // Show Description
      'TRUE', // Show Quantity
      '', // Custom Field: Status
    ]
    lines.push(fields.map(esc).join(','))
  }
  return lines.join('\r\n')
}

/** "Smith deck - JobTread import 2026-08-21.csv" */
export function jobTreadCsvFilename(projectName: string, d = new Date()): string {
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const safe =
    projectName
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim() || 'deck'
  return `${safe} - JobTread import ${stamp}.csv`
}
