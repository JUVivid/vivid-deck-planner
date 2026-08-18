// ============================================================================
// TimberTech / AZEK Exteriors — 2026 Product Guide (pages 5–11, 16–36, 37)
// Names, colors, dimensions and package info transcribed from the guide.
// SKUs intentionally omitted. Verify coverage/packaging with current price
// sheets before ordering. Install-guide details will refine this catalog.
// ============================================================================

export type DeckMaterial = 'pvc' | 'composite' | 'porch'
export type BoardEdge = 'grooved' | 'square' | 'tg'

export interface BoardProfile {
  id: string
  name: string
  widthIn: number
  thickIn: number
  edge: BoardEdge
  lengthsFt: number[]
  /** subset of line colors when a profile is offered in fewer colors */
  colors?: string[]
  note?: string
  /** install-guide override: MAX boards allow 24" oc perpendicular / 16" diagonal */
  maxJoistSpacingIn?: { perp: number; diag: number }
}

export interface DeckingLine {
  id: string
  name: string
  brand: 'TimberTech Advanced PVC' | 'TimberTech Composite' | 'TimberTech Advanced PVC Porch'
  material: DeckMaterial
  tagline: string
  warranty: string
  /** scalloped underside — relevant for drink rails & fastening */
  scalloped: boolean
  colors: string[]
  profiles: BoardProfile[]
  fascia: { widthIn: number; thickIn: number; lengthsFt: number[]; colors?: string[] } | null
  riser: { widthIn: number; thickIn: number; lengthsFt: number[] } | null
  notes: string[]
}

