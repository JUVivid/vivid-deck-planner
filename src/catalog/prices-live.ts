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
  // --- Statement Rail, White only (Lowe's / The Deck Store, 2026-08-20 — dearer wins) ---
  'rail:statement-kit|hollow-sq|6x36|White': 360.99, // full kit: rails + reinforcements + brackets + 14 balusters
  'rail:statement-kit|hollow-sq|8x36|White': 459.99,
  'rail:statement-kit|hollow-sq|6x42|White': 409.99,
  'rail:statement-kit|hollow-sq|8x42|White': 530.99,
  'rail:statement-kit|round-al|6x36|White': 409.99, // round aluminum baluster versions
  'rail:statement-kit|round-al|8x36|White': 527.99,
  'rail:statement-kit|round-al|6x42|White': 480.99,
  'rail:statement-kit|round-al|8x42|White': 622.99,
  'rail:statement-stair-kit|hollow-sq|36|White': 468.99, // racks 18-40°
  'rail:statement-stair-kit|round-al|36|White': 539.99,
  // no 42" stair kit exists in this line — the 36" stair kit is what gets bought
  'rail:statement-stair-kit|hollow-sq|42|White': 468.99,
  'rail:statement-stair-kit|round-al|42|White': 539.99,
  'rail:statement-brackets': 56.99, // ST60BKTSET, 4 SS brackets + screws
  'rail:statement-stair-brackets': 56.99, // ST60STAIRSET
  'rail:statement-sleeve-36|White': 122.99, // 5" x 48" sleeve w/ shims (only short length made)
  'rail:statement-sleeve-42|White': 286.68, // 5" x 108" sleeve — TimberTech specs it for 42"
  // --- Pinnacle Rail, White only (Lowe's, 2026-08-20) ---
  'rail:pinnacle-brackets': 52.44, // PN40BKTSET
  'rail:pinnacle-stair-brackets': 84.77, // PN40STAIRSET
  'rail:pinnacle-sleeve-36|White': 122.99, // shares the 5" sleeve with Statement
  'rail:pinnacle-sleeve-42|White': 286.68,
  'rail:pinnacle-panel|chippendale|36': 495.49, // PN40DP36-1, 29.75" sq PVC infill panel
  'rail:pinnacle-panel|chippendale|42': 715.5, // PN40DP42-1, 35.75" sq
  'rail:pinnacle-panel|square-web|36': 527.21, // PN40DP36-3
  'rail:pinnacle-panel|square-web|42': 761.29, // PN40DP42-3
  // --- 5" flat cap + skirt for Statement/Pinnacle sleeves (Deck Store, 2026-08-20) ---
  'rail:capskirt5|White': 67.98, // TTNCFLAT5 $36.99 + TTNBTR5-EX $30.99
  // --- Advantage Rail SPEEDLoc kits (Advantage Lumber, 2026-08-20) ---
  'rail:advantage-kit|hollow-sq|6x36|Matte White': 195.11, // kit incl. balusters, hardware, footblocks
  'rail:advantage-kit|hollow-sq|8x36|Matte White': 253.63,
  'rail:advantage-kit|hollow-sq|6x42|Matte White': 230.22,
  'rail:advantage-kit|hollow-sq|8x42|Matte White': 299.3,
  'rail:advantage-kit|hollow-sq|6x36|Matte Black': 243.89,
  'rail:advantage-kit|hollow-sq|8x36|Matte Black': 317.05,
  'rail:advantage-kit|hollow-sq|6x42|Matte Black': 287.79,
  'rail:advantage-kit|hollow-sq|8x42|Matte Black': 374.11,
  'rail:advantage-kit|hollow-sq|6x36|Matte Espresso': 243.89, // dark colours price alike
  'rail:advantage-kit|hollow-sq|8x36|Matte Espresso': 317.05,
  'rail:advantage-kit|hollow-sq|6x42|Matte Espresso': 287.79,
  'rail:advantage-kit|hollow-sq|8x42|Matte Espresso': 374.11,
  'rail:advantage-stair-kit|hollow-sq|36|Matte White': 224.38,
  'rail:advantage-stair-kit|hollow-sq|42|Matte White': 264.75,
  'rail:advantage-stair-kit|hollow-sq|36|Matte Black': 280.46,
  'rail:advantage-stair-kit|hollow-sq|42|Matte Black': 330.95,
  'rail:advantage-stair-kit|hollow-sq|36|Matte Espresso': 280.46,
  'rail:advantage-stair-kit|hollow-sq|42|Matte Espresso': 330.95,
  // (Advantage round-aluminum kits exist but were not itemized — stays unpriced)
  // --- IRX accessories, colorless parts (Advantage Lumber / The Deck Store, 2026-08-20) ---
  'rail:irx-drink-cliphw': 149.99, // 12-clip hardware kit (4 clips per 6' section, 6 per 8')
  'rail:irx-cable-kit-10': 122.33, // stainless cable + stud/receiver/fast-receiver + caps
  'rail:irx-cable-kit-20': 137.76,
  'rail:irx-cable-kit-40': 165.84,
  'rail:irx-cable-kit-60': 186.99, // retailers diverge $173-187 — dearer wins
  'rail:irx-cable-intermediate': 31.51, // level center-baluster replacement, cut to height
  // --- Feeney CableRail (DecksDirect, 2026-08-20) ---
  // per-section hardware kit = cables x (Quick-Connect $20.75 + threaded terminal $27.50)
  'rail:feeney-kit-36': 434.25, // 9 cables x $48.25
  'rail:feeney-kit-42': 579.0, // 12 cables x $48.25
  'rail:feeney-intermediate-36': 57.83, // picket kit #7648 fits 36" + 42" (field trim)
  'rail:feeney-intermediate-42': 57.83,
  'rail:feeney-spool-100': 89.6, // 1/8" 316 SS bulk reel #5100
  'rail:feeney-spool-500': 447.89, // #5500
  // --- TimberTech CC glass channel kit 6' (DecksDirect, 2026-08-20) ---
  'rail:glass-channel-6|Matte Black': 209.99, // AZTGLASS6B — channels + gaskets, glass local
  'rail:glass-channel-6|Matte Espresso': 209.99, // dark-colour price
  'rail:glass-channel-6|Matte White': 199.99,
  'rail:glass-channel-6|White': 199.99,
  // --- concrete forms & flashing ---
  'misc:tube-10': 19.49, // Quik-Tube 10x48 @ True Value
  'misc:tube-12': 22.49, // Quik-Tube 12x48 @ True Value / Do it Best
  'misc:tube-14': 17.41, // Sakrete 14x48 @ Lowe's (exact size exists)
  'misc:tube-16': 21.76, // Sakrete 16x48 @ Lowe's
  'misc:tube-18': 48.88, // Sonotube Rainguard 18x48 @ EMI Supply (commercial grade)
  'misc:ledger-flash': 3.09, // per LF: Amerimax galv Z-flashing $1.42/lf + PVC drip cap $1.67/lf
}

