import type { Project } from '../model/types'
import { computeFraming, type FramingResult } from './framing'
import { computeDecking, countFasteners, type DeckingResult, type FastenerCounts } from './decking'
import { computeRailing, computeFascia, type RailingResult } from './railing'
import { computeStairs, type StairsCalc } from './stairs'
import { runCompliance, type Check } from './compliance'
import { buildBom, bomToCsv, type BomLine, type LumberPlan, type TierParts } from './bom'
import { buildQuote, type QuoteResult } from './quote'
import { resolveDecking } from '../catalog/compat'

export interface TierComputed extends TierParts {
  framing: FramingResult
  decking: DeckingResult
  railing: RailingResult
  fasciaLf: number
  fasciaEdges: number[]
  fasteners: FastenerCounts
}

export interface ProjectComputed {
  byTier: Map<string, TierComputed>
  stairs: StairsCalc[]
  checks: Check[]
  bom: BomLine[]
  /** optimized lumber purchase + crew cut list, per section × size */
  cutPlans: LumberPlan[]
  quote: QuoteResult
  totals: {
    areaSqft: number
    failCount: number
    warnCount: number
    footings: number
    posts: number
  }
}

const memo = new WeakMap<Project, ProjectComputed>()

export function computeProject(project: Project): ProjectComputed {
  const hit = memo.get(project)
  if (hit) return hit

  const byTier = new Map<string, TierComputed>()
  const allStairs: StairsCalc[] = []

  for (const st of project.stairs) {
    const sc = computeStairs(st, project)
    if (sc) allStairs.push(sc)
  }

  for (const tier of project.tiers) {
    const decking = computeDecking(tier)
    const framing = computeFraming(tier, project.settings, {
      breakerUs: decking.breakerUs,
      pfRings: decking.insetFailed ? 0 : tier.decking.pictureFrame,
      pfPitchFt: decking.pfPitchFt,
      boardWidthFt: decking.boardWidthIn / 12,
    })
    const stairsOnTier = allStairs.filter((s) => s.tier.id === tier.id)
    const railing = computeRailing(tier, stairsOnTier, project.settings)
    const fascia = computeFascia(tier, project.tiers)
    const fasteners = countFasteners(
      decking,
      resolveDecking(tier).fastener,
      framing.joistUs,
      tier.framing.joistDir,
      tier.framing.spacing / 12,
    )
    byTier.set(tier.id, {
      framing,
      decking,
      railing,
      fasciaLf: fascia.lf,
      fasciaEdges: fascia.edges,
      fasteners,
    })
  }

  const checks = runCompliance(project, byTier, allStairs)
  const { lines: bom, cutPlans } = buildBom(project, byTier, allStairs)
  const quote = buildQuote(project, byTier, allStairs, bom)

  const totals = {
    areaSqft: [...byTier.values()].reduce((s, t) => s + t.decking.areaSqft, 0),
    failCount: checks.filter((c) => c.level === 'fail').length,
    warnCount: checks.filter((c) => c.level === 'warn').length,
    footings: [...byTier.values()].reduce((s, t) => s + t.framing.footings.length, 0),
    posts: [...byTier.values()].reduce((s, t) => s + t.framing.posts.length, 0),
  }

  const result: ProjectComputed = { byTier, stairs: allStairs, checks, bom, cutPlans, quote, totals }
  memo.set(project, result)
  return result
}

export { bomToCsv }
export { jobTreadCsv, jobTreadCsvFilename, buildJobTreadRows, JOBTREAD_HEADER } from './jobtread'
export type { BomLine, Check, LumberPlan, StairsCalc, FramingResult, DeckingResult, RailingResult, QuoteResult }