export const DECKING_LINES: DeckingLine[] = [
  // ---------------- Advanced PVC ----------------
  {
    id: 'vintage',
    name: 'Vintage Collection',
    brand: 'TimberTech Advanced PVC',
    material: 'pvc',
    tagline: 'Exotic hardwoods — wire-brushed, multitonal',
    warranty: 'Limited Lifetime / 50-yr fade & stain',
    scalloped: false,
    colors: ['Coastline', 'English Walnut', 'Mahogany', 'Weathered Teak', 'Dark Hickory', 'Cypress'],
    profiles: [
      { id: 'v-16g', name: '1x6 Grooved (5.5")', widthIn: 5.5, thickIn: 1, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'v-16s', name: '1x6 Square-Shouldered (5.5")', widthIn: 5.5, thickIn: 1, edge: 'square', lengthsFt: [16, 20] },
      { id: 'v-14s', name: '1x4 Narrow Square-Shouldered (3.5")', widthIn: 3.5, thickIn: 1, edge: 'square', lengthsFt: [16, 20] },
      { id: 'v-18s', name: '1x8 Wide Square-Shouldered (7.25")', widthIn: 7.25, thickIn: 1, edge: 'square', lengthsFt: [16, 20] },
      {
        id: 'v-max',
        name: '2x6 MAX Square-Shouldered (5.5" x 1.5")',
        widthIn: 5.5,
        thickIn: 1.5,
        edge: 'square',
        lengthsFt: [12, 16, 20],
        colors: ['Coastline'],
        note: 'MAX boards: Coastline only. Joists up to 24" oc (16" diagonal).',
        maxJoistSpacingIn: { perp: 24, diag: 16 },
      },
    ],
    fascia: { widthIn: 11.75, thickIn: 0.5, lengthsFt: [12], colors: ['Coastline', 'English Walnut', 'Weathered Teak', 'Mahogany', 'Dark Hickory', 'Cypress'] },
    riser: { widthIn: 7.25, thickIn: 0.75, lengthsFt: [12] },
    notes: ['Class A flame spread, WUI compliant, ignition resistant.', 'Multi-width layouts possible (3.5" / 5.5" / 7.25").'],
  },
  {
    id: 'landmark',
    name: 'Landmark Collection',
    brand: 'TimberTech Advanced PVC',
    material: 'pvc',
    tagline: 'Crosscut hardwoods — matte cathedral grain',
    warranty: 'Limited Lifetime / 50-yr fade & stain',
    scalloped: false,
    colors: ['Castle Gate', 'American Walnut', 'French White Oak', 'Boardwalk'],
    profiles: [
      { id: 'l-16g', name: '1x6 Grooved (5.5")', widthIn: 5.5, thickIn: 1, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'l-16s', name: '1x6 Square-Shouldered (5.5")', widthIn: 5.5, thickIn: 1, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.75, thickIn: 0.5, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.75, lengthsFt: [12] },
    notes: ['Class A flame spread, WUI compliant, ignition resistant.', 'Riser boards are compatible with Cortex plugs.'],
  },
  {
    id: 'harvest-plus',
    name: 'Harvest+ Collection',
    brand: 'TimberTech Advanced PVC',
    material: 'pvc',
    tagline: 'Understated cathedral grain',
    warranty: 'Limited Lifetime / 50-yr fade & stain',
    scalloped: false,
    colors: ['Toasted Wheat', 'Timber Gray'],
    profiles: [
      { id: 'hp-16g', name: '1x6 Grooved (5.5")', widthIn: 5.5, thickIn: 1, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'hp-16s', name: '1x6 Square-Shouldered (5.5")', widthIn: 5.5, thickIn: 1, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.75, thickIn: 0.5, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.75, lengthsFt: [12] },
    notes: ['Class A flame spread, WUI compliant.'],
  },
  {
    id: 'harvest',
    name: 'Harvest Collection',
    brand: 'TimberTech Advanced PVC',
    material: 'pvc',
    tagline: 'Refined cathedral grain, solid colors',
    warranty: 'Limited Lifetime / 50-yr fade & stain',
    scalloped: false,
    colors: ['Brownstone', 'Slate Gray', 'Kona'],
    profiles: [
      { id: 'h-16g', name: '1x6 Grooved (5.5")', widthIn: 5.5, thickIn: 1, edge: 'grooved', lengthsFt: [12, 16, 20], colors: ['Brownstone', 'Slate Gray'] },
      { id: 'h-16s', name: '1x6 Square-Shouldered (5.5")', widthIn: 5.5, thickIn: 1, edge: 'square', lengthsFt: [12, 16, 20] },
      { id: 'h-18s', name: '1x8 Wide Square-Shouldered (7.25")', widthIn: 7.25, thickIn: 1, edge: 'square', lengthsFt: [16, 20], colors: ['Brownstone', 'Slate Gray'] },
      { id: 'h-max', name: '2x6 MAX Square-Shouldered (5.5" x 1.5")', widthIn: 5.5, thickIn: 1.5, edge: 'square', lengthsFt: [12, 16, 20], colors: ['Slate Gray'], maxJoistSpacingIn: { perp: 24, diag: 16 } },
    ],
    fascia: { widthIn: 11.75, thickIn: 0.5, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.75, lengthsFt: [12] },
    notes: ['Class B flame spread, WUI compliant.', 'Kona is square-shouldered only (no grooved profile).'],
  },
  {
    id: 'porch',
    name: 'Porch Collection',
    brand: 'TimberTech Advanced PVC Porch',
    material: 'porch',
    tagline: 'Tongue-and-groove porch flooring',
    warranty: 'Limited Lifetime / 50-yr fade & stain',
    scalloped: false,
    colors: ['Slate Gray', 'Oyster', 'Mahogany', 'Dark Hickory', 'Coastline', 'Weathered Teak', 'Cypress', 'English Walnut'],
    profiles: [
      { id: 'p-14', name: '1x4 T&G Porch (3.125")', widthIn: 3.125, thickIn: 1, edge: 'tg', lengthsFt: [10, 12, 16], note: '10\' length: Slate Gray only.' },
      { id: 'p-16', name: '1x6 T&G Porch (5.5")', widthIn: 5.5, thickIn: 1, edge: 'tg', lengthsFt: [12, 16] },
    ],
    fascia: null,
    riser: null,
    notes: ['Tongue-and-groove installation for minimal gaps — porch/covered applications.'],
  },
  // ---------------- Composite ----------------
  {
    id: 'legacy',
    name: 'Legacy Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Hand-scraped finish',
    warranty: '30-yr product / fade & stain',
    scalloped: false,
    colors: ['Espresso', 'Whitewash Cedar', 'Pecan', 'Tigerwood', 'Mocha', 'Ashwood'],
    profiles: [
      { id: 'lg-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'lg-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Four-sided cap.'],
  },
  {
    id: 'reserve',
    name: 'Reserve Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Reclaimed wood, wire-brushed',
    warranty: '30-yr product / fade & stain',
    scalloped: false,
    colors: ['Driftwood', 'Dark Roast', 'Antique Leather', 'Reclaimed Chestnut'],
    profiles: [
      { id: 'rs-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'rs-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Four-sided cap.', 'WUI-compliant; fire-rated (-FR) versions available by special order.'],
  },
  {
    id: 'terrain-plus',
    name: 'Terrain+ Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Subtle wood grain, lightweight scalloped profile',
    warranty: '30-yr product / fade & stain',
    scalloped: true,
    colors: ['Natural White Oak', 'Weathered Oak', 'Dark Oak'],
    profiles: [
      { id: 'tp-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'tp-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Scalloped profile — not compatible with drink rails.'],
  },
  {
    id: 'terrain',
    name: 'Terrain Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Rugged cathedral grain, scalloped profile',
    warranty: '30-yr product / fade & stain',
    scalloped: true,
    colors: ['Brown Oak', 'Silver Maple'],
    profiles: [
      { id: 'tr-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'tr-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Cortex is NOT compatible with the Terrain Collection.', 'Scalloped profile — not compatible with drink rails.'],
  },
  {
    id: 'premier-plus',
    name: 'Premier+ Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Straight-grained hardwoods',
    warranty: '30-yr product / fade & stain',
    scalloped: false,
    colors: ['Natural Oak'],
    profiles: [
      { id: 'pp-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.89, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'pp-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.89, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Three-sided cap.', 'Availability varies by region.'],
  },
  {
    id: 'prime-plus',
    name: 'Prime+ Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Timeless wood grain, scalloped profile',
    warranty: '25-yr product / fade & stain',
    scalloped: true,
    colors: ['Coconut Husk', 'Sea Salt Gray', 'Dark Cocoa'],
    profiles: [
      { id: 'pr-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'pr-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Three-sided cap.', 'Scalloped profile — not compatible with drink rails.'],
  },
  {
    id: 'prime',
    name: 'Prime Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Painted wood look, scalloped profile',
    warranty: '25-yr product / fade & stain',
    scalloped: true,
    colors: ['Dark Teak', 'Maritime Gray'],
    profiles: [
      { id: 'pm-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'pm-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.94, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Scalloped profile — not compatible with drink rails.'],
  },
  {
    id: 'premier',
    name: 'Premier Collection',
    brand: 'TimberTech Composite',
    material: 'composite',
    tagline: 'Painted wood look, full profile',
    warranty: '25-yr product / fade & stain',
    scalloped: false,
    colors: ['Dark Teak', 'Maritime Gray'],
    profiles: [
      { id: 'pe-16g', name: '1x6 Grooved (5.36")', widthIn: 5.36, thickIn: 0.89, edge: 'grooved', lengthsFt: [12, 16, 20] },
      { id: 'pe-16s', name: '1x6 Square-Shouldered (5.36")', widthIn: 5.36, thickIn: 0.89, edge: 'square', lengthsFt: [16, 20] },
    ],
    fascia: { widthIn: 11.95, thickIn: 0.575, lengthsFt: [12] },
    riser: { widthIn: 7.25, thickIn: 0.575, lengthsFt: [12] },
    notes: ['Three-sided cap. Full-profile version of Prime colors.'],
  },
]

// ---------------------------------------------------------------------------
// Fastener systems (guide pages 16–19)
// ---------------------------------------------------------------------------

export type FastenMethod = 'hidden-clip' | 'side-screw' | 'top-screw-plug' | 'top-screw' | 'tongue-screw'

export interface FastenerPack {
  name: string
  coverSqft: number
}

export interface FastenerSystem {
  id: string
  name: string
  method: FastenMethod
  description: string
  /** board edge required */
  edges: BoardEdge[]
  /** decking materials supported */
  materials: DeckMaterial[]
  /** line ids that explicitly do NOT work */
  excludedLines: string[]
  /** board-to-board gap the system produces/needs, inches */
  gapIn: number
  /** fasteners per board per joist crossing */
  perCrossing: number
  /** are there visible/plugged top screws in the field? */
  fieldTopScrews: boolean
  packs: FastenerPack[]
  notes: string[]
}

export const FASTENERS: FastenerSystem[] = [
  {
    id: 'concealoc',
    name: 'CONCEALoc Hidden Fasteners',
    method: 'hidden-clip',
    description: 'Matte-brown clips screwed to joists between grooved boards for a hidden appearance.',
    edges: ['grooved'],
    materials: ['pvc', 'composite'],
    excludedLines: ['porch'],
    gapIn: 0.1875,
    perCrossing: 1,
    fieldTopScrews: false,
    packs: [
      { name: 'CONCEALoc 100 SF carton (clips + screws)', coverSqft: 100 },
      { name: 'CONCEALoc 500 SF pail (pneumatic)', coverSqft: 500 },
      { name: 'CONCEALoc 1000 SF bucket', coverSqft: 1000 },
    ],
    notes: [
      'First/last boards and cut ends at breaker seams still need color-matched top screws.',
      'Router bit available to groove square-shouldered boards on site.',
    ],
  },
  {
    id: 'edgeloc',
    name: 'EDGELoc Hidden Fasteners',
    method: 'hidden-clip',
    description: 'Nylon 12-clip collated strips with pre-set stainless screws — consistent 7/32" gap.',
    edges: ['grooved'],
    materials: ['composite'],
    excludedLines: [],
    gapIn: 0.21875,
    perCrossing: 1,
    fieldTopScrews: false,
    packs: [
      { name: 'EDGELoc 55 SF pack', coverSqft: 55 },
      { name: 'EDGELoc 250 SF pack', coverSqft: 250 },
    ],
    notes: ['Composite decking only.', 'First/last boards and breaker cut ends need top screws.'],
  },
  {
    id: 'sideloc',
    name: 'SIDELoc Fasteners',
    method: 'side-screw',
    description: 'Screws driven at an angle through the board side into the joist with the SIDELoc guide — hidden from above.',
    edges: ['square'],
    materials: ['pvc'],
    excludedLines: ['porch'],
    gapIn: 0.125,
    perCrossing: 2,
    fieldTopScrews: false,
    packs: [
      { name: 'SIDELoc 100 SF (1" 304SS or 2" 316SS)', coverSqft: 100 },
      { name: 'SIDELoc 200 SF', coverSqft: 200 },
      { name: 'SIDELoc 500 SF', coverSqft: 500 },
    ],
    notes: [
      'Advanced PVC square-shouldered boards only.',
      'Guides: 5-1/2" standard, 3-1/2" narrow, 7-1/2" extension for wide boards. Order 1 guide + driver bits per crew.',
    ],
  },
  {
    id: 'cortex',
    name: 'Cortex Screws + Plugs',
    method: 'top-screw-plug',
    description: 'Top-down screws finished with plugs made from the same deck boards — a fastener-free look.',
    edges: ['grooved', 'square'],
    materials: ['pvc', 'composite'],
    excludedLines: ['terrain', 'porch'],
    gapIn: 0.1875,
    perCrossing: 2,
    fieldTopScrews: true,
    packs: [
      { name: 'Cortex 100 SF pack (screws; plug packs 80/400 separate)', coverSqft: 100 },
      { name: 'Cortex 300 SF collated pack', coverSqft: 300 },
    ],
    notes: ['Cortex is NOT compatible with the Terrain Collection.', 'Plug color matches the selected board color.'],
  },
  {
    id: 'toploc',
    name: 'TOPLoc Color-Match Screws',
    method: 'top-screw',
    description: 'Top-down screws in complementary colors (no plugs).',
    edges: ['grooved', 'square'],
    materials: ['pvc', 'composite'],
    excludedLines: ['porch'],
    gapIn: 0.1875,
    perCrossing: 2,
    fieldTopScrews: true,
    packs: [
      { name: 'TOPLoc 100 SF pack', coverSqft: 100 },
      { name: 'TOPLoc 500 SF pack (composite)', coverSqft: 500 },
    ],
    notes: ['PVC: 2-1/2" screws. Composite: 2-1/2" or 3" stainless.'],
  },
  {
    id: 'porch-tg',
    name: 'T&G Porch Fastening (concealed tongue screws)',
    method: 'tongue-screw',
    description: 'Trim-head screws driven through the tongue — concealed by the next board.',
    edges: ['tg'],
    materials: ['porch'],
    excludedLines: [],
    gapIn: 0.0625,
    perCrossing: 1,
    fieldTopScrews: false,
    packs: [{ name: 'Stainless trim-head screws (porch T&G) — 100 SF est.', coverSqft: 100 }],
    notes: ['Porch Collection installs tongue-and-groove for minimal gapping (covered applications).'],
  },
]

/** TOPLoc / fascia screw color families (closest match per guide). */
export const SCREW_COLOR_PVC: Record<string, string> = {
  Mahogany: 'Brown',
  'English Walnut': 'Brown',
  Kona: 'Dark Brown',
  'Dark Hickory': 'Dark Brown',
  'American Walnut': 'Dark Brown',
  'Weathered Teak': 'Light Tan',
  'French White Oak': 'Light Tan',
  Brownstone: 'Light Tan',
  'Slate Gray': 'Light Gray',
  Coastline: 'Light Gray',
  Boardwalk: 'Light Gray',
  Oyster: 'Light Gray',
  'Castle Gate': 'Dark Gray',
  Cypress: 'Tan',
  'Toasted Wheat': 'Tan',
  'Timber Gray': 'Light Gray',
}

export const SCREW_COLOR_COMPOSITE: Record<string, string> = {
  'Sea Salt Gray': 'Light Gray',
  'Maritime Gray': 'Gray',
  Driftwood: 'Gray',
  'Weathered Oak': 'Gray',
  'Silver Maple': 'Dark Gray',
  Ashwood: 'Dark Gray',
  Espresso: 'Dark Gray',
  'Antique Leather': 'Teak',
  Pecan: 'Teak',
  Tigerwood: 'Teak',
  'Coconut Husk': 'Teak',
  'Brown Oak': 'Walnut',
  'Dark Oak': 'Walnut',
  'Dark Roast': 'Walnut',
  Mocha: 'Walnut',
  'Dark Cocoa': 'Walnut',
  'Whitewash Cedar': 'Ivory',
  'Natural White Oak': 'Sand',
  'Reclaimed Chestnut': 'Sand',
  'Natural Oak': 'Sand',
  'Dark Teak': 'Walnut',
}

// ---------------------------------------------------------------------------
// Railing systems (guide pages 20–36)
// ---------------------------------------------------------------------------

export interface RailTopStyle {
  id: string
  name: string
  profile: string
  drinkRail: boolean
  /** top-rail profile bounding size, inches (plan width × elevation height) */
  widthIn: number
  heightIn: number
  /** colors subset when narrower than the system */
  colors?: string[]
}

export type InfillKind = 'baluster' | 'panel' | 'glass' | 'cable-vertical' | 'cable-horizontal' | 'open-mid'

/** How a horizontal-cable system is ordered — nothing like baluster sections. */
export interface CableSpec {
  /** cables (runs of wire) by rail height */
  cablesPerHeight: Record<number, number>
  /** 'per-section' = each section is its own tensioned run (CCS/Feeney quick-connect);
   *  'per-run' = cables run continuously through inline/corner posts to end posts (IRX kits) */
  ordering: 'per-section' | 'per-run'
  /** max continuous run, ft (per-run systems) */
  maxRunFt?: number
  /** cable kit lengths available, ft (per-run systems; 1 kit = 1 cable, cannot be cut in two) */
  kitLengthsFt?: number[]
  /** intermediate supports/balusters per section length */
  intermediatesPer?: Record<number, number>
  note: string
}

export interface RailInfill {
  id: string
  name: string
  kind: InfillKind
  /** balusters per section length (ft -> count); empty for non-baluster infills */
  balustersPer: Record<number, number>
  /** width of one baluster / cable diameter, inches (0 for glass/panels) */
  memberWidthIn: number
  incompatibleTops: string[]
  note?: string
  cable?: CableSpec
}

export type PostMount = 'sleeve' | 'aluminum' | 'steel' | 'surface-mount'

/** A selectable post size for a railing system. */
export interface PostOption {
  id: string
  label: string
  /** nominal outside dimension, inches (drawn to scale) */
  sizeIn: number
  mount: PostMount
  /** BOM line name */
  name: string
}

export interface RailingSystem {
  id: string
  name: string
  material: 'PVC' | 'Composite' | 'Aluminum' | 'Steel' | 'Premium Vinyl'
  tagline: string
  warranty: string
  colors: string[]
  heightsIn: number[]
  sectionsFt: number[]
  topStyles: RailTopStyle[]
  infills: RailInfill[]
  post: { name: string; sizeIn: number; sleeveOverWood: boolean }
  /** selectable post sizes; when >1 the UI shows a menu. First = default. */
  postOptions: PostOption[]
  /**
   * Composite systems: with top-mount installs the interior ("line") posts are
   * steel surface-mount posts (never 4x4 wood). End/corner posts still mount to
   * blocking below. When true the engine tags line posts as surface-mount.
   */
  compositeSteelPosts: boolean
  /** bottom rail profile: height of the member and clear gap under it (inches) */
  bottomRail: { heightIn: number; gapIn: number }
  gates: boolean
  stairSections: boolean
  notes: string[]
}

/** Steel surface-mount post used for top-mounted composite railing (guide p.35). */
export const SECURE_MOUNT_POST: PostOption = {
  id: 'secure-mount',
  label: 'Steel Surface-Mount Post',
  sizeIn: 4,
  mount: 'surface-mount',
  name: 'Titan/Secure steel surface-mount post (4x4) + base cover',
}

export const RAILING_SYSTEMS: RailingSystem[] = [
  {
    id: 'statement',
    name: 'Statement Rail',
    material: 'PVC',
    tagline: 'Milled-wood look, wide flat graspable top',
    warranty: '25-yr limited',
    colors: ['White'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8],
    topStyles: [{ id: 'statement-top', name: 'Statement Top Rail', profile: '2-3/4" graspable flat top', drinkRail: false, widthIn: 2.75, heightIn: 2.5 }],
    infills: [
      { id: 'hollow-sq', name: 'Hollow Square PVC Balusters', kind: 'baluster', balustersPer: { 6: 14, 8: 18 }, memberWidthIn: 1.25, incompatibleTops: [] },
      { id: 'round-al', name: 'Round Aluminum Balusters', kind: 'baluster', balustersPer: { 6: 16, 8: 22 }, memberWidthIn: 0.75, incompatibleTops: [], note: 'Stair kits use 14 (6\') / 19 (8\').' },
    ],
    post: { name: '5" sq PVC post sleeve (3/8" wall) over 4x4', sizeIn: 5, sleeveOverWood: true },
    postOptions: [{ id: 'pvc5', label: '5" sq PVC sleeve', sizeIn: 5, mount: 'sleeve', name: '5" sq PVC post sleeve (3/8" wall) over 4x4' }],
    compositeSteelPosts: false,
    bottomRail: { heightIn: 1.75, gapIn: 3 },
    gates: true,
    stairSections: true,
    notes: ['Racking stair section accommodates 18°–40°.', '42" height requires 8\' (108") post sleeves.'],
  },
  {
    id: 'pinnacle',
    name: 'Pinnacle Rail',
    material: 'PVC',
    tagline: 'Flat top rail with classic detailing',
    warranty: '25-yr limited',
    colors: ['White'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8],
    topStyles: [{ id: 'pinnacle-top', name: 'Pinnacle Top Rail', profile: '3-1/2" flat top', drinkRail: false, widthIn: 3.5, heightIn: 2.75 }],
    infills: [
      { id: 'solid-sq', name: 'Solid Square PVC Balusters', kind: 'baluster', balustersPer: { 6: 13, 8: 18 }, memberWidthIn: 1.25, incompatibleTops: [] },
      { id: 'chippendale', name: 'Decorative Panel — Chippendale Type 1', kind: 'panel', balustersPer: {}, memberWidthIn: 0, incompatibleTops: [], note: 'Level sections only; panel sized per rail height.' },
      { id: 'square-web', name: 'Decorative Panel — Square Web', kind: 'panel', balustersPer: {}, memberWidthIn: 0, incompatibleTops: [], note: 'Level sections only; panel sized per rail height.' },
    ],
    post: { name: '5" sq PVC post sleeve (3/8" wall) over 4x4', sizeIn: 5, sleeveOverWood: true },
    postOptions: [{ id: 'pvc5', label: '5" sq PVC sleeve', sizeIn: 5, mount: 'sleeve', name: '5" sq PVC post sleeve (3/8" wall) over 4x4' }],
    compositeSteelPosts: false,
    bottomRail: { heightIn: 1.75, gapIn: 3 },
    gates: true,
    stairSections: true,
    notes: ['42" height requires 8\' (108") post sleeves.'],
  },
  {
    id: 'classic-composite',
    name: 'Classic Composite Series',
    material: 'Composite',
    tagline: 'Universal bottom rail with mix-and-match top rails',
    warranty: '25-yr limited (matte: +fade & stain)',
    colors: ['White', 'Matte White', 'Matte Espresso', 'Matte Black'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8, 10],
    topStyles: [
      { id: 'premier-top', name: 'Premier Top Rail', profile: 'Traditional crown profile', drinkRail: false, widthIn: 3.5, heightIn: 2.63 },
      { id: 'radiance-top', name: 'RadianceRail Top Rail', profile: 'Wide contoured flat top', drinkRail: false, widthIn: 5.38, heightIn: 2.95 },
      { id: 'trademark-top', name: 'Trademark Top Rail', profile: 'Slim flat top', drinkRail: false, widthIn: 3.5, heightIn: 2.64, colors: ['White', 'Matte White'] },
      { id: 'cc-drink', name: 'Drink Rail (deck board cap)', profile: 'Universal rail capped with your deck board', drinkRail: true, widthIn: 5.5, heightIn: 1 },
    ],
    infills: [
      { id: 'comp-bal', name: 'Square Composite Balusters', kind: 'baluster', balustersPer: { 6: 13, 8: 18, 10: 23 }, memberWidthIn: 1.4, incompatibleTops: [] },
      { id: 'round-al', name: 'Round Aluminum Balusters', kind: 'baluster', balustersPer: { 6: 15, 8: 20, 10: 25 }, memberWidthIn: 0.75, incompatibleTops: [] },
      { id: 'square-al', name: 'Square Aluminum Balusters', kind: 'baluster', balustersPer: { 6: 15, 8: 20, 10: 25 }, memberWidthIn: 0.75, incompatibleTops: [] },
      { id: 'glass', name: 'Glass Panel (channel kit, glass local)', kind: 'glass', balustersPer: {}, memberWidthIn: 0, incompatibleTops: ['cc-drink'], note: '6\' channel kits; tempered glass sourced locally.' },
      {
        id: 'cable',
        name: 'CableRail by Feeney (stainless, horizontal)',
        kind: 'cable-horizontal',
        balustersPer: {},
        memberWidthIn: 0.125,
        incompatibleTops: ['cc-drink'],
        note: 'NOT ordered like baluster sections — see install guide.',
        cable: {
          cablesPerHeight: { 36: 9, 42: 12 },
          ordering: 'per-section',
          intermediatesPer: { 6: 1, 8: 2, 10: 3 },
          note: 'Each post-to-post section is its own tensioned run: quick-connect + swivel fitting per cable per section, cable cut from 100\'/500\' spools. Intermediate balusters + support blocks: 1 per 6\', 2 per 8\', 3 per 10\'. Posts max 6\'/8\'/10\' center-to-center. 42" hardware quantities per current price sheet.',
        },
      },
    ],
    post: { name: 'Post sleeve (4x4 / 5x5 / 5.5x5.5 / 6x6) over 4x4 wood', sizeIn: 4.25, sleeveOverWood: true },
    postOptions: [
      { id: 'sl4', label: '4x4 sleeve', sizeIn: 4.25, mount: 'sleeve', name: '4x4 post sleeve' },
      { id: 'sl5', label: '5x5 sleeve', sizeIn: 5, mount: 'sleeve', name: '5x5 post sleeve' },
      { id: 'sl55', label: '5.5x5.5 sleeve (45° cuts)', sizeIn: 5.5, mount: 'sleeve', name: '5.5x5.5 post sleeve' },
      { id: 'sl6', label: '6x6 sleeve', sizeIn: 6, mount: 'sleeve', name: '6x6 post sleeve' },
    ],
    compositeSteelPosts: true,
    bottomRail: { heightIn: 1.75, gapIn: 2.75 },
    gates: true,
    stairSections: true,
    notes: [
      'Drink Rail works with full-profile square-shouldered boards only — not scalloped collections; not compatible with glass infill.',
      'A 5.5" x 5.5" post sleeve is required for 45° angled cuts.',
      'For 42" railing use 8\' post sleeves.',
    ],
  },
  {
    id: 'advantage',
    name: 'Advantage Rail',
    material: 'Composite',
    tagline: 'SPEEDLoc side-load assembly, no visible routing',
    warranty: '25-yr limited + fade & stain (matte)',
    colors: ['Matte White', 'Matte Black', 'Matte Espresso'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8],
    topStyles: [{ id: 'advantage-top', name: 'Advantage Top Rail', profile: 'Flat top, fitted plugs hold balusters', drinkRail: false, widthIn: 3, heightIn: 2.5 }],
    infills: [
      { id: 'hollow-sq', name: 'Square Hollow Balusters', kind: 'baluster', balustersPer: { 6: 13, 8: 18 }, memberWidthIn: 1.25, incompatibleTops: [] },
      { id: 'round-al', name: 'Round Aluminum Balusters', kind: 'baluster', balustersPer: { 6: 15, 8: 20 }, memberWidthIn: 0.75, incompatibleTops: [] },
    ],
    post: { name: 'Post sleeve (4x4 / 5x5 / 5.5x5.5) over 4x4 wood', sizeIn: 4.25, sleeveOverWood: true },
    postOptions: [
      { id: 'sl4', label: '4x4 sleeve', sizeIn: 4.25, mount: 'sleeve', name: '4x4 post sleeve' },
      { id: 'sl5', label: '5x5 sleeve', sizeIn: 5, mount: 'sleeve', name: '5x5 post sleeve' },
      { id: 'sl55', label: '5.5x5.5 sleeve (45° cuts)', sizeIn: 5.5, mount: 'sleeve', name: '5.5x5.5 post sleeve' },
    ],
    compositeSteelPosts: true,
    bottomRail: { heightIn: 1.75, gapIn: 3 },
    gates: false,
    stairSections: true,
    notes: ['Kits include balusters, rails, hardware and footblocks.'],
  },
  {
    id: 'irx',
    name: 'Impression Rail Express',
    material: 'Aluminum',
    tagline: 'Panelized aluminum, pre-assembled balusters',
    warranty: 'Limited lifetime; non-combustible',
    colors: ['White', 'Black', 'Dark Bronze'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8],
    topStyles: [
      { id: 'irx-classic', name: 'Classic Top Rail', profile: 'Classic profile with decorative collars', drinkRail: false, widthIn: 2.6, heightIn: 2.4 },
      { id: 'irx-modern', name: 'Modern Top Rail', profile: 'Square modern profile', drinkRail: false, widthIn: 2, heightIn: 2 },
      { id: 'irx-drink', name: 'Drink Rail (deck board cap)', profile: 'Panel cover + clips, capped with your deck board', drinkRail: true, widthIn: 5.5, heightIn: 1 },
    ],
    infills: [
      { id: 'al-bal', name: 'Aluminum Baluster Panel', kind: 'baluster', balustersPer: { 6: 15, 8: 20 }, memberWidthIn: 0.75, incompatibleTops: [] },
      { id: 'glass', name: 'Universal Glass Panel Kit (1/4" tempered, local)', kind: 'glass', balustersPer: {}, memberWidthIn: 0, incompatibleTops: ['irx-drink'] },
      { id: 'open-mid', name: 'Balusters with Open Mid-Rail', kind: 'open-mid', balustersPer: { 6: 15, 8: 20 }, memberWidthIn: 0.75, incompatibleTops: ['irx-drink'] },
      {
        id: 'v-cable',
        name: 'Vertical Cable Panel',
        kind: 'cable-vertical',
        balustersPer: {},
        memberWidthIn: 0.125,
        incompatibleTops: ['irx-drink'],
        note: '42" level: residential only. Pre-built panels + tensioning support kits.',
        cable: {
          cablesPerHeight: {},
          ordering: 'per-section',
          note: 'Ordered as panel kits per section (universal panel cover, hardware, footblock included) PLUS a vertical-cable support kit per panel (tensioning blocks + tool). Tension before securing posts.',
        },
      },
      {
        id: 'h-cable',
        name: 'Horizontal Cable',
        kind: 'cable-horizontal',
        balustersPer: {},
        memberWidthIn: 0.125,
        incompatibleTops: ['irx-drink'],
        note: 'NOT ordered like panels — dedicated posts + cable kits per run.',
        cable: {
          cablesPerHeight: { 36: 11, 42: 14 },
          ordering: 'per-run',
          maxRunFt: 60,
          kitLengthsFt: [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
          intermediatesPer: { 6: 1, 8: 1 },
          note: 'Cables run continuously through dedicated pre-drilled 3"x3" posts (end / inline / 90° corner / stair roles; 42" stair posts for 36" rails). One cable kit per cable per run (pre-attached stud — cannot be cut in two); runs max 60\', then a new end post starts a new run. 1 intermediate cable support per opening, cut to height. Top-rail frame kits only (no bottom rail); all cables incl. the bottom cable are required. Cable count is set by the pre-drilled posts — verify per height.',
        },
      },
    ],
    post: { name: '3" aluminum post kit (post + cap + skirt)', sizeIn: 3, sleeveOverWood: false },
    postOptions: [
      { id: 'al3', label: '3" aluminum post', sizeIn: 3, mount: 'aluminum', name: '3" aluminum post kit (post + cap + skirt)' },
      { id: 'al4', label: '4" aluminum post', sizeIn: 4, mount: 'aluminum', name: '4" aluminum post kit (post + cap + skirt)' },
    ],
    compositeSteelPosts: false,
    bottomRail: { heightIn: 1.5, gapIn: 3.5 },
    gates: true,
    stairSections: true,
    notes: [
      'Drink Rail: full-profile square-shouldered boards only (not Terrain, Prime, Prime+); no glass or open mid-rail; 3" posts only.',
      '2" over-the-post kits with 18\' continuous top rail available for straight runs; 4" post components and 52" fascia-mount kits available.',
      'Universal ADA handrail add-on kits available.',
    ],
  },
  {
    id: 'fulton',
    name: 'Fulton Rail',
    material: 'Steel',
    tagline: 'Panelized steel, sleek profile',
    warranty: '15-yr limited; non-combustible',
    colors: ['Black'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8],
    topStyles: [
      { id: 'fulton-top', name: 'Fulton Top Rail', profile: 'Low-profile steel top', drinkRail: false, widthIn: 2, heightIn: 1.5 },
      { id: 'fulton-drink', name: 'Drink Rail (deck board cap)', profile: 'Panel + drink rail kit, capped with your deck board', drinkRail: true, widthIn: 5.5, heightIn: 1 },
    ],
    infills: [
      { id: 'steel-bal', name: 'Steel Balusters (rectangular)', kind: 'baluster', balustersPer: { 6: 15, 8: 20 }, memberWidthIn: 0.75, incompatibleTops: [], note: 'Panels: 6\' = 69.5" actual, 8\' = 93.5" actual.' },
    ],
    post: { name: '2"x2" or 3"x3" steel post (blank/end/mid/corner)', sizeIn: 3, sleeveOverWood: false },
    postOptions: [
      { id: 'st2', label: '2"x2" steel post', sizeIn: 2, mount: 'steel', name: '2"x2" steel post (blank/end/mid/corner)' },
      { id: 'st3', label: '3"x3" steel post', sizeIn: 3, mount: 'steel', name: '3"x3" steel post (blank/end/mid/corner)' },
    ],
    compositeSteelPosts: false,
    bottomRail: { heightIn: 1.5, gapIn: 3.5 },
    gates: true,
    stairSections: true,
    notes: ['Foot block kit required for 8\' panels.', 'Fascia-mount posts 49"/55" available.'],
  },
  {
    id: 'reliance',
    name: 'Reliance Rail',
    material: 'Premium Vinyl',
    tagline: 'High-grade vinyl, Class A flame spread',
    warranty: 'Limited lifetime (25-yr matte colors)',
    colors: ['Matte White', 'Khaki'],
    heightsIn: [36, 42],
    sectionsFt: [6, 8, 10],
    topStyles: [
      { id: 'rel-core', name: 'Core Top Rail', profile: 'Classic vinyl profile', drinkRail: false, widthIn: 3.5, heightIn: 3 },
      { id: 'rel-contour', name: 'Contour Top Rail', profile: 'Contoured profile w/ aluminum support rail', drinkRail: false, widthIn: 3.5, heightIn: 3.2 },
      { id: 'rel-drink', name: 'Drink Rail (deck board cap)', profile: 'Drink rail kit (4 clips), capped with your deck board', drinkRail: true, widthIn: 5.5, heightIn: 1 },
    ],
    infills: [
      { id: 'sq-vinyl', name: 'Square Vinyl Balusters', kind: 'baluster', balustersPer: { 6: 13, 8: 18, 10: 23 }, memberWidthIn: 1.5, incompatibleTops: [] },
      { id: 'round-al', name: 'Round Aluminum Balusters', kind: 'baluster', balustersPer: { 6: 15, 8: 20, 10: 25 }, memberWidthIn: 0.75, incompatibleTops: [] },
    ],
    post: { name: '4x4 vinyl post sleeve over 4x4 (6x6 available)', sizeIn: 4.25, sleeveOverWood: true },
    postOptions: [
      { id: 'v4', label: '4x4 vinyl sleeve', sizeIn: 4.25, mount: 'sleeve', name: '4x4 vinyl post sleeve over 4x4' },
      { id: 'v6', label: '6x6 vinyl sleeve', sizeIn: 6, mount: 'sleeve', name: '6x6 vinyl post sleeve over 6x6' },
      { id: 'vsm', label: 'Steel surface-mount post', sizeIn: 4, mount: 'surface-mount', name: 'Secure Mount Post (4") — no wood post' },
    ],
    compositeSteelPosts: false,
    bottomRail: { heightIn: 2, gapIn: 3 },
    gates: true,
    stairSections: true,
    notes: [
      '10\' sections: 36" Matte White level kits only.',
      'Secure Mount Post (4") installs without a wood post on wood/concrete/composite; adjustable 36"/42".',
      'Brackets include 22.5°/45° adapters and column adapters.',
    ],
  },
]

// ---------------------------------------------------------------------------
// PRO-TAC flashing & joist tape (guide page 37) — required on every deck
// ---------------------------------------------------------------------------

export interface TapeRoll {
  widthIn: number
  lengthFt: number
}

export const PRO_TAC = {
  name: 'PRO-TAC Flashing & Joist Tape',
  rolls: [
    { widthIn: 1.625, lengthFt: 65 },
    { widthIn: 2.5, lengthFt: 65 },
    { widthIn: 3.25, lengthFt: 65 },
    { widthIn: 4, lengthFt: 65 },
    { widthIn: 12, lengthFt: 25 },
  ] as TapeRoll[],
  note: 'Protects the lumber substructure from water penetration and rot. Applied to every joist, beam, rim and ledger.',
}

// ---------------------------------------------------------------------------
// lookups
// ---------------------------------------------------------------------------

export const lineById = (id: string): DeckingLine | undefined => DECKING_LINES.find((l) => l.id === id)
export const profileById = (line: DeckingLine, id: string): BoardProfile | undefined =>
  line.profiles.find((p) => p.id === id)
export const fastenerById = (id: string): FastenerSystem | undefined => FASTENERS.find((f) => f.id === id)
export const railSystemById = (id: string): RailingSystem | undefined => RAILING_SYSTEMS.find((r) => r.id === id)

export type PostRole = 'end' | 'corner' | 'line'

/** The user's selected sleeve/post option for a system (defaults to the first). */
export function selectedPostOption(system: RailingSystem, postOptionId: string | undefined): PostOption {
  return system.postOptions.find((p) => p.id === postOptionId) ?? system.postOptions[0]
}

/**
 * Resolve the effective post for a given role. Composite systems (top-mount)
 * use steel surface-mount posts for interior "line" posts; end/corner posts use
 * the selected sleeve over blocking. Non-composite systems use the selected
 * option for every post.
 */
export function resolvePost(system: RailingSystem, postOptionId: string | undefined, role: PostRole): PostOption {
  const chosen = selectedPostOption(system, postOptionId)
  if (system.compositeSteelPosts && role === 'line') return SECURE_MOUNT_POST
  return chosen
}

export function profileColors(line: DeckingLine, profile: BoardProfile): string[] {
  return profile.colors ?? line.colors
}

export function screwColorFor(line: DeckingLine, color: string): string {
  const map = line.material === 'composite' ? SCREW_COLOR_COMPOSITE : SCREW_COLOR_PVC
  return map[color] ?? 'match'
}
