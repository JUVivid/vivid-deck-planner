import type { BeamPly, JoistSpacing, LumberSize, Species } from '../model/types'
import { LUMBER_STOCK_BY_SIZE } from '../catalog/prices'
import { EXTRA_STOCK } from '../catalog/prices-live'

// ============================================================================
// Prescriptive deck tables based on the 2021 IRC (R507) and AWC DCA 6 — the
// basis of the 2024 NC Residential Code deck provisions.
// Assumes 40 psf live / 10 psf dead, L/360, ground snow <= 40 psf.
//
// GRADE POLICY (company rule — do not change): the ORDER calls for #1
// Southern Pine, but the span charts PLAN for No. 2. Not every retailer
// carries #1 and a yard may substitute #2 on any given project, so the
// structure must stand on whatever grade is actually on the truck. Never
// take #1 span credit anywhere in this program.
// ALWAYS verify against the local adopted code and amendments before building.
// Values marked "approx" are conservative interpolations — confirm before use.
// ============================================================================

export const DEPTH_IN: Record<LumberSize, number> = {
  '2x6': 5.5,
  '2x8': 7.25,
  '2x10': 9.25,
  '2x12': 11.25,
}

/**
 * What the ORDER calls for. Vivid specs #1 Southern Pine, but the span tables
 * below stay on No. 2 — a yard that only stocks #2 may substitute, and the
 * design has to hold either way.
 */
export const SPECIES_LABEL: Record<Species, string> = {
  SP: 'Southern Pine #1',
  DF: 'Doug Fir-L / Hem-Fir / SPF #2',
  CEDAR: 'Cedar / Redwood #2',
}

export const SIZE_ORDER: LumberSize[] = ['2x6', '2x8', '2x10', '2x12']

/**
 * Stock lengths actually carried by the yard, per the current price sheet —
 * NOT the textbook 8–20 in 2' steps. There is no 14' or 18' in any dimension,
 * and 2x8/2x10/2x12 start at 10'. Packing cuts into lengths nobody sells
 * produces an order that cannot be filled.
 */
export function stockFor(size: string): number[] {
  const sheet = LUMBER_STOCK_BY_SIZE[size] ?? [10, 12, 16, 20]
  // receipts prove some lengths the price sheet omits (e.g. 2x8x8)
  const extra = EXTRA_STOCK[size] ?? []
  return [...new Set([...sheet, ...extra])].sort((a, b) => a - b)
}

/** Union of all stocked lengths — only for callers with no specific size. */
export const LUMBER_STOCK = [...new Set(Object.values(LUMBER_STOCK_BY_SIZE).flat())].sort((a, b) => a - b)

const fi = (ft: number, inch: number) => ft + inch / 12

/** IRC 2021 Table R507.6 — maximum joist spans, ft. Index: [12" oc, 16" oc, 24" oc] */
const JOIST_SPAN: Record<Species, Record<LumberSize, [number, number, number]>> = {
  SP: {
    '2x6': [fi(9, 11), fi(9, 0), fi(7, 7)],
    '2x8': [fi(13, 1), fi(11, 10), fi(9, 8)],
    '2x10': [fi(16, 2), fi(14, 0), fi(11, 5)],
    '2x12': [fi(18, 0), fi(16, 6), fi(13, 6)],
  },
  DF: {
    '2x6': [fi(9, 6), fi(8, 8), fi(7, 2)],
    '2x8': [fi(12, 6), fi(11, 1), fi(9, 1)],
    '2x10': [fi(15, 8), fi(13, 7), fi(11, 1)],
    '2x12': [fi(18, 0), fi(15, 9), fi(12, 10)],
  },
  CEDAR: {
    '2x6': [fi(8, 10), fi(8, 0), fi(7, 0)],
    '2x8': [fi(11, 8), fi(10, 7), fi(8, 8)],
    '2x10': [fi(14, 11), fi(13, 0), fi(10, 7)],
    '2x12': [fi(17, 5), fi(15, 1), fi(12, 4)],
  },
}

const SPACING_IDX: Record<JoistSpacing, number> = { 12: 0, 16: 1, 24: 2 }

export function joistAllowableSpan(sp: Species, size: LumberSize, spacing: JoistSpacing): number {
  return JOIST_SPAN[sp][size][SPACING_IDX[spacing]]
}

/** Joist-span columns used by the beam and ledger tables (ft). */
export const BEAM_COLS = [6, 8, 10, 12, 14, 16, 18]

/**
 * IRC 2021 Table R507.5 — maximum beam spans (post spacing), ft, by the span of
 * the joists framing into the beam. Key = `${ply}-${size}`.
 * SP values follow the printed table; DF/CEDAR groups are conservative (approx).
 */
