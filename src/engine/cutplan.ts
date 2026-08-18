/**
 * 1D cutting-stock planner for framing lumber.
 *
 * Company scope — optimization is deliberately LIMITED:
 *  • A demand of 8' or longer buys its OWN board, one-for-one, at the
 *    cheapest stocked length that fits (usually just the next length up).
 *    It never shares a board and its offcut is never harvested for other
 *    pieces — a 12' joist is a 12'/14'/16' board, full stop.
 *  • Only demands UNDER the 8' yard minimum (blocking, short posts, wrap
 *    stringers, headers, joists on a shallow projection…) are packed
 *    together — an 8'+ board divided in halves / thirds / quarters, chosen
 *    by real per-length DOLLARS (lumber does not price per linear foot;
 *    a length with no price simply isn't buyable).
 *  • Required lengths are NEVER built up from shorter pieces — a demand
 *    longer than any stocked length comes back in `overlong` for a
 *    special-order line; the planner never splits it.
 */

/** shortest board the yard sells — also the cutoff for packing short pieces */
export const MIN_STOCK_FT = 8

export interface CutDemand {
  /** required piece length, ft */
  lenFt: number
  /** where the piece goes — shown on the crew cut list */
  label: string
}

export interface PlannedBoard {
  /** stock length purchased, ft */
  stockFt: number
  /** pieces cut from this board, longest first */
  cuts: CutDemand[]
  usedFt: number
  offcutFt: number
}

export interface CutPlan {
  boards: PlannedBoard[]
  /** stockFt -> number of boards to buy */
  byStock: Map<number, number>
  demandLf: number
  boughtLf: number
  offcutLf: number
  /** demands too long for any stock length — caller splices or special-orders */
  overlong: CutDemand[]
}

const EPS = 1e-6

/** best-fit-decreasing into boards whose length is chosen by `openLen` */
function packInto(cuts: CutDemand[], openLen: (cutFt: number) => number | null): PlannedBoard[] | null {
  const boards: PlannedBoard[] = []
  for (const c of cuts) {
    let best: PlannedBoard | null = null
    for (const b of boards) {
      const room = b.stockFt - b.usedFt
      if (room + EPS >= c.lenFt && (!best || room < best.stockFt - best.usedFt)) best = b
    }
    if (best) {
      best.cuts.push(c)
      best.usedFt += c.lenFt
    } else {
      const L = openLen(c.lenFt)
      if (L === null) return null
      boards.push({ stockFt: L, cuts: [c], usedFt: c.lenFt, offcutFt: 0 })
    }
  }
  return boards
}

export function planCuts(
  demands: CutDemand[],
  stockLengths: number[],
  priceOf: (stockFt: number) => number | null,
): CutPlan {
  const stocks = stockLengths.filter((L) => L >= MIN_STOCK_FT - EPS).sort((a, b) => a - b)
  const maxStock = stocks.length > 0 ? stocks[stocks.length - 1] : 0
  const overlong = demands.filter((d) => d.lenFt > maxStock + EPS)
  const usable = demands.filter((d) => d.lenFt <= maxStock + EPS)
  // ≥ 8' → its own board; < 8' → packed together (halves / thirds / …)
  const solo = usable.filter((d) => d.lenFt >= MIN_STOCK_FT - EPS)
  const cuts = usable.filter((d) => d.lenFt < MIN_STOCK_FT - EPS).sort((a, b) => b.lenFt - a.lenFt)

  // no price for a length ⇒ not buyable by $; if NOTHING is priced fall back
  // to minimizing bought LF so the planner still works without a price book
  const priced = stocks.filter((L) => priceOf(L) !== null)
  const costOf = (L: number): number => {
    const p = priceOf(L)
    if (p !== null) return p
    return priced.length > 0 ? Number.POSITIVE_INFINITY : L
  }
  const buyable = priced.length > 0 ? priced : stocks

  // cheapest stocked length that fits (tie → shortest)
  const pickStock = (lenFt: number): number => {
    let bestL = maxStock
    let bestC = Number.POSITIVE_INFINITY
    for (const L of buyable) {
      if (L + EPS < lenFt) continue
      const c = costOf(L)
      if (c < bestC - 1e-9 || (Math.abs(c - bestC) < 1e-9 && L < bestL)) {
        bestL = L
        bestC = c
      }
    }
    return bestL
  }

  // one board per full-length demand — never combined, offcut never harvested
  const soloBoards: PlannedBoard[] = solo.map((d) => {
    const L = pickStock(d.lenFt)
    return { stockFt: L, cuts: [d], usedFt: d.lenFt, offcutFt: L - d.lenFt }
  })

  // shrink pass: each board drops to the cheapest stock that still holds its cuts
  const shrink = (boards: PlannedBoard[]): PlannedBoard[] =>
    boards.map((b) => {
      let bestL = b.stockFt
      let bestC = costOf(b.stockFt)
      for (const L of buyable) {
        if (L + EPS >= b.usedFt) {
          const c = costOf(L)
          if (c < bestC - 1e-9 || (Math.abs(c - bestC) < 1e-9 && L < bestL)) {
            bestL = L
            bestC = c
          }
        }
      }
      return { ...b, stockFt: bestL, offcutFt: bestL - b.usedFt }
    })

  const candidates: PlannedBoard[][] = []
  // (a) uniform: every board the same stock length
  for (const L of buyable) {
    if (cuts.length > 0 && cuts[0].lenFt > L + EPS) continue
    const packed = packInto(cuts, () => L)
    if (packed) candidates.push(shrink(packed))
  }
  // (b) mixed: open the cheapest board that fits the cut (tie → shortest)
  {
    const packed = packInto(cuts, (cutFt) => {
      let bestL: number | null = null
      let bestC = Number.POSITIVE_INFINITY
      for (const L of buyable) {
        if (L + EPS < cutFt) continue
        const c = costOf(L)
        if (c < bestC - 1e-9 || (Math.abs(c - bestC) < 1e-9 && (bestL === null || L < bestL))) {
          bestL = L
          bestC = c
        }
      }
      return bestL
    })
    if (packed) candidates.push(shrink(packed))
  }
  // (c) mixed: open the longest board (max packing density), shrink fixes cost
  if (buyable.length > 0) {
    const packed = packInto(cuts, (cutFt) => (buyable[buyable.length - 1] + EPS >= cutFt ? buyable[buyable.length - 1] : null))
    if (packed) candidates.push(shrink(packed))
  }

  let bestPacked: PlannedBoard[] = []
  if (cuts.length > 0 && candidates.length > 0) {
    const cost = (bs: PlannedBoard[]) => bs.reduce((s, b) => s + costOf(b.stockFt), 0)
    const lf = (bs: PlannedBoard[]) => bs.reduce((s, b) => s + b.stockFt, 0)
    bestPacked = candidates.reduce((a, b) =>
      cost(b) < cost(a) - 1e-9 ||
      (Math.abs(cost(b) - cost(a)) < 1e-9 && (lf(b) < lf(a) || (lf(b) === lf(a) && b.length < a.length)))
        ? b
        : a,
    )
  }
  const best = [...soloBoards, ...bestPacked]

  const byStock = new Map<number, number>()
  for (const b of best) byStock.set(b.stockFt, (byStock.get(b.stockFt) ?? 0) + 1)
  const demandLf = usable.reduce((s, d) => s + d.lenFt, 0)
  const boughtLf = best.reduce((s, b) => s + b.stockFt, 0)
  return { boards: best, byStock, demandLf, boughtLf, offcutLf: boughtLf - demandLf, overlong }
}
