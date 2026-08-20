import {
  addBreaker,
  deleteStairs,
  deleteTier,
  removeBreaker,
  moveBreaker,
  setSelection,
  updateSettings,
  updateStairs,
  updateTier,
  useApp,
} from '../model/store'
import type { BeamPly, DeckingAngle, JoistSpacing, LumberSize, Species, Tier } from '../model/types'
import { SPECIES_LABEL } from '../codes/tables'
import {
  DECKING_LINES,
  FASTENERS,
  RAILING_SYSTEMS,
  profileColors,
  railSystemById,
} from '../catalog/timbertech'
import {
  WIDE_PF_WIDTH_IN,
  fasciaColors,
  fastenerBlockReason,
  infillBlockReason,
  pfProfileOptions,
  resolveDecking,
  topStyleBlockReason,
  widePfLineNames,
} from '../catalog/compat'
import { dist } from '../geometry/geom'
import { ftIn, ftInlabel } from './format'
import { Field, LenInput, Row, Section } from './inputs'
import { useComputed } from './useComputed'

/**
 * Accent color picker (picture frame / breaker / fascia). Options come from
 * THIS collection only — families never mix on one deck, so picking from a
 * different line is impossible by construction. Empty = match the decking.
 */
function AccentColorSelect({
  label,
  value,
  palette,
  fieldColor,
  onChange,
}: {
  label: string
  value: string | null
  palette: string[]
  fieldColor: string
  onChange: (v: string | null) => void
}) {
  return (
    <Field label={label} hint="same collection as the decking">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">Match decking ({fieldColor})</option>
        {palette
          .filter((c) => c !== fieldColor)
          .map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
      </select>
    </Field>
  )
}

export function PropertiesPanel() {
  const selection = useApp((s) => s.selection)
  const project = useApp((s) => s.project)
  const activeTierId = useApp((s) => s.activeTierId)
  const tier = project.tiers.find(
    (t) => t.id === (selection.kind === 'edge' || selection.kind === 'vertex' || selection.kind === 'tier' ? selection.tierId : activeTierId),
  )

  if (selection.kind === 'stairs') {
    return <StairsProps stairsId={selection.stairsId} />
  }
  if (selection.kind === 'edge' && tier) {
    return <EdgeProps tier={tier} index={selection.index} />
  }
  if (!tier) {
    return (
      <div className="empty-note">
        <p>No deck yet.</p>
        <p>
          Pick the <b>Draw</b> tool and click on the canvas to outline your deck. Type a length like <code>12'6</code>{' '}
          and press Enter for exact segments.
        </p>
      </div>
    )
  }
  return <TierProps tier={tier} />
}

function EdgeProps({ tier, index }: { tier: Tier; index: number }) {
  const a = tier.outline[index]
  const b = tier.outline[(index + 1) % tier.outline.length]
  const e = tier.edges[index]
  const set = (fn: (x: typeof e) => void) =>
    updateTier(tier.id, (t) => {
      fn(t.edges[index])
    })
  return (
    <>
      <Section title={`Edge ${index + 1} of ${tier.name}`}>
        <div className="stat-line">Length: {ftIn(dist(a, b))}</div>
        <label className="check">
          <input
            type="checkbox"
            checked={e.ledger}
            onChange={(ev) =>
              updateTier(tier.id, (t) => {
                t.edges[index].ledger = ev.target.checked
                if (ev.target.checked) {
                  t.edges[index].railing = false
                  t.edges[index].fascia = false // no fascia against the house
                  // point joists away from the house wall
                  const dx = Math.abs(b.x - a.x)
                  const dy = Math.abs(b.y - a.y)
                  t.framing.joistDir = dx >= dy ? 90 : 0
                } else {
                  t.edges[index].fascia = true
                }
              })
            }
          />
          <span>
            <b>Ledger (house wall)</b> — deck attaches to the structure here
          </span>
        </label>
        <label className="check">
          <input type="checkbox" checked={e.railing} disabled={e.ledger} onChange={(ev) => set((x) => (x.railing = ev.target.checked))} />
          <span>Railing / guard on this edge</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={e.fascia} disabled={e.ledger} onChange={(ev) => set((x) => (x.fascia = ev.target.checked))} />
          <span>Fascia wrap on this edge</span>
        </label>
        <div className="btn-row">
          <button
            onClick={() =>
              updateTier(tier.id, (t) => {
                for (const edge of t.edges) if (!edge.ledger) edge.railing = true
              })
            }
          >
            Rail all edges
          </button>
          <button onClick={() => setSelection({ kind: 'tier', tierId: tier.id })}>Back to tier</button>
        </div>
      </Section>
    </>
  )
}

function StairsProps({ stairsId }: { stairsId: string }) {
  const project = useApp((s) => s.project)
  const computed = useComputed()
  const st = project.stairs.find((x) => x.id === stairsId)
  const calc = computed.stairs.find((x) => x.stairs.id === stairsId)
  if (!st) return <div className="empty-note">Stairs not found.</div>
  const tier = project.tiers.find((t) => t.id === st.tierId)
  return (
    <Section title={`Stairs on ${tier?.name ?? '?'}`}>
      <Row>
        <Field label="Width">
          <LenInput value={st.width} min={2} max={12} onCommit={(v) => updateStairs(stairsId, (x) => (x.width = v))} />
        </Field>
        <Field label="Lands on">
          <select
            value={st.landing.kind === 'grade' ? 'grade' : st.landing.tierId}
            onChange={(e) =>
              updateStairs(stairsId, (x) => {
                x.landing = e.target.value === 'grade' ? { kind: 'grade' } : { kind: 'tier', tierId: e.target.value }
              })
            }
          >
            <option value="grade">Grade (ground)</option>
            {project.tiers
              .filter((t) => t.id !== st.tierId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({ftInlabel(t.height)})
                </option>
              ))}
          </select>
        </Field>
      </Row>
      <div className="hint-line">
        Drag the steps anywhere around the deck — slide them across a corner and they wrap it (≤ 30″ rise).
      </div>
      {calc?.wrapNote && <div className="hint-line">{calc.wrapNote}</div>}
      {!calc?.wrapped && (
        <Field label="Position along edge">
          <input
            type="range"
            min={0.05}
            max={0.95}
            step={0.01}
            value={st.t}
            onChange={(e) => updateStairs(stairsId, (x) => (x.t = parseFloat(e.target.value)))}
          />
        </Field>
      )}
      {calc && calc.ok && (
        <div className="calc-card">
          <div>
            <b>{calc.riserCount}</b> risers @ <b>{calc.riserIn.toFixed(2)}"</b>
          </div>
          <div>
            {calc.treadCount} treads @ {calc.treadIn}" · run {ftIn(calc.totalRunFt)}
          </div>
          <div>
            {calc.wrapped
              ? `wraps ${calc.wrapCorners} corner${calc.wrapCorners > 1 ? 's' : ''} · ${calc.stringerCount}× short stringers + mitred hip${calc.wrapCorners > 1 ? 's' : ''}`
              : `${calc.stringerCount}× 2x12 stringers ≈ ${ftInlabel(calc.stringerLenFt)}`}
          </div>
          <div>
            Total rise {ftIn(calc.rise)} to {calc.landingLabel} · {Math.round(calc.finishSqft * 10) / 10} sq ft finished
          </div>
          {calc.midSupports.length > 0 && (
            <div>
              mid-span girder on 6x6 posts @ {calc.midSupports.map((m) => ftIn(m.xFt)).join(' / ')} out — stringers
              over the 6' span limit
            </div>
          )}
        </div>
      )}
      {calc && !calc.ok && calc.errors.map((e, i) => <div key={i} className="error-card">{e}</div>)}
      <div className="btn-row">
        <button className="danger" onClick={() => deleteStairs(stairsId)}>
          Delete stairs
        </button>
      </div>
    </Section>
  )
}