/**
 * IRX (Impression Rail Express) retail — Advantage Lumber, corroborated by
 * The Deck Store / Lowe's, 2026-08-20. Retail is IDENTICAL across the three
 * colours, so one price fans out to Black / White / Dark Bronze keys.
 * Receipts (Black posts, 36" panels, classic tops, stair panel) still win in
 * unitCostDetail — these fill the parts the Lansing invoices didn't cover.
 */
const IRX_COLORS = ['Black', 'White', 'Dark Bronze']
const IRX_RETAIL: Record<string, number> = {
  'rail:irx-panel-42x6': 240.94, // universal baluster panel kit 42" x 6'
  'rail:irx-panel-42x8': 325.32,
  'rail:irx-glass-36x6': 202.43, // ONE universal 6' glass kit serves both heights
  'rail:irx-glass-42x6': 202.43,
  'rail:irx-vcable-36x6': 474.35, // vertical cable level panel kits
  'rail:irx-vcable-36x8': 601.7,
  'rail:irx-vcable-42x6': 501.94,
  'rail:irx-vcable-42x8': 639.68,
  'rail:irx-panel-cover-6': 45.13,
  'rail:irx-panel-cover-8': 52.62,
  'rail:irx-channel-6': 37.6, // unpunched support channel
  'rail:irx-channel-8': 45.13,
  'rail:irx-top-modern-6': 83.73,
  'rail:irx-top-modern-8': 97.94,
  'rail:irx-top-classic-6': 83.73, // receipt overrides Black ($59.73/$69.93)
  'rail:irx-top-classic-8': 97.94,
  'rail:irx-hcable-kit-6': 186.68, // level section kit: center support + channel + brackets
  'rail:irx-hcable-kit-8': 217.48,
  'rail:irx-hcable-post-end|38': 218.32, // post kits include post, base, cap, skirt
  'rail:irx-hcable-post-end|43': 228.73,
  'rail:irx-hcable-post-inline|38': 164.05,
  'rail:irx-hcable-post-inline|43': 172.29,
  'rail:irx-hcable-post-corner|38': 191.87,
  'rail:irx-hcable-post-corner|43': 206.78,
  'rail:irx-stair-panel-36x6': 260.3, // receipt overrides Black ($185.78)
  'rail:irx-stair-panel-42x6': 277.46,
  'rail:irx-post|38.25': 93.86, // receipt overrides Black ($67.01)
  'rail:irx-post|43.5': 108.92, // receipt overrides Black ($77.01)
}
for (const [base, price] of Object.entries(IRX_RETAIL)) {
  for (const c of IRX_COLORS) RETAIL_EST[`${base}|${c}`] = price
}

/**
 * Pinnacle level kits (Lowe's, 2026-08-20). The base PN40350F kit is the same
 * whether balusters stay in or a decorative panel replaces them, so one price
 * fans across the three infill ids (panels themselves are separate lines).
 */
const PINNACLE_KIT: Record<string, number> = {
  '6x36': 375.94,
  '8x36': 487.15,
  '6x42': 420.42,
  '8x42': 542.77,
}
const PINNACLE_STAIR: Record<string, number> = {
  // stair kits exist in 36" only — that kit is what gets bought for 42" jobs too
  '36': 387.03,
  '42': 387.03,
}
for (const inf of ['solid-sq', 'chippendale', 'square-web']) {
  for (const [size, price] of Object.entries(PINNACLE_KIT)) RETAIL_EST[`rail:pinnacle-kit|${inf}|${size}|White`] = price
  for (const [h, price] of Object.entries(PINNACLE_STAIR)) RETAIL_EST[`rail:pinnacle-stair-kit|${inf}|${h}|White`] = price
}
