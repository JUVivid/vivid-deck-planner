import type { Project, Tier } from '../model/types'
import {
  DECKING_LINES,
  FASTENERS,
  RAILING_SYSTEMS,
  fastenerById,
  lineById,
  profileById,
  profileColors,
  railSystemById,
  type BoardProfile,
  type DeckingLine,
  type FastenerSystem,
  type RailInfill,
  type RailTopStyle,
  type RailingSystem,
} from './timbertech'

export interface Resolved {
  line: DeckingLine
  profile: BoardProfile
  /** board used for the picture-frame border rings (= profile unless a wider one is picked) */
  pfProfile: BoardProfile
  fastener: FastenerSystem
  color: string
  /** accent colors — default to `color`, always from the SAME line (families never mix) */
  pfColor: string
  breakerColor: string
  fasciaColor: string
}

/** colors offered for a line's fascia boards (falls back to the line palette) */
export function fasciaColors(line: DeckingLine): string[] {
  return line.fascia?.colors ?? line.colors
}

/** Resolve a tier's decking selection against the catalog (falls back hard). */
export function resolveDecking(tier: Tier): Resolved {
  const line = lineById(tier.decking.lineId) ?? DECKING_LINES[0]
  const profile = profileById(line, tier.decking.profileId) ?? line.profiles[0]
  const pfId = tier.decking.pfProfileId
  const pfProfile = (pfId ? profileById(line, pfId) : null) ?? profile
  const fastener = fastenerById(tier.decking.fastenerId) ?? validFasteners(line, profile)[0] ?? FASTENERS[0]
  const colors = profileColors(line, profile)
  const color = colors.includes(tier.decking.colorId) ? tier.decking.colorId : colors[0]
  // accents: match the field unless a valid same-line color was chosen
  const pick = (id: string | null | undefined, palette: string[]): string =>
    id && palette.includes(id) ? id : color
  const pfColor = pick(tier.decking.pfColorId, profileColors(line, pfProfile))
  const breakerColor = pick(tier.decking.breakerColorId, colors)
  const fascColor = pick(tier.decking.fasciaColorId, fasciaColors(line))
  return { line, profile, pfProfile, fastener, color, pfColor, breakerColor, fasciaColor: fascColor }
}

/** Nominal 1x8 board width — the wide picture-frame border option. */
export const WIDE_PF_WIDTH_IN = 7.25

/**
 * Profile family used by the price sheet, derived from the catalog profile so
 * the two never drift: the sheet groups boards as grooved / square-shouldered
 * with separate WIDE, NARROW and MAX sections.
 */
export function profileKind(p: BoardProfile): 'grooved' | 'square' | 'wide' | 'narrow' | 'max' {
  if (p.thickIn >= 1.4) return 'max'
  if (p.widthIn >= WIDE_PF_WIDTH_IN) return 'wide'
  if (p.widthIn <= 4) return 'narrow'
  return p.edge === 'grooved' ? 'grooved' : 'square'
}

/**
 * Boards that can serve as picture-frame borders in this line. Border rings are
 * ordered from the same collection so colour, thickness and expansion all match
 * the field — a wide 1x8 border is only possible where the line offers one.
 */
export function pfProfileOptions(line: DeckingLine): BoardProfile[] {
  return line.profiles.filter((p) => p.edge !== 'tg')
}

/** Collections that offer a 1x8 (7.25") board, for the "no wide board here" hint. */
export function widePfLineNames(): string[] {
  return DECKING_LINES.filter((l) => l.profiles.some((p) => p.widthIn >= WIDE_PF_WIDTH_IN)).map((l) => l.name)
}

/**
 * Max joist spacing (in) per install guides: 16" oc (12" diagonal / commercial);
 * MAX 1.5"-thick boards allow 24" oc (16" diagonal).
 */
export function deckingMaxSpacing(profile: BoardProfile, diagonal: boolean): number {
  const o = profile.maxJoistSpacingIn
  if (o) return diagonal ? o.diag : o.perp
  return diagonal ? 12 : 16
}

/** Fastener systems that work with a given line + profile. */
export function validFasteners(line: DeckingLine, profile: BoardProfile): FastenerSystem[] {
  return FASTENERS.filter(
    (f) =>
      f.materials.includes(line.material) &&
      f.edges.includes(profile.edge) &&
      !f.excludedLines.includes(line.id),
  )
}

