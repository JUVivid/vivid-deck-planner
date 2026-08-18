import type { Project, Tier } from '../model/types'
import { CODE, ledgerFastenerSpacing, SPECIES_LABEL } from '../codes/tables'
import { ftIn } from '../ui/format'
import { deckingMaxSpacing, fastenerBlockReason, resolveDecking } from '../catalog/compat'
import { fastenerById, railSystemById } from '../catalog/timbertech'
import type { FramingResult } from './framing'
import type { DeckingResult } from './decking'
import type { RailingResult } from './railing'
import type { StairsCalc } from './stairs'

export type CheckLevel = 'pass' | 'info' | 'warn' | 'fail'

export interface Check {
  id: string
  level: CheckLevel
  title: string
  detail: string
  ref: string
  tierId?: string
}

export interface TierComputedParts {
  framing: FramingResult
  decking: DeckingResult
  railing: RailingResult
}

export function runCompliance(
  project: Project,
  byTier: Map<string, TierComputedParts>,
  stairs: StairsCalc[],
): Check[] {
  const checks: Check[] = []
  const push = (c: Check) => checks.push(c)

  for (const tier of project.tiers) {
    const parts = byTier.get(tier.id)
    if (!parts) continue
    const { framing, decking, railing } = parts
    const f = tier.framing
    const tid = tier.id
    const tn = tier.name

    // hard geometry errors first
    for (const e of framing.errors) {
      push({ id: `geo-${tid}`, level: 'fail', title: `${tn}: framing geometry`, detail: e, ref: '—', tierId: tid })
    }

    // joist span
    const span = framing.maxBackspan
    const allow = framing.allowableJoistSpan
    if (span > 0) {
      const okSpan = span <= allow + 0.02
      push({
        id: `joist-${tid}`,
        level: okSpan ? 'pass' : 'fail',
        title: `${tn}: joist span`,
        detail: okSpan
          ? `${f.joistSize} ${SPECIES_LABEL[f.species]} @ ${f.spacing}" oc spans ${ftIn(span)} (max ${ftIn(allow)}).`
          : `${f.joistSize} @ ${f.spacing}" oc spans ${ftIn(span)} but the table allows ${ftIn(allow)}. Use a deeper joist, tighter spacing, or add a beam.`,
        ref: 'IRC R507.6',
        tierId: tid,
      })
    }

    // cantilever
    if (framing.cantilever > 0.01 && framing.maxBackspan > 0) {
      const maxC = framing.maxBackspan / 4
      const okC = framing.cantilever <= maxC + 0.02
      push({
        id: `cant-${tid}`,
        level: okC ? 'pass' : 'fail',
        title: `${tn}: cantilever`,
        detail: okC
          ? `Joists cantilever ${ftIn(framing.cantilever)} past the beam (max ${ftIn(maxC)} = ¼ backspan).`
          : `Cantilever ${ftIn(framing.cantilever)} exceeds ¼ of the backspan (${ftIn(maxC)}).`,
        ref: 'IRC R507.6',
        tierId: tid,
      })
    }

    // per-joist overhang issues (irregular shapes)
    if (framing.overhangIssues.length > 0) {
      const worst = framing.overhangIssues.reduce((a, b) => (b.overhang > a.overhang ? b : a))
      push({
        id: `overhang-${tid}`,
        level: 'fail',
        title: `${tn}: unsupported joist overhang`,
        detail: `${framing.overhangIssues.length} joist(s) run up to ${ftIn(worst.overhang)} past their last support (allowed ${ftIn(worst.allowed)}). This shape needs an additional beam segment — check the framing layer.`,
        ref: 'IRC R507.6',
        tierId: tid,
      })
    }

    // beams
    for (let i = 0; i < framing.beams.length; i++) {
      const bm = framing.beams[i]
      const ok = bm.postSpacing <= bm.allowablePostSpacing + 0.02 && !bm.beyondTable
      push({
        id: `beam-${tid}-${i}`,
        level: ok ? 'pass' : bm.beyondTable ? 'warn' : 'fail',
        title: `${tn}: beam ${i + 1} (${f.beamPly}-ply ${f.beamSize})`,
        detail: bm.beyondTable
          ? `Joist span exceeds the beam table range — engineered design required.`
          : ok
            ? `Posts every ${ftIn(bm.postSpacing)} (max ${ftIn(bm.allowablePostSpacing)}).`
            : `Post spacing ${ftIn(bm.postSpacing)} exceeds ${ftIn(bm.allowablePostSpacing)} — add posts or upsize the beam.`,
        ref: 'IRC R507.5',
        tierId: tid,
      })
    }

    // posts
    if (framing.posts.length > 0) {
      const h = framing.postTopFt
      if (framing.postTooShort) {
        push({
          id: `postlow-${tid}`,
          level: 'fail',
          title: `${tn}: deck too low for drop beam`,
          detail: `Deck surface at ${ftIn(tier.height)} leaves no room under the joists for a drop beam. Switch the beam style to “flush”.`,
          ref: 'R507.5',
          tierId: tid,
        })
      } else {
        push({
          id: `post-${tid}`,
          level: h > CODE.maxPostHeightFt ? 'fail' : 'pass',
          title: `${tn}: posts`,
          detail:
            h > CODE.maxPostHeightFt
              ? `Post height ${ftIn(h)} exceeds the 14' prescriptive limit for 6x6 posts — engineered design required.`
              : `6x6 posts ≈ ${ftIn(h)} tall, set inside the deck frame (prescriptive limit 14').`,
          ref: 'IRC R507.4',
          tierId: tid,
        })
      }
      // lateral bracing
      if (framing.bracingRequired) {
        push({
          id: `brace-${tid}`,
          level: 'warn',
          title: `${tn}: lateral bracing required`,
          detail: `Posts ≈ ${ftIn(framing.postTopFt)} tall${framing.freestanding ? ' (freestanding)' : ''} — install diagonal knee bracing (${framing.braceCount} braces) between posts and beam, both directions.`,
          ref: 'IRC R507 / DCA 6',
          tierId: tid,
        })
      }
    }

    // footings
    const oversize = framing.footings.filter((x) => x.oversized)
    push({
      id: `foot-${tid}`,
      level: oversize.length > 0 ? 'warn' : 'info',
      title: `${tn}: footings`,
      detail:
        (oversize.length > 0
          ? `${oversize.length} footing(s) hit the 24" practical cap — verify bearing with an engineer. `
          : '') +
        `${framing.footings.length} footings, sized for ${project.settings.soilBearing} psf soil at ${project.settings.frostDepth}" frost depth (NC company standard). Verify locally if soil conditions look poor.`,
      ref: 'IRC R507.3',
      tierId: tid,
    })

    // decking vs joist spacing (per install guide; MAX boards allow 24"/16")
    const rd = resolveDecking(tier)
    const diag = tier.decking.angle === 45
    const maxSp = deckingMaxSpacing(rd.profile, diag)
    push({
      id: `dspace-${tid}`,
      level: f.spacing <= maxSp ? 'pass' : 'fail',
      title: `${tn}: decking support`,
      detail:
        f.spacing <= maxSp
          ? `${diag ? 'Diagonal' : 'Perpendicular'} ${rd.line.name} ${rd.profile.name} on ${f.spacing}" oc joists (max ${maxSp}"; 12" oc for commercial).`
          : `${diag ? 'Diagonal' : 'Perpendicular'} ${rd.line.name} ${rd.profile.name} needs joists at ${maxSp}" oc or tighter — currently ${f.spacing}".`,
      ref: 'TimberTech install guide',
      tierId: tid,
    })

    // gapping guidance (install guides)
    push({
      id: `gap-${tid}`,
      level: 'info',
      title: `${tn}: gapping`,
      detail:
        rd.line.material === 'composite'
          ? `Side gap ${rd.fastener.gapIn}" (min 1/8", max 3/16"). Butt/end joints by install temp: 3/16" ≤32°F · 1/8" 33–74°F · 1/32" ≥75°F. Leave 3/16" at structures & posts.`
          : `Side gap ${rd.fastener.gapIn}" (1/8"–1/4"). PVC butt joints install TIGHT (no gap); fasten ends within 1/2" with 2 screws. Prefer breaker boards over butt joints.`,
      ref: 'TimberTech install guide p.3–5',
      tierId: tid,
    })

    // catalog compatibility (guards against hand-edited/imported files)
    const fastSel = fastenerById(tier.decking.fastenerId)
    if (fastSel) {
      const reason = fastenerBlockReason(rd.line, rd.profile, fastSel)
      push({
        id: `fast-${tid}`,
        level: reason ? 'fail' : 'pass',
        title: `${tn}: fastening system`,
        detail: reason ?? `${fastSel.name} with ${rd.line.name} ${rd.profile.name} — ${fastSel.gapIn}" gap, ${fastSel.perCrossing}/board/joist.`,
        ref: 'TimberTech guide p.16–19',
        tierId: tid,
      })
    }

    if (!decking.boardDirOk) {
      push({
        id: `ddir-${tid}`,
        level: 'fail',
        title: `${tn}: board direction`,
        detail: 'Deck boards run parallel to the joists and have nothing to fasten to. Rotate the boards or the joists 90°.',
        ref: '—',
        tierId: tid,
      })
    }

    if (decking.insetFailed) {
      push({
        id: `pf-${tid}`,
        level: 'warn',
        title: `${tn}: picture frame`,
        detail: 'The outline is too tight or irregular for the picture-frame inset — frame boards were skipped where the offset failed.',
        ref: '—',
        tierId: tid,
      })
    }

    const stocksInUse = tier.decking.stockLengths.length > 0 ? tier.decking.stockLengths : rd.profile.lengthsFt
    const maxStock = Math.max(...stocksInUse)
    if (decking.maxSegLen > maxStock + 0.01) {
      push({
        id: `stock-${tid}`,
        level: 'warn',
        title: `${tn}: board length`,
        detail: `Longest field board is ${ftIn(decking.maxSegLen)} but the longest ${rd.line.name} stock in use is ${maxStock}'. Enable breaker boards or add a longer stock length.`,
        ref: '—',
        tierId: tid,
      })
    }

    // guards
    const needGuard = tier.height * 12 > CODE.guardTriggerIn
    const railHeight = project.settings.railing.heightIn
    if (needGuard) {
      const missing: number[] = []
      for (let i = 0; i < tier.outline.length; i++) {
        const e = tier.edges[i]
        if (!e || e.ledger) continue
        if (!e.railing) {
          // an edge that borders a higher/equal tier does not need a guard; approximate by checking stairs landings too
          missing.push(i)
        }
      }
      push({
        id: `guard-${tid}`,
        level: missing.length > 0 ? 'fail' : 'pass',
        title: `${tn}: guards`,
        detail:
          missing.length > 0
            ? `Deck is ${ftIn(tier.height)} above grade (>30") — edge${missing.length > 1 ? 's' : ''} ${missing.map((i) => i + 1).join(', ')} need${missing.length > 1 ? '' : 's'} a ${railHeight}" guard (or must border another structure).`
            : `Deck is ${ftIn(tier.height)} above grade; ${railHeight}" guards present on all open edges (min ${CODE.guardMinIn}", 4" sphere rule).`,
        ref: 'IRC R312',
        tierId: tid,
      })
    }
    if (railing.balusters > 0) {
      push({
        id: `bal-${tid}`,
        level: 'info',
        title: `${tn}: guard infill`,
        detail: `Baluster spacing must reject a 4" sphere; count assumes 2x2 balusters at ~3.9" clear.`,
        ref: 'IRC R312.1.3',
        tierId: tid,
      })
    }

    // ledger
    if (!framing.freestanding) {
      const spacing = ledgerFastenerSpacing(project.settings.ledgerFastener, framing.maxBackspan + framing.cantilever)
      push({
        id: `ledger-${tid}`,
        level: 'info',
        title: `${tn}: ledger attachment`,
        detail: `1/2" ${project.settings.ledgerFastener === 'lag' ? 'lag screws' : 'through-bolts'} @ ${spacing}" oc, staggered in 2 rows, into the band joist. Flash the ledger; install 2+ lateral-load connectors (DTT2Z or equal). Never attach to brick veneer or cantilevered floors.`,
        ref: 'IRC R507.9',
        tierId: tid,
      })
    } else {
      push({
        id: `free-${tid}`,
        level: 'info',
        title: `${tn}: freestanding deck`,
        detail: 'No ledger — deck is self-supporting. Provide diagonal knee bracing at posts (or engineered lateral design) and verify footing uplift.',
        ref: 'IRC R507.4',
        tierId: tid,
      })
    }

    for (const note of framing.notes) {
      push({ id: `note-${tid}-${note.slice(0, 12)}`, level: 'warn', title: `${tn}: framing`, detail: note, ref: '—', tierId: tid })
    }

    // cable railing: special install & ordering rules
    if (railing.totalLf > 0.5) {
      const system = railSystemById(project.settings.railing.systemId)
      const inf = system?.infills.find((i) => i.id === project.settings.railing.infillId)
      if (inf?.cable) {
        push({
          id: `cable-${tid}`,
          level: 'info',
          title: `${tn}: ${inf.name} — special installation`,
          detail: inf.cable.note,
          ref: 'TimberTech cable install guide',
          tierId: tid,
        })
        if (inf.cable.ordering === 'per-run' && inf.cable.maxRunFt) {
          const long = railing.chains.filter((c) => c.lenFt > inf.cable!.maxRunFt!)
          if (long.length > 0) {
            push({
              id: `cable-run-${tid}`,
              level: 'warn',
              title: `${tn}: cable run over ${inf.cable.maxRunFt}'`,
              detail: `${long.length} railing run(s) exceed ${inf.cable.maxRunFt}' — an extra END post splits each into separate tensioned runs (already reflected in the material list).`,
              ref: 'IRX horizontal cable guide',
              tierId: tid,
            })
          }
        }
        push({
          id: `cable-4in-${tid}`,
          level: 'info',
          title: `${tn}: cable tension & 4" sphere`,
          detail: 'Cables must be tensioned so a 4" sphere cannot pass under load — verify tension at final inspection and re-tension after first season.',
          ref: 'IRC R312.1.3',
          tierId: tid,
        })
      }
    }
  }

  // stairs
  for (const sc of stairs) {
    const tn = sc.tier.name
    const sid = sc.stairs.id
    for (const e of sc.errors) {
      push({ id: `st-err-${sid}`, level: 'fail', title: `${tn}: stairs`, detail: e, ref: '—', tierId: sc.tier.id })
    }
    if (!sc.ok) continue
    const treadOk = sc.riserIn <= CODE.maxRiserIn + 0.001 && sc.treadIn >= CODE.minTreadIn - 0.001
    push({
      id: `st-riser-${sid}`,
      level: treadOk ? 'pass' : 'fail',
      title: `${tn}: stair rise/run`,
      detail: `${sc.riserCount} risers @ ${sc.riserIn.toFixed(2)}" (max 7¾"), ${sc.treadCount} treads @ ${sc.treadIn.toFixed(2)}" (min 10"). Total run ${ftIn(sc.totalRunFt)}.`,
      ref: 'IRC R311.7.5',
      tierId: sc.tier.id,
    })
    // the decking sets the tread depth — say which layout covers it
    const rippedTread = sc.treadBoards.find((b) => b.ripped)
    push({
      id: `st-tread-boards-${sid}`,
      level: 'info',
      title: `${tn}: tread covering`,
      detail:
        `${sc.treadBoards.length} deck boards cover each ${sc.treadIn.toFixed(2)}" tread with a ${sc.noseIn}" nosing (3/4"–1-1/4")` +
        (rippedTread ? ` — back board ripped to ${rippedTread.widthIn}".` : ' — all full-width boards, no rip.'),
      ref: 'IRC R311.7.5.3',
      tierId: sc.tier.id,
    })
    push({
      id: `st-width-${sid}`,
      level: sc.widthIn >= CODE.minStairWidthIn ? 'pass' : 'fail',
      title: `${tn}: stair width`,
      detail:
        sc.widthIn >= CODE.minStairWidthIn
          ? `Stair width ${sc.widthIn}" (min 36").`
          : `Stair width ${sc.widthIn}" is below the 36" minimum.`,
      ref: 'IRC R311.7.1',
      tierId: sc.tier.id,
    })
    if (sc.throatIn < CODE.minThroatIn) {
      push({
        id: `st-throat-${sid}`,
        level: 'warn',
        title: `${tn}: stringer throat`,
        detail: `Cut 2x12 stringers leave only ${sc.throatIn.toFixed(1)}" of material (<5"). Use solid stringers with cleats, LSL stock, or reduce riser height.`,
        ref: 'DCA 6',
        tierId: sc.tier.id,
      })
    }
    if (sc.stringerLenFt - 1 > CODE.maxStringerSpanFt + 3) {
      push({
        id: `st-span-${sid}`,
        level: 'warn',
        title: `${tn}: stringer span`,
        detail: `Stringers run ${ftIn(sc.stringerLenFt - 1)} — cut stringers should be braced or supported mid-span beyond ~6' horizontal.`,
        ref: 'DCA 6',
        tierId: sc.tier.id,
      })
    }
    if (sc.guardRequired) {
      push({
        id: `st-hand-${sid}`,
        level: 'info',
        title: `${tn}: stair handrail & guard`,
        detail: `${sc.riserCount} risers (≥4) — graspable handrail 34–38" above nosings on at least one side; open sides need a 36" (min 34") guard.`,
        ref: 'IRC R311.7.8 / R312',
        tierId: sc.tier.id,
      })
    }
    push({
      id: `st-land-${sid}`,
      level: 'info',
      title: `${tn}: stair landing`,
      detail: `Provide a 36"-deep landing at the bottom (${sc.landingLabel}); concrete pad or pavers recommended, sloped away.`,
      ref: 'IRC R311.7.6',
      tierId: sc.tier.id,
    })
    push({
      id: `st-frame-${sid}`,
      level: 'info',
      title: `${tn}: stair framing & finish`,
      detail: `${sc.stringerCount} stringers @ 12" oc (scales with the ${sc.widthIn}" width). Treads picture-framed with 45° mitred nose & side boards so no board ends show; TimberTech riser boards close each riser.`,
      ref: 'TimberTech stair guide',
      tierId: sc.tier.id,
    })
  }

  const order: Record<CheckLevel, number> = { fail: 0, warn: 1, info: 2, pass: 3 }
  checks.sort((a, b) => order[a.level] - order[b.level])
  return checks
}
