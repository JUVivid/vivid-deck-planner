// ---------- Core domain model ----------
// World units are decimal feet. +x = East, +y = South (screen-down). North = top of screen.

export interface Pt {
  x: number
  y: number
}

export type Species = 'SP' | 'DF' | 'CEDAR'
export type LumberSize = '2x6' | '2x8' | '2x10' | '2x12'
export type JoistSpacing = 12 | 16 | 24
export type BeamStyle = 'drop' | 'flush'
export type BeamPly = 2 | 3
export type DeckingAngle = 0 | 45 | 90
/** 0 = joists run E–W (along x), 90 = joists run N–S (along y) */
export type JoistDir = 0 | 90

export interface EdgeProps {
  ledger: boolean
  railing: boolean
  fascia: boolean
}

export interface FramingConfig {
  species: Species
  joistSize: LumberSize
  spacing: JoistSpacing
  joistDir: JoistDir
  beamStyle: BeamStyle
  beamSize: LumberSize
  beamPly: BeamPly
  /** preferred cantilever beyond outermost beam, ft */
  cantilever: number
  doubleRim: boolean
}

/** Catalog-driven decking selection (TimberTech 2026). Width/thickness/gap derive from the catalog. */
export interface DeckingConfig {
  /** DeckingLine id from src/catalog */
  lineId: string
  /** color name within the line */
  colorId: string
  /** BoardProfile id within the line */
  profileId: string
  /** FastenerSystem id */
  fastenerId: string
  /** board direction: 0 = E–W, 90 = N–S, 45 = diagonal */
  angle: DeckingAngle
  pictureFrame: 0 | 1 | 2
  /**
   * BoardProfile id used for the picture-frame border rings (null = same board
   * as the field). Lets a wide 1x8 (7.25") border ring a 1x6 field.
   */
  pfProfileId: string | null
  breakers: 'none' | 'auto'
  /** manual breaker-board stations, as fraction 0..1 along the board-run axis */
  breakerStations: number[]
  /** stock lengths in use (subset of the profile's lengths), ft */
  stockLengths: number[]
}

/** Project-wide railing selection (TimberTech 2026). */
export interface RailingConfig {
  systemId: string
  colorId: string
  heightIn: 36 | 42
  topStyleId: string
  infillId: string
  /** selected post size option id (see RailingSystem.postOptions) */
  postOptionId?: string
}

export interface Tier {
  id: string
  name: string
  /** simple polygon, ft; edge i = outline[i] -> outline[(i+1) % n] */
  outline: Pt[]
  edges: EdgeProps[]
  /** top of decking above grade, ft */
  height: number
  framing: FramingConfig
  decking: DeckingConfig
}

export interface Stairs {
  id: string
  tierId: string
  edgeIndex: number
  /** 0..1, center position along edge */
  t: number
  /** ft */
  width: number
  landing: { kind: 'grade' } | { kind: 'tier'; tierId: string }
}

/**
 * Labour rates for the customer quote. Vivid prices labour by the unit of work:
 * decking and stairs by finished SURFACE area, railing by LINEAR foot.
 * `null` = not configured yet; the quote shows the quantity and holds the price.
 */
export interface QuoteRates {
  /** $ per sq ft of finished deck surface — composite/PVC decking */
  deckingPerSqft: number | null
  /** $ per sq ft — wood decking */
  deckingWoodPerSqft: number | null
  /** $ per sq ft of finished stair surface — treads AND risers together */
  stepsPerSqft: number | null
  /** $ per linear ft — standard composite / vinyl railing */
  railingPerLf: number | null
  /** $ per linear ft — specialty infill (cable, glass) */
  railingSpecialtyPerLf: number | null
  /** $ per sq ft of existing structure removed */
  demoPerSqft: number | null
  /** $ per fixture */
  lightingPerFixture: number | null
}

/** Fixed job costs Vivid carries on every new build. */
export interface JobCosts {
  permit: number
  drawings: number
  /** extra City of Charlotte review fees on Mecklenburg jobs */
  mecklenburgPermitSurcharge: number
}

/** Customer-facing quote configuration (scope toggles + rates). */
export interface QuoteConfig {
  preparedFor: string
  /** demolition & haul-away of the existing structure — optional scope */
  demo: { enabled: boolean; areaSqft: number }
  /** low-voltage lighting package — placeholder until the catalog lands */
  lighting: { enabled: boolean; fixtures: number }
  /**
   * Sales tax % applied to MATERIAL COST (Vivid pays it at the yard). Never a
   * customer line — a new deck is a capital improvement under NC real property
   * contract rules.
   */
  taxPct: number
  /** Mecklenburg County / City of Charlotte: higher tax + extra city reviews */
  mecklenburg: boolean
  /**
   * Waste allowance added to MATERIAL COST, % — hidden from the customer.
   * NOTE: decking board counts already carry their own per-tier waste factor,
   * so decking effectively carries both.
   */
  materialWastePct: number
  /**
   * Gross profit MARGIN on the whole job, % — price = cost / (1 - margin).
   * 45% margin means the job sells for cost ÷ 0.55 (a 1.818× multiplier),
   * NOT cost × 1.45. Set `marginIsMarkup` to use the simpler multiplier.
   */
  profitMarginPct: number
  /** treat profitMarginPct as a markup (cost × (1+p)) instead of a margin */
  marginIsMarkup: boolean
  rates: QuoteRates
  costs: JobCosts
  /** override the computed material cost when a real order has been priced */
  materialsOverride: number | null
}

export interface ProjectSettings {
  /** in */
  frostDepth: number
  /** psf */
  soilBearing: number
  railing: RailingConfig
  ledgerFastener: 'lag' | 'bolt'
  liveLoad: number
  deadLoad: number
  quote: QuoteConfig
}

export interface Project {
  version: 2
  name: string
  tiers: Tier[]
  stairs: Stairs[]
  settings: ProjectSettings
}

// ---------- UI state ----------

export type Tool = 'select' | 'draw' | 'stairs' | 'measure' | 'pan'
export type ViewKind = 'top' | 'N' | 'S' | 'E' | 'W'

export type Selection =
  | { kind: 'none' }
  | { kind: 'tier'; tierId: string }
  | { kind: 'edge'; tierId: string; index: number }
  | { kind: 'vertex'; tierId: string; index: number }
  | { kind: 'stairs'; stairsId: string }

export interface Layers {
  grid: boolean
  decking: boolean
  framing: boolean
  hardware: boolean
  dimensions: boolean
  railing: boolean
  labels: boolean
}
