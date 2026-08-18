/**
 * Live pricing gathered OUTSIDE the dealer price sheets — maintained by hand.
 *
 * RECEIPT_PRICE — Vivid's actual invoiced cost, read from JobTread:
 *   • 84 Lumber invoice 2316-345659, 06/04/26 (Ray Card — "Deck around pool")
 *   • Lansing Building Products (Charlotte) orders 85509343-00 + 85537895-00, 06/2026
 *
 * RETAIL_EST — current retail prices aggregated from mainstream suppliers
 *   (Home Depot, Lowe's, DecksDirect, DeckExpressions, Fasteners Plus, ...) on
 *   2026-07-28. These are RETAIL, used only when no dealer/receipt price exists.
 *
 * Lookup rule (company standard): RECEIPTS ARE AUTHORITATIVE — "whatever is in
 * JobTread is correct, that is what we've actually paid." Where no receipt
 * exists, the dearer of dealer-sheet vs retail wins. A price is flagged
 * "estimated" only when retail is the ONLY source.
 */

/** Vivid's invoiced cost per piece (JobTread receipts). */
export const RECEIPT_PRICE: Record<string, number> = {
  // --- 84 Lumber inv 2316-345659 ---
  'lumber:2x8-8': 10.67, // NOT on the price sheet — they stock it
  'lumber:2x8-12': 15.88,
  'lumber:2x10-16': 28.12,
  'lumber:6x6-8': 32.19, // sheet said $29.43 — invoice is dearer
  'yard:SAKRETE 80lb High Strength': 8.35, // actually 80# Handicrete high-strength
  'decking:terrain-plus|grooved|Weathered Oak|16': 77.39,
  'decking:terrain-plus|square|Weathered Oak|16': 77.39,
  'riser:terrain-plus|Weathered Oak|12': 73.95,
  'fascia:terrain-plus|Weathered Oak|12': 127.88,
  'fast:concealoc-carton': 207.47, // 100 sq ft carton
  'fast:toploc': 0.4459, // $156.07 per 100 sq ft pack ÷ ~350 screws — confirm count
  'hw:hanger-2x8': 2.55, // LUS28Z
  'hw:aba66z': 35.26, // ABA66Z — Vivid's standard post base per their material list
  'hw:anchor-bolt': 1.91, // STB2-50512F25 1/2" x 5-1/2"
  'hw:lpc6z': 9.99, // LPC6Z post cap actually bought on this job (BCS2 was spec'd)
  // --- Lansing Building Products, Charlotte ---
  'rail:irx-post|38.25|Black': 67.01, // rail sheet said $62.99 — invoice dearer
  'rail:irx-post|43.5|Black': 77.01, // sheet $73.06 — invoice dearer
  'rail:irx-panel-36x6|Black': 154.15, // IRX 36" x 6' level panel
  'rail:irx-panel-36x8|Black': 214.36,
  'rail:irx-stair-panel-36x6|Black': 185.78,
  'rail:irx-top-classic-6|Black': 59.73,
  'rail:irx-top-classic-8|Black': 69.93,
}

/**
 * Stock lengths proven by receipts that the price sheet omits.
 * Merged into LUMBER_STOCK_BY_SIZE by stockFor().
 */
export const EXTRA_STOCK: Record<string, number[]> = {
  '2x8': [8],
}

/** Retail estimates (highest credible mainstream price), 2026-07-28. */
export const RETAIL_EST: Record<string, number> = {
  // --- Simpson / structural hardware ---
  'hw:hanger-2x6': 1.77, // LUS26 @ Home Depot
  'hw:hanger-2x8': 2.98, // LUS28 @ Lowe's/HD
  'hw:hanger-2x10': 2.18, // LUS210 @ Lowe's
  'hw:hanger-2x12': 11.99, // HU212 @ Fasteners Plus (LUS212 not retailed)
  'hw:abu66z': 59.42, // ABU66Z @ HD — NOTE: Vivid actually buys ABA66Z ($35.26)
  'hw:bcs2': 17.2, // BCS2-3/6Z @ HD
  'hw:lce4': 14.76, // AC6Z @ HD (LCE4Z not retailed)
  'hw:h25a': 0.98, // H2.5AZ @ HD
  'hw:dtt2z': 12.99, // @ Fasteners Plus, SDS screws included
  'hw:lscz': 2.99, // @ Fasteners Plus
  'hw:hanger-nail': 0.0414, // N10DHDG-R $4.97 / 120 ct
  'hw:frame-screw': 0.19, // GRK R4 #10x3-1/8 $39.91 / 210 ct
  'hw:ledgerlok': 1.0334, // FastenMaster $51.67 / 50 ct
  'hw:through-bolt': 5.0341, // 1/2x8 HDG bolt + nut + 2 washers, from HD pack pricing
  'hw:carriage-bolt-6': 4.6034, // 1/2x6 HDG carriage + nut + washer
  // --- TimberTech fastener systems ---
  'fast:concealoc-carton': 208.43, // 100 sq ft carton (175 clips) @ Deck & Rail Supply
  'fast:edgeloc-pack': 61.99, // 55 sq ft / 96 clips @ DeckExpressions
  'fast:toploc': 0.2014, // 350 ct box $70.48 @ HD (highest color)
  'fast:toploc-fascia': 0.4299, // 100 ct box $42.99 @ DeckExpressions
  'fast:composite-screw': 0.4, // Starborn Headcote SS 350 ct $139.99 @ Ace
  'fast:cortex-set': 0.558, // Cortex 100 lin ft pack $124.99 / 224 sets @ DecksDirect
  // --- TimberTech CCS railing accessories ---
  'rail:sleeve-ccs-4x4': 65.98, // 4x4x39" composite sleeve, Matte Black @ Deck Store USA
  'rail:capskirt|Matte Black': 30.96, // CCS flat cap $19.98 + skirt $10.98 (composite, not the IRX metal set)
  'rail:capskirt|Matte White': 30.96,
  'rail:capskirt|Matte Espresso': 30.96,
  'rail:capskirt|White': 30.96,
  'rail:stair-rail-6': 210.96, // un-drilled Universal Rail Pack 6' $141.98 + RadianceRail top $68.98
  'rail:handrail-kit': 188.95, // TimberTech ADA pipe-rail kit 1.5"x94" w/ brackets @ Dunn Lumber
  'rail:secure-mount': 122.97, // Secure-Mount steel post @ DecksDirect
  'rail:surface-mount-hw': 26.97, // Deck Mounting Kit (leveling + base plate) @ DecksDirect
  'rail:post-hw-set': 16.8, // 2x 1/2"x8" carriage bolts + nuts/washers + 2ft 2x8 blocking (component build)
  // --- concrete forms & flashing ---
  'misc:tube-10': 19.49, // Quik-Tube 10x48 @ True Value
  'misc:tube-12': 22.49, // Quik-Tube 12x48 @ True Value / Do it Best
  'misc:tube-14': 17.41, // Sakrete 14x48 @ Lowe's (exact size exists)
  'misc:tube-16': 21.76, // Sakrete 16x48 @ Lowe's
  'misc:tube-18': 48.88, // Sonotube Rainguard 18x48 @ EMI Supply (commercial grade)
  'misc:ledger-flash': 3.09, // per LF: Amerimax galv Z-flashing $1.42/lf + PVC drip cap $1.67/lf
}