function TierProps({ tier }: { tier: Tier }) {
  const project = useApp((s) => s.project)
  const set = (fn: (t: Tier) => void) => updateTier(tier.id, fn)
  const f = tier.framing
  const d = tier.decking
  return (
    <>
      <Section title="Tier">
        <Row>
          <Field label="Name">
            <input value={tier.name} onChange={(e) => set((t) => (t.name = e.target.value))} />
          </Field>
          <Field label="Height above grade" hint="top of decking">
            <LenInput value={tier.height} min={0.5} max={16} onCommit={(v) => set((t) => (t.height = v))} />
          </Field>
        </Row>
        <div className="hint-line">
          Select an edge on the canvas to mark the <b>house side (ledger)</b>, railing and fascia.
        </div>
      </Section>

      <Section title="Framing — automatic">
        <div className="auto-frame">
          <div className="auto-frame-row">
            <span>Structure</span>
            <b>
              SYP #1 · {f.joistSize} joists @ {f.spacing}" oc, {f.joistDir === 90 ? 'N–S' : 'E–W'}
            </b>
          </div>
          <div className="auto-frame-row">
            <span>Girder</span>
            <b>
              ({f.beamPly}) {f.beamSize} {f.beamStyle === 'flush' ? 'flush-set' : 'drop'} girder on 6x6 posts
            </b>
          </div>
          <div className="auto-frame-row">
            <span>Ledger</span>
            <b>LedgerLOK 1/2" lags · flashed & taped</b>
          </div>
        </div>
        <Row>
          <Field label="Cantilever" hint="none = girder sets flush in the rim (saves lumber)">
            <select
              value={f.cantilever}
              onChange={(e) => set((t) => (t.framing.cantilever = parseInt(e.target.value)))}
            >
              <option value={0}>None — flush girder</option>
              <option value={1}>1' overhang</option>
              <option value={2}>2' overhang</option>
              <option value={3}>3' overhang</option>
            </select>
          </Field>
        </Row>
        <div className="hint-line">
          Sized to the 2021 IRC automatically — beams, posts and footings adjust as you draw. NC site standards: 12"
          frost depth, 1500 psf soil bearing.
        </div>
      </Section>

      <DeckingSection tier={tier} />
      <RailingSection />

      <div className="btn-row">
        <button className="danger" onClick={() => deleteTier(tier.id)}>
          Delete this tier
        </button>
      </div>
    </>
  )
}