/** Human-readable reason a fastener cannot be used (null = allowed). */
export function fastenerBlockReason(line: DeckingLine, profile: BoardProfile, f: FastenerSystem): string | null {
  if (!f.materials.includes(line.material)) {
    return `${f.name} is not offered for ${line.brand}.`
  }
  if (f.excludedLines.includes(line.id)) {
    return `${f.name} is not compatible with the ${line.name}.`
  }
  if (!f.edges.includes(profile.edge)) {
    if (f.edges.includes('grooved')) return `${f.name} needs grooved-edge boards — this profile is ${profile.edge === 'tg' ? 'tongue-and-groove' : 'square-shouldered'}.`
    if (f.edges.includes('square')) return `${f.name} needs square-shouldered boards.`
    if (f.edges.includes('tg')) return `${f.name} is for tongue-and-groove porch boards only.`
  }
  return null
}

/** Normalize a tier's decking selection after any change; returns messages about auto-fixes. */
export function normalizeDecking(tier: Tier): string[] {
  const msgs: string[] = []
  const line = lineById(tier.decking.lineId) ?? DECKING_LINES[0]
  tier.decking.lineId = line.id

  let profile = profileById(line, tier.decking.profileId)
  if (!profile) {
    // try to keep the same edge style when switching lines
    const prevEdge = tier.decking.profileId.includes('s') ? 'square' : 'grooved'
    profile = line.profiles.find((p) => p.edge === prevEdge) ?? line.profiles[0]
    tier.decking.profileId = profile.id
  }

  const colors = profileColors(line, profile)
  if (!colors.includes(tier.decking.colorId)) {
    if (line.colors.includes(tier.decking.colorId)) {
      msgs.push(`${tier.decking.colorId} is not offered in ${profile.name} — switched to ${colors[0]}.`)
    }
    tier.decking.colorId = colors[0]
  }

  const okFasteners = validFasteners(line, profile)
  if (!okFasteners.some((f) => f.id === tier.decking.fastenerId)) {
    const old = fastenerById(tier.decking.fastenerId)
    const next = okFasteners[0]
    if (next) {
      if (old) msgs.push(`${old.name} doesn't fit ${line.name} ${profile.name} — switched to ${next.name}.`)
      tier.decking.fastenerId = next.id
    }
  }

  // stock lengths are not user-facing: always match the manufacturer's offering
  tier.decking.stockLengths = [...profile.lengthsFt]

  // picture-frame border board must be a real profile in this line
  const pfId = tier.decking.pfProfileId ?? null
  if (pfId) {
    const pf = profileById(line, pfId)
    if (!pf) {
      // switching lines: keep a wide border if the new line offers one
      const prevWide = pfId.includes('18')
      const replacement = prevWide ? line.profiles.find((p) => p.widthIn >= WIDE_PF_WIDTH_IN) : null
      if (replacement) {
        tier.decking.pfProfileId = replacement.id
      } else {
        tier.decking.pfProfileId = null
        if (prevWide) msgs.push(`${line.name} is not offered in a 1x8 (7-1/4") board — picture frame is back to ${profile.name}.`)
      }
    } else if (pf.id === profile.id) {
      tier.decking.pfProfileId = null // same board as the field: no override needed
    }
  } else {
    tier.decking.pfProfileId = null // normalize undefined (older saves)
  }

  // accent colors (picture frame / breakers / fascia) are FAMILY-LOCKED: they
  // may only be colors of THIS line. Anything else (typically after switching
  // collections) falls back to matching the field color.
  const pfProf = (tier.decking.pfProfileId ? profileById(line, tier.decking.pfProfileId) : null) ?? profile!
  const clampAccent = (
    key: 'pfColorId' | 'breakerColorId' | 'fasciaColorId',
    palette: string[],
    label: string,
  ) => {
    const id = tier.decking[key] ?? null
    if (id === null) {
      tier.decking[key] = null // normalize undefined (older saves)
      return
    }
    if (id === tier.decking.colorId) {
      tier.decking[key] = null // matches the field: no override needed
      return
    }
    if (!palette.includes(id)) {
      tier.decking[key] = null
      msgs.push(`${id} is not offered for the ${line.name} ${label} — back to matching the decking.`)
    }
  }
  clampAccent('pfColorId', profileColors(line, pfProf), 'picture frame')
  clampAccent('breakerColorId', profileColors(line, profile!), 'breaker boards')
  clampAccent('fasciaColorId', fasciaColors(line), 'fascia')

  // porch boards: no picture frame / breakers (T&G field runs continuous)
  if (line.material === 'porch') {
    if (tier.decking.pictureFrame !== 0) {
      tier.decking.pictureFrame = 0
      msgs.push('Picture frames are not used with T&G porch boards.')
    }
    tier.decking.pfProfileId = null
    tier.decking.pfColorId = null
    tier.decking.breakerColorId = null
    tier.decking.breakers = 'none'
  }
  return msgs
}

