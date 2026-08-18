import {
  DECKING_PRICE,
  FASCIA_PRICE,
  LUMBER_PRICE,
  RAIL_PRICE,
  RISER_PRICE,
  TAPE_PRICE,
  YARD_PRICE,
  PRICE_BOOK_DATE,
} from '../catalog/prices'
import { RECEIPT_PRICE, RETAIL_EST } from '../catalog/prices-live'
import type { BomLine } from './bom'

/**
 * Material costing. Vivid's COST, before sales tax.
 *
 * NC treats a new deck as a capital improvement under a real property contract:
 * the contractor is the consumer of the materials and pays sales tax at the
 * yard, and does NOT charge the customer tax on the contract. So tax here is a
 * COST input applied to materials, never a customer-facing line.
 */

export type PriceSource = 'book' | 'receipt' | 'retail-est'

export interface PricedLine {
  line: BomLine
  unitCost: number | null
  extended: number | null
  /** where the winning price came from */
  source?: PriceSource
}

export interface MaterialCost {
  lines: PricedLine[]
  /** sum of every line we could price */
  priced: number
  /** order lines with no price anywhere (excluding informational rows) */
  unpriced: BomLine[]
  /** lines priced ONLY from retail estimates — replace with contractor pricing */
  estimated: BomLine[]
  priceBookDate: string
}

/** Dealer-sheet price for a sku (the generated book only). */
function bookPriceFor(sku: string): number | null {
  const i = sku.indexOf(':')
  if (i < 0) return null
  const kind = sku.slice(0, i)
  const key = sku.slice(i + 1)
  switch (kind) {
    case 'lumber':
      return LUMBER_PRICE[key] ?? null
    case 'decking':
      return DECKING_PRICE[key] ?? null
    case 'fascia':
      return FASCIA_PRICE[key] ?? null
    case 'riser':
      return RISER_PRICE[key] ?? null
    case 'yard':
      return YARD_PRICE[key] ?? null
    case 'tape':
      return TAPE_PRICE[key] ?? null
    case 'rail': {
      // "Post cap + skirt" is two SKUs on the sheet
      const cap = key.match(/^capskirt\|(.+)$/)
      if (cap) {
        for (const c of [cap[1], capColor(cap[1])]) {
          const a = RAIL_PRICE[`postcap|${c}`]
          const b = RAIL_PRICE[`postskirt|${c}`]
          if (a !== undefined && b !== undefined) return Math.round((a + b) * 100) / 100
        }
        return null
      }
      // metal parts (balusters, sleeves, caps) are stocked in plain Black/White
      // even when the rail system is a matte finish — fall back to the base colour
      const parts = key.split('|')
      const plain = [...parts.slice(0, -1), capColor(parts[parts.length - 1])].join('|')
      return RAIL_PRICE[key] ?? RAIL_PRICE[plain] ?? null
    }
    default:
      return null
  }
}

/** The metal accessories are stocked in plain Black/White, not matte finishes. */
function capColor(color: string): string {
  if (/black/i.test(color)) return 'Black'
  if (/white/i.test(color)) return 'White'
  return color
}

/**
 * Resolve a sku across the three sources.
 *
 * RECEIPTS ARE AUTHORITATIVE — they are what Vivid actually paid (company
 * confirmation), so a JobTread receipt price wins outright. Only when no
 * receipt exists does the company dearer-wins rule apply between the dealer
 * sheets and retail estimates. Retail-only prices are flagged so the rep panel
 * shows what still needs contractor pricing.
 */
export function unitCostDetail(
  sku: string | undefined,
): { cost: number; source: PriceSource; estimatedOnly: boolean } | null {
  if (!sku) return null
  const receipt = RECEIPT_PRICE[sku] ?? null
  if (receipt !== null) return { cost: receipt, source: 'receipt', estimatedOnly: false }
  const book = bookPriceFor(sku)
  const retail = RETAIL_EST[sku] ?? null
  if (book === null && retail === null) return null
  if (book !== null && (retail === null || book >= retail)) return { cost: book, source: 'book', estimatedOnly: false }
  return { cost: retail as number, source: 'retail-est', estimatedOnly: book === null }
}

/** Convenience: the resolved unit cost (dearer-wins across all sources). */
export function unitCostFor(sku: string | undefined): number | null {
  return unitCostDetail(sku)?.cost ?? null
}

export function priceMaterials(bom: BomLine[]): MaterialCost {
  const lines: PricedLine[] = []
  const unpriced: BomLine[] = []
  const estimated: BomLine[] = []
  let priced = 0
  for (const line of bom) {
    if (line.informational) {
      lines.push({ line, unitCost: null, extended: null })
      continue
    }
    const detail = unitCostDetail(line.sku)
    if (detail === null) {
      unpriced.push(line)
      lines.push({ line, unitCost: null, extended: null })
      continue
    }
    if (detail.estimatedOnly) estimated.push(line)
    const extended = Math.round(detail.cost * line.qty * 100) / 100
    priced += extended
    lines.push({ line, unitCost: detail.cost, extended, source: detail.source })
  }
  return { lines, priced: Math.round(priced * 100) / 100, unpriced, estimated, priceBookDate: PRICE_BOOK_DATE }
}