function gapLabel(gapIn: number): string {
  const frac: Record<string, string> = { '0.0625': '1/16"', '0.125': '1/8"', '0.1875': '3/16"', '0.21875': '7/32"', '0.25': '1/4"' }
  return frac[String(gapIn)] ?? `${gapIn}"`
}

function DeckingSection({ tier }: { tier: Tier }) {
  const set = (fn: (t: Tier) => void) => updateTier(tier.id, fn)
  const computed = useComputed()
  const dkParts = computed.byTier.get(tier.id)?.decking
  const d = tier.decking
  const { line, profile, pfProfile, fastener, color } = resolveDecking(tier)
  const colors = profileColors(line, profile)
  const isPorch = line.material === 'porch'
  const stations = d.breakerStations ?? []

  return (
    <Section title="Decking — TimberTech 2026">
      <Row>
        <Field label="Collection">
          <select
            value={line.id}
            onChange={(e) =>
              set((t) => {
                t.decking.lineId = e.target.value
              })
            }
          >
            <optgroup label="Advanced PVC">
              {DECKING_LINES.filter((l) => l.material === 'pvc').map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Composite">
              {DECKING_LINES.filter((l) => l.material === 'composite').map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Porch">
              {DECKING_LINES.filter((l) => l.material === 'porch').map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field label="Color">
          <select
            value={tier.decking.colorId}
            onChange={(e) =>
              set((t) => {
                t.decking.colorId = e.target.value
              })
            }
          >
            {colors.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </Row>
      <div className="hint-line">
        {line.tagline} · {line.warranty}
        {line.scalloped ? ' · scalloped profile' : ''}
      </div>
      <Row>
        <Field label="Board profile" hint={`${profile.widthIn}" wide × ${profile.thickIn}" thick`}>
          <select
            value={profile.id}
            onChange={(e) =>
              set((t) => {
                t.decking.profileId = e.target.value
                t.decking.stockLengths = []
              })
            }
          >
            {line.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </Row>
      <Field label="Fastening system" hint={`sets a ${gapLabel(fastener.gapIn)} board gap`}>
        <select
          value={fastener.id}
          onChange={(e) =>
            set((t) => {
              t.decking.fastenerId = e.target.value
            })
          }
        >
          {FASTENERS.map((fs) => {
            const reason = fastenerBlockReason(line, profile, fs)
            return (
              <option key={fs.id} value={fs.id} disabled={!!reason} title={reason ?? fs.description}>
                {fs.name}
                {reason ? ' — n/a' : ''}
              </option>
            )
          })}
        </select>
      </Field>
      <div className="hint-line">{fastener.description}</div>
      <Row>
        <Field label="Direction">
          <select value={d.angle} onChange={(e) => set((t) => (t.decking.angle = parseInt(e.target.value) as DeckingAngle))}>
            <option value={0}>East–West</option>
            <option value={90}>North–South</option>
            <option value={45}>Diagonal 45°</option>
          </select>
        </Field>
        <Field label="Picture frame">
          <select
            value={d.pictureFrame}
            disabled={isPorch}
            onChange={(e) => set((t) => (t.decking.pictureFrame = parseInt(e.target.value) as 0 | 1 | 2))}
          >
            <option value={0}>None</option>
            <option value={1}>Single border</option>
            <option value={2}>Double border</option>
          </select>
        </Field>
        <Field label="Breaker boards">
          <select value={d.breakers} disabled={isPorch} onChange={(e) => set((t) => (t.decking.breakers = e.target.value as 'none' | 'auto'))}>
            <option value="auto">Auto (at stock limit)</option>
            <option value="none">None (manual only)</option>
          </select>
        </Field>
      </Row>
      {d.pictureFrame > 0 && !isPorch && (
        <>
          <Row>
            <Field
              label="Picture frame board"
              hint={`border ${ftIn((d.pictureFrame * (pfProfile.widthIn + fastener.gapIn)) / 12)} wide${d.pictureFrame === 2 ? ' (2 boards)' : ''}`}
            >
              <select
                value={d.pfProfileId ?? ''}
                onChange={(e) =>
                  set((t) => {
                    t.decking.pfProfileId = e.target.value === '' ? null : e.target.value
                  })
                }
              >
                <option value="">Match field boards ({profile.widthIn}")</option>
                {pfProfileOptions(line)
                  .filter((p) => p.id !== profile.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                {!line.profiles.some((p) => p.widthIn >= WIDE_PF_WIDTH_IN) && (
                  <option value="" disabled>
                    1x8 Wide (7-1/4") — n/a in {line.name}
                  </option>
                )}
              </select>
            </Field>
            <AccentColorSelect
              label="Picture frame color"
              value={d.pfColorId}
              palette={profileColors(line, pfProfile)}
              fieldColor={color}
              onChange={(v) => set((t) => (t.decking.pfColorId = v))}
            />
          </Row>
          {!line.profiles.some((p) => p.widthIn >= WIDE_PF_WIDTH_IN) && (
            <div className="hint-line">
              A 7-1/4" border board is offered in {widePfLineNames().join(' / ')} — or use a double border to widen it here.
            </div>
          )}
        </>
      )}
      {!isPorch && (
        <div className="breaker-box">
          {(d.breakers === 'auto' || stations.length > 0) && (
            <Row>
              <AccentColorSelect
                label="Breaker board color"
                value={d.breakerColorId}
                palette={colors}
                fieldColor={color}
                onChange={(v) => set((t) => (t.decking.breakerColorId = v))}
              />
            </Row>
          )}
          <div className="btn-row">
            <button
              disabled={!dkParts?.breakersAllowed}
              title={dkParts?.breakersAllowed ? 'Adds a breaker board at the center; drag it on the canvas to reposition' : 'Breaker boards need boards running perpendicular to the joists'}
              onClick={() => addBreaker(tier.id)}
            >
              + Add breaker board
            </button>
            <span className="field-hint">{stations.length} manual · drag on canvas</span>
          </div>
          {stations.map((t, i) => (
            <div key={i} className="breaker-row">
              <span className="field-hint">#{i + 1}</span>
              <input
                type="range"
                min={0.03}
                max={0.97}
                step={0.01}
                value={t}
                onChange={(e) => moveBreaker(tier.id, i, parseFloat(e.target.value))}
              />
              <button className="mini danger" title="Remove" onClick={() => removeBreaker(tier.id, i)}>
                ✕
              </button>
            </div>
          ))}
          {!dkParts?.breakersAllowed && stations.length > 0 && (
            <div className="field-hint">Breaker boards apply when decking runs perpendicular to the joists.</div>
          )}
        </div>
      )}
      {line.fascia && (
        <Row>
          <AccentColorSelect
            label="Fascia color"
            value={d.fasciaColorId}
            palette={fasciaColors(line)}
            fieldColor={color}
            onChange={(v) => set((t) => (t.decking.fasciaColorId = v))}
          />
        </Row>
      )}
      <div className="field-hint">
        Orders from manufacturer lengths: {profile.lengthsFt.map((L) => `${L}'`).join(' / ')} · company waste allowance
        applied automatically
      </div>
      {line.notes.length > 0 && <div className="hint-line">{line.notes.join(' ')}</div>}
    </Section>
  )
}

function RailingSection() {
  const project = useApp((s) => s.project)
  const r = project.settings.railing
  const system = railSystemById(r.systemId) ?? RAILING_SYSTEMS[0]
  const top = system.topStyles.find((t) => t.id === r.topStyleId) ?? system.topStyles[0]
  const topColors = top.colors ?? system.colors

  return (
    <Section title="Railing system — project-wide">
      <Row>
        <Field label="System" hint={`${system.material} · ${system.warranty}`}>
          <select value={system.id} onChange={(e) => updateSettings((s) => (s.railing.systemId = e.target.value))}>
            {RAILING_SYSTEMS.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.name} ({sys.material})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Color">
          <select value={r.colorId} onChange={(e) => updateSettings((s) => (s.railing.colorId = e.target.value))}>
            {topColors.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Height">
          <select value={r.heightIn} onChange={(e) => updateSettings((s) => (s.railing.heightIn = parseInt(e.target.value) as 36 | 42))}>
            {system.heightsIn.map((h) => (
              <option key={h} value={h}>
                {h}"
              </option>
            ))}
          </select>
        </Field>
      </Row>
      <Field label="Top rail">
        <select value={top.id} onChange={(e) => updateSettings((s) => (s.railing.topStyleId = e.target.value))}>
          {system.topStyles.map((t) => {
            const reason = topStyleBlockReason(project, system, t)
            return (
              <option key={t.id} value={t.id} disabled={!!reason} title={reason ?? t.profile}>
                {t.name} — {t.profile}
                {reason ? ' (n/a)' : ''}
              </option>
            )
          })}
        </select>
      </Field>
      <Field label="Infill">
        <select value={r.infillId} onChange={(e) => updateSettings((s) => (s.railing.infillId = e.target.value))}>
          {system.infills.map((i) => {
            const reason = infillBlockReason(system, r.topStyleId, i)
            return (
              <option key={i.id} value={i.id} disabled={!!reason} title={reason ?? i.note ?? ''}>
                {i.name}
                {reason ? ' (n/a)' : ''}
              </option>
            )
          })}
        </select>
      </Field>
      {system.postOptions.length > 1 && (
        <Field
          label={system.compositeSteelPosts ? 'End/corner post size' : 'Post size'}
          hint={system.compositeSteelPosts ? 'interior posts are steel surface-mount' : undefined}
        >
          <select value={r.postOptionId ?? system.postOptions[0].id} onChange={(e) => updateSettings((s) => (s.railing.postOptionId = e.target.value))}>
            {system.postOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {system.postAccessory && !system.postAccessory.integral && (
        <Field label="Post cap & skirt" hint={system.postAccessory.skirt ? 'cap on top, skirt ring at the base — every post' : undefined}>
          <select
            value={r.postCapId ?? system.postAccessory.caps[0]?.id}
            onChange={(e) => updateSettings((s) => (s.railing.postCapId = e.target.value))}
          >
            {system.postAccessory.caps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {system.postAccessory!.skirt ? ' + skirt' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {system.postAccessory?.integral && (
        <div className="hint-line">Every post kit includes its cap and skirt — nothing extra to order.</div>
      )}
      <div className="hint-line">
        Top-mounted, posts set ~2" inside the deck edge. Sections {system.sectionsFt.map((s) => `${s}'`).join(' / ')} cut to even bays.{' '}
        {system.compositeSteelPosts ? 'Interior posts: steel surface-mount (no 4x4 wood). ' : ''}
        {system.notes[0] ?? ''}
      </div>
    </Section>
  )
}