// ---------------------------------------------------------------------------
// Railing compatibility
// ---------------------------------------------------------------------------

export function railSystem(project: Project): RailingSystem {
  return railSystemById(project.settings.railing.systemId) ?? RAILING_SYSTEMS[0]
}

export function topStyle(system: RailingSystem, id: string): RailTopStyle {
  return system.topStyles.find((t) => t.id === id) ?? system.topStyles[0]
}

export function infill(system: RailingSystem, id: string): RailInfill {
  return system.infills.find((i) => i.id === id) ?? system.infills[0]
}

/** Tiers whose decking cannot cap a drink rail (scalloped or non-square edge). */
export function drinkRailBlockers(project: Project): { tier: Tier; reason: string }[] {
  const out: { tier: Tier; reason: string }[] = []
  for (const tier of project.tiers) {
    const hasRailing = tier.edges.some((e) => e.railing && !e.ledger)
    if (!hasRailing) continue
    const { line, profile } = resolveDecking(tier)
    if (line.scalloped) {
      out.push({ tier, reason: `${tier.name} uses ${line.name} (scalloped) — drink rails need full-profile boards.` })
    } else if (profile.edge !== 'square') {
      out.push({
        tier,
        reason: `${tier.name} uses ${profile.edge === 'tg' ? 'T&G porch' : 'grooved'} boards — drink rails cap with square-shouldered boards.`,
      })
    }
  }
  return out
}

export function topStyleBlockReason(project: Project, system: RailingSystem, t: RailTopStyle): string | null {
  if (t.drinkRail) {
    const blockers = drinkRailBlockers(project)
    if (blockers.length > 0) return blockers[0].reason
  }
  return null
}

export function infillBlockReason(system: RailingSystem, topId: string, inf: RailInfill): string | null {
  if (inf.incompatibleTops.includes(topId)) {
    const t = topStyle(system, topId)
    return `${inf.name} cannot be combined with ${t.name}.`
  }
  return null
}

/** Normalize the project's railing selection; returns auto-fix messages. */
export function normalizeRailing(project: Project): string[] {
  const msgs: string[] = []
  const r = project.settings.railing
  const system = railSystemById(r.systemId) ?? RAILING_SYSTEMS[0]
  r.systemId = system.id

  if (!system.heightsIn.includes(r.heightIn)) r.heightIn = system.heightsIn[0] as 36 | 42

  let top = system.topStyles.find((t) => t.id === r.topStyleId)
  if (!top) {
    top = system.topStyles[0]
    r.topStyleId = top.id
  }
  if (top.drinkRail) {
    const blockers = drinkRailBlockers(project)
    if (blockers.length > 0) {
      const fallback = system.topStyles.find((t) => !t.drinkRail) ?? system.topStyles[0]
      msgs.push(`${blockers[0].reason} Switched to ${fallback.name}.`)
      r.topStyleId = fallback.id
      top = fallback
    }
  }

  const topColors = top.colors ?? system.colors
  if (!topColors.includes(r.colorId)) {
    if (system.colors.includes(r.colorId) && top.colors) {
      msgs.push(`${top.name} comes in ${top.colors.join(' / ')} only — switched to ${topColors[0]}.`)
    }
    r.colorId = topColors[0]
  }

  let inf = system.infills.find((i) => i.id === r.infillId)
  if (!inf) {
    inf = system.infills[0]
    r.infillId = inf.id
  }
  if (inf.incompatibleTops.includes(r.topStyleId)) {
    const fallback = system.infills.find((i) => !i.incompatibleTops.includes(r.topStyleId)) ?? system.infills[0]
    msgs.push(`${inf.name} cannot pair with ${top.name} — switched to ${fallback.name}.`)
    r.infillId = fallback.id
  }

  // post size option must belong to the system
  if (!system.postOptions.some((p) => p.id === r.postOptionId)) {
    r.postOptionId = system.postOptions[0].id
  }
  return msgs
}

/** Inches the post's outer face sits inside the deck edge for top-mounted railing. */
export const TOP_MOUNT_FACE_INSET_IN = 2