const BEAM_SPAN: Record<Species, Record<string, number[]>> = {
  SP: {
    '2-2x6': [6.92, 5.92, 5.33, 4.83, 4.5, 4.25, 4.0],
    '2-2x8': [8.75, 7.58, 6.75, 6.17, 5.75, 5.33, 5.0],
    '2-2x10': [10.33, 9.0, 8.0, 7.33, 6.75, 6.33, 6.0],
    '2-2x12': [12.17, 10.58, 9.42, 8.58, 8.0, 7.5, 7.0],
    '3-2x6': [8.67, 7.5, 6.75, 6.08, 5.67, 5.33, 5.0],
    '3-2x8': [10.83, 9.5, 8.5, 7.75, 7.17, 6.67, 6.33],
    '3-2x10': [13.0, 11.25, 10.0, 9.17, 8.5, 7.92, 7.5],
    '3-2x12': [15.25, 13.25, 11.83, 10.75, 10.0, 9.33, 8.83],
  },
  DF: {
    '2-2x6': [6.08, 5.25, 4.67, 4.25, 4.0, 3.75, 3.5],
    '2-2x8': [7.75, 6.67, 6.0, 5.42, 5.08, 4.75, 4.42],
    '2-2x10': [9.5, 8.17, 7.33, 6.67, 6.17, 5.75, 5.42],
    '2-2x12': [11.0, 9.5, 8.5, 7.75, 7.17, 6.75, 6.33],
    '3-2x6': [7.67, 6.58, 5.92, 5.42, 5.0, 4.67, 4.42],
    '3-2x8': [9.67, 8.42, 7.5, 6.83, 6.33, 5.92, 5.58],
    '3-2x10': [11.83, 10.25, 9.17, 8.33, 7.75, 7.25, 6.83],
    '3-2x12': [13.75, 11.92, 10.67, 9.67, 9.0, 8.42, 7.92],
  },
  CEDAR: {
    '2-2x6': [5.75, 5.0, 4.42, 4.0, 3.75, 3.5, 3.33],
    '2-2x8': [7.33, 6.33, 5.67, 5.17, 4.83, 4.5, 4.25],
    '2-2x10': [9.0, 7.75, 7.0, 6.33, 5.92, 5.5, 5.17],
    '2-2x12': [10.42, 9.0, 8.08, 7.33, 6.83, 6.42, 6.0],
    '3-2x6': [7.25, 6.25, 5.58, 5.08, 4.75, 4.42, 4.17],
    '3-2x8': [9.17, 8.0, 7.17, 6.5, 6.0, 5.67, 5.33],
    '3-2x10': [11.25, 9.75, 8.67, 7.92, 7.33, 6.92, 6.5],
    '3-2x12': [13.08, 11.33, 10.08, 9.17, 8.58, 8.0, 7.5],
  },
}

export function beamAllowableSpan(
  sp: Species,
  ply: BeamPly,
  size: LumberSize,
  joistSpan: number,
): { span: number; beyondTable: boolean } {
  const row = BEAM_SPAN[sp][`${ply}-${size}`]
  let idx = BEAM_COLS.findIndex((c) => joistSpan <= c + 1e-9)
  let beyondTable = false
  if (idx === -1) {
    idx = BEAM_COLS.length - 1
    beyondTable = true
  }
  return { span: row[idx], beyondTable }
}

/**
 * IRC R507.9.1.3(1) / DCA 6 — ledger fastener on-center spacing (in),
 * staggered in two rows, by joist span. 1/2" lag screws vs 1/2" through-bolts.
 */
const LEDGER_OC: Record<'lag' | 'bolt', number[]> = {
  lag: [30, 23, 18, 15, 13, 11, 10],
  bolt: [36, 36, 34, 29, 24, 21, 19],
}

export function ledgerFastenerSpacing(kind: 'lag' | 'bolt', joistSpan: number): number {
  let idx = BEAM_COLS.findIndex((c) => joistSpan <= c + 1e-9)
  if (idx === -1) idx = BEAM_COLS.length - 1
  return LEDGER_OC[kind][idx]
}

// NOTE: max joist spacing for decking lives in catalog/compat.ts
// (`deckingMaxSpacing`), driven by the per-profile `maxJoistSpacingIn` override
// — e.g. 2x6 MAX allows 24" oc. Do not reintroduce a second table here.

export const CODE = {
  guardTriggerIn: 30, // R312.1.1 — guard required above this walking-surface height
  guardMinIn: 36, // R312.1.2
  maxBalusterGapIn: 4, // R312.1.3
  maxRiserIn: 7.75, // R311.7.5.1
  minTreadIn: 10, // R311.7.5.2
  minStairWidthIn: 36, // R311.7.1
  handrailMinRisers: 4, // R311.7.8
  handrailHeightIn: [34, 38] as [number, number],
  minThroatIn: 5, // solid material remaining on a cut stringer
  maxStringerSpanFt: 6, // practical guidance for cut 2x12 stringers between supports
  postRecommend: '6x6', // R507.4 — 6x6 posts are prescriptively allowed to 14 ft
  maxPostHeightFt: 14,
}

/** Simpson-style reference names by joist size (for the BOM). */
export const HANGER_NAME: Record<LumberSize, string> = {
  '2x6': 'LUS26',
  '2x8': 'LUS28',
  '2x10': 'LUS210',
  '2x12': 'LUS210 (2x12: use LUS212/HUS)',
}

export const DISCLAIMER =
  'Spans and hardware per 2021 IRC R507 / AWC DCA 6 (40 psf live, 10 psf dead, snow ≤ 40 psf). ' +
  'Planning aid only — verify all spans, footings, and connections with your local building department; ' +
  'local amendments, snow loads, and soil conditions vary.'
