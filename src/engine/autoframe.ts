import type { Project, Tier } from '../model/types'
import { deckingMaxSpacing, resolveDecking } from '../catalog/compat'
import { computeFraming } from './framing'

/** The rep's cantilever choices. 0 = no cantilever → flush-set girder. */
export const CANTILEVER_OPTIONS = [0, 1, 2, 3] as const

const NO_NEEDS = { breakerUs: [], pfRings: 0, pfPitchFt: 1, boardWidthFt: 0.5 }

/** Memo: joist-size probes are geometry-driven and commits fire per drag frame. */
const sizeMemo = new Map<string, '2x8' | '2x10'>()

/**
 * Vivid company framing standard — the program decides, reps don't.
 *
 * Every deck is framed the same way (this is what the company actually builds,
 * per their own job takeoffs and receipts):
 *   • Southern Yellow Pine, ordered as #1 — but spans always checked on the
 *     No. 2 tables, since a yard may substitute #2 on any project
 *   • 2x8 joists with LUS28 hangers
 *   • (2) 2x10 drop girder on 6x6 posts — the engine adds as many beam lines
 *     as the spans require, so depth never makes this non-compliant
 *   • joist spacing = the maximum the selected decking allows
 *     (16" oc perpendicular, 12" oc diagonal, 24" for MAX boards)
 *   • joists run perpendicular to the ledger (they must bear on it); on a
 *     freestanding deck they span the shorter direction
 *
 * The ONE knob a rep keeps is the cantilever (clamped to a sane range).
 * Standardising the assembly is deliberate: one hanger SKU, one beam recipe,
 * one crew habit — the engine guarantees code compliance around it.
 */
export function autoFrameTier(tier: Tier): void {
  const f = tier.framing
  const { profile } = resolveDecking(tier)
  const diagonal = tier.decking.angle === 45

  f.species = 'SP'
  f.beamSize = '2x10'
  f.beamPly = 2
  f.doubleRim = false
  f.spacing = deckingMaxSpacing(profile, diagonal) as 12 | 16 | 24

  // the rep's one knob, snapped to the company presets (0 / 1 / 2 / 3 ft);
  // no cantilever → girder sets FLUSH in the rim (saves beam depth and looks)
  f.cantilever = [...CANTILEVER_OPTIONS].reduce((best, o) =>
    Math.abs(o - f.cantilever) < Math.abs(best - f.cantilever) ? o : best,
  )
  f.beamStyle = f.cantilever > 0 ? 'drop' : 'flush'

  // joists run perpendicular to the (longest) ledger edge; freestanding decks
  // span the shorter footprint direction
  const n = tier.outline.length
  let bestLedgerLen = 0
  let ledgerDir: 0 | 90 | null = null
  for (let i = 0; i < n; i++) {
    if (!tier.edges[i]?.ledger) continue
    const a = tier.outline[i]
    const b = tier.outline[(i + 1) % n]
    const dx = Math.abs(b.x - a.x)
    const dy = Math.abs(b.y - a.y)
    const len = Math.hypot(dx, dy)
    if (len <= bestLedgerLen) continue
    bestLedgerLen = len
    // horizontal ledger (runs E–W) → joists run N–S (90)
    ledgerDir = dx >= dy ? 90 : 0
  }
  if (ledgerDir !== null) {
    f.joistDir = ledgerDir
  } else {
    const xs = tier.outline.map((p) => p.x)
    const ys = tier.outline.map((p) => p.y)
    const xExt = Math.max(...xs) - Math.min(...xs)
    const yExt = Math.max(...ys) - Math.min(...ys)
    f.joistDir = yExt <= xExt ? 90 : 0
  }

  // ---- joist size: upgrade to 2x10 BEFORE adding an interior beam line ----
  // 2x8 is the standard; but if its shorter span forces the engine to insert
  // an extra girder (posts + footings + concrete), stepping up to 2x10 first
  // is the cheaper build. Probe both and keep 2x8 only when it needs no more
  // beam lines than 2x10 would.
  const sig = JSON.stringify([
    tier.outline,
    tier.edges.map((e) => e.ledger),
    f.spacing,
    f.joistDir,
    f.cantilever,
    f.beamStyle,
  ])
  const memoized = sizeMemo.get(sig)
  if (memoized) {
    f.joistSize = memoized
  } else {
    f.joistSize = '2x8'
    const beams8 = computeFraming(tier, PROBE_SETTINGS, NO_NEEDS).beams.length
    f.joistSize = '2x10'
    const beams10 = computeFraming(tier, PROBE_SETTINGS, NO_NEEDS).beams.length
    f.joistSize = beams10 < beams8 ? '2x10' : '2x8'
    if (sizeMemo.size > 500) sizeMemo.clear()
    sizeMemo.set(sig, f.joistSize)
  }
}

/** Site constants only matter for footings — irrelevant to the beam-count probe. */
const PROBE_SETTINGS = {
  frostDepth: 12,
  soilBearing: 1500,
  liveLoad: 40,
  deadLoad: 10,
} as Parameters<typeof computeFraming>[1]

/** Run the company framing standard across every tier. */
export function autoFrameAll(project: Project): void {
  for (const tier of project.tiers) autoFrameTier(tier)
  // company standard ledger attachment
  project.settings.ledgerFastener = 'lag'
}
