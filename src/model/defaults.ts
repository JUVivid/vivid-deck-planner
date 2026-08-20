import { autoFrameAll } from '../engine/autoframe'
import type {
  DeckingConfig,
  EdgeProps,
  FramingConfig,
  Project,
  ProjectSettings,
  Pt,
  QuoteConfig,
  QuoteRates,
  RailingConfig,
  Tier,
} from './types'

let counter = 0
export function uid(prefix = 'id'): string {
  counter++
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function defaultFraming(): FramingConfig {
  return {
    species: 'SP',
    joistSize: '2x8',
    spacing: 16,
    joistDir: 90,
    beamStyle: 'drop',
    beamSize: '2x10',
    beamPly: 2,
    cantilever: 0, // off by default — reps pick 1/2/3 ft; 0 = flush girder
    doubleRim: false,
  }
}

export function defaultDecking(): DeckingConfig {
  return {
    lineId: 'legacy',
    colorId: 'Espresso',
    profileId: 'lg-16g',
    fastenerId: 'concealoc',
    angle: 0,
    pictureFrame: 1,
    pfProfileId: null,
    pfColorId: null,
    breakerColorId: null,
    fasciaColorId: null,
    breakers: 'auto',
    breakerStations: [],
    stockLengths: [12, 16, 20],
  }
}

export function defaultRailing(): RailingConfig {
  return {
    systemId: 'classic-composite',
    colorId: 'Matte Black',
    heightIn: 36,
    topStyleId: 'radiance-top',
    infillId: 'round-al',
    postOptionId: 'sl4',
  }
}

/** Vivid Outdoor Living operates in North Carolina: 12" frost depth, 1500 psf soil. */
export const NC_FROST_DEPTH_IN = 12
export const NC_SOIL_BEARING_PSF = 1500

/** NC sales tax on materials. Mecklenburg went to 8.25% on 2026-07-01. */
export const NC_TAX_PCT = 7.5
export const MECKLENBURG_TAX_PCT = 8.25

/**
 * Vivid's rate card (labour breakdown + 6/29/2026 price sheet).
 * Tax is a COST input on materials, not a customer-facing line.
 */
export function defaultQuote(): QuoteConfig {
  return {
    preparedFor: '',
    demo: { enabled: false, areaSqft: 0 },
    lighting: { enabled: false, fixtures: 0 },
    taxPct: NC_TAX_PCT,
    mecklenburg: false,
    materialWastePct: 10,
    profitMarginPct: 45,
    marginIsMarkup: false,
    rates: {
      deckingPerSqft: 15, // composite / PVC
      deckingWoodPerSqft: 12,
      stepsPerSqft: 15, // treads + risers together
      railingPerLf: 5,
      railingSpecialtyPerLf: 10, // cable & glass
      demoPerSqft: 5,
      lightingPerFixture: null,
    },
    costs: {
      permit: 350,
      drawings: 500,
      // published City of Charlotte residential zoning review — verify against invoices
      mecklenburgPermitSurcharge: 65,
    },
    materialsOverride: null,
  }
}

export function defaultSettings(): ProjectSettings {
  return {
    quote: defaultQuote(),
    frostDepth: NC_FROST_DEPTH_IN,
    soilBearing: NC_SOIL_BEARING_PSF,
    railing: defaultRailing(),
    ledgerFastener: 'lag',
    liveLoad: 40,
    deadLoad: 10,
  }
}

export function defaultEdge(): EdgeProps {
  // fascia on by default (turned off automatically on ledger / adjoining edges)
  return { ledger: false, railing: false, fascia: true }
}

export function newTier(outline: Pt[], name: string, height = 3): Tier {
  return {
    id: uid('tier'),
    name,
    outline,
    edges: outline.map(() => defaultEdge()),
    height,
    framing: defaultFraming(),
    decking: defaultDecking(),
  }
}

export function blankProject(name = 'Untitled Deck'): Project {
  return {
    version: 2,
    name,
    tiers: [],
    stairs: [],
    settings: defaultSettings(),
  }
}

/**
 * Migrate a v1 project (generic materials) to v2 (TimberTech catalog).
 * Composite -> Legacy Espresso grooved + CONCEALoc; wood -> Vintage grooved.
 */
export function migrateProject(raw: unknown): Project | null {
  const p = raw as Record<string, unknown>
  if (!p || !Array.isArray(p.tiers)) return null
  if (p.version === 2) {
    const proj = p as unknown as Project
    // company standards (NC): fixed site parameters
    proj.settings.frostDepth = NC_FROST_DEPTH_IN
    proj.settings.soilBearing = NC_SOIL_BEARING_PSF
    // backfill fields added after v2 shipped
    if (proj.settings.railing.postOptionId === undefined) proj.settings.railing.postOptionId = undefined
    if (!proj.settings.quote) proj.settings.quote = defaultQuote()
    else {
      // backfill every field added since this save was written, and drop any
      // null rate that now has a real value on the rate card
      const d = defaultQuote()
      const q = { ...d, ...proj.settings.quote }
      q.demo = { ...d.demo, ...(proj.settings.quote.demo ?? {}) }
      q.lighting = { ...d.lighting, ...(proj.settings.quote.lighting ?? {}) }
      q.costs = { ...d.costs, ...(proj.settings.quote.costs ?? {}) }
      const savedRates = (proj.settings.quote.rates ?? {}) as Partial<QuoteRates>
      const rates = { ...d.rates } as unknown as Record<string, unknown>
      for (const [k, v] of Object.entries(savedRates)) {
        if (v !== null && v !== undefined) rates[k] = v
      }
      q.rates = rates as unknown as QuoteRates
      if (typeof q.taxPct !== 'number') q.taxPct = d.taxPct
      proj.settings.quote = q
    }
    for (const t of proj.tiers) {
      if (!Array.isArray(t.decking.breakerStations)) t.decking.breakerStations = []
      if (t.decking.pfProfileId === undefined) t.decking.pfProfileId = null
      if (t.decking.pfColorId === undefined) t.decking.pfColorId = null
      if (t.decking.breakerColorId === undefined) t.decking.breakerColorId = null
      if (t.decking.fasciaColorId === undefined) t.decking.fasciaColorId = null
      // waste is the company allowance now — reps never set it per tier
      delete (t.decking as { wasteFactor?: number }).wasteFactor
    }
    // legacy wrap enum → positional wrapping: center the span on that corner
    for (const st of proj.stairs as (Project['stairs'][number] & { wrap?: string })[]) {
      if (st.wrap === 'start' || st.wrap === 'end') {
        st.t = st.wrap === 'start' ? 0 : 1
        st.width = st.width * 2 // old model added a second leg on top of width
      }
      delete st.wrap
    }
    return proj
  }
  if (p.version !== 1) return null

  const old = p as unknown as {
    name: string
    tiers: (Tier & { decking: Record<string, unknown> })[]
    stairs: Project['stairs']
    settings: Record<string, unknown>
  }
  const next = blankProject(old.name)
  next.stairs = old.stairs ?? []
  next.tiers = old.tiers.map((t) => {
    const od = t.decking as { material?: string; angle?: 0 | 45 | 90; pictureFrame?: 0 | 1 | 2; breakers?: 'none' | 'auto' }
    const wood = od.material === 'wood54' || od.material === 'wood2x6'
    const decking: DeckingConfig = {
      ...defaultDecking(),
      lineId: wood ? 'vintage' : 'legacy',
      colorId: wood ? 'English Walnut' : 'Espresso',
      profileId: wood ? 'v-16g' : 'lg-16g',
      fastenerId: 'concealoc',
      angle: od.angle ?? 0,
      pictureFrame: od.pictureFrame ?? 1,
      breakers: od.breakers ?? 'auto',
    }
    return { ...t, decking }
  })
  const os = old.settings as { guardHeight?: 36 | 42; ledgerFastener?: 'lag' | 'bolt' }
  next.settings.ledgerFastener = os.ledgerFastener ?? 'lag'
  next.settings.railing.heightIn = os.guardHeight ?? 36
  return next
}

/** Sample project that exercises most features — loaded on first run. */
export function demoProject(): Project {
  const main = newTier(
    [
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 12 },
      { x: 6, y: 12 },
      { x: 6, y: 16 },
      { x: 0, y: 16 },
    ],
    'Main Deck',
    3.5,
  )
  main.edges[0].ledger = true // north edge against the house
  for (let i = 1; i < main.edges.length; i++) {
    main.edges[i].railing = true
    main.edges[i].fascia = true
  }
  // Legacy Espresso, grooved, CONCEALoc (defaults)

  const lower = newTier(
    [
      { x: 16, y: 4 },
      { x: 24, y: 4 },
      { x: 24, y: 12 },
      { x: 16, y: 12 },
    ],
    'Lower Tier',
    1.75,
  )
  lower.decking = {
    ...defaultDecking(),
    lineId: 'terrain-plus',
    colorId: 'Dark Oak',
    profileId: 'tp-16g',
    fastenerId: 'edgeloc',
    angle: 45,
    pictureFrame: 0,
  }
  lower.framing.spacing = 12 // diagonal decking needs 12" oc
  lower.framing.cantilever = 0.5
  for (const e of lower.edges) e.fascia = true

  const project = blankProject('Sample — Maple St.')
  project.tiers = [main, lower]
  autoFrameAll(project)
  project.stairs = [
    {
      id: uid('stair'),
      tierId: main.id,
      edgeIndex: 2,
      t: 0.5,
      width: 4,
      landing: { kind: 'grade' },
    },
    {
      id: uid('stair'),
      tierId: main.id,
      edgeIndex: 1,
      t: 0.65,
      width: 4,
      landing: { kind: 'tier', tierId: lower.id },
    },
    {
      id: uid('stair'),
      tierId: lower.id,
      edgeIndex: 1,
      t: 0.5,
      width: 4,
      landing: { kind: 'grade' },
    },
  ]
  return project
}
