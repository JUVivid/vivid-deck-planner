import { useState } from 'react'
import { setPage, updateQuote, useApp } from '../model/store'
import { useComputed } from './useComputed'
import type { QuoteSection } from '../engine/quote'

const money = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const qtyFmt = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 1 })

function Section({ section }: { section: QuoteSection }) {
  return (
    <section className={`q-card ${section.omitted ? 'omitted' : ''}`}>
      <div className="q-card-head">
        <div>
          <h2>{section.title}</h2>
          {section.qty !== null && !section.omitted && (
            <div className="q-card-qty">
              {qtyFmt(section.qty)} {section.unit}
            </div>
          )}
        </div>
        {section.omitted ? (
          <span className="q-badge muted">Not included</span>
        ) : (
          <div className="q-card-price">
            <div className={section.price === null ? 'pending' : ''}>
              {section.price === null ? 'Pricing to follow' : money(section.price)}
            </div>
            {section.price !== null && <span>installed</span>}
          </div>
        )}
      </div>
      <p className="q-blurb">{section.blurb}</p>
      {section.specs.length > 0 && (
        <dl className="q-specs">
          {section.specs.map((s) => (
            <div key={s.label + s.value}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {section.includes.length > 0 && (
        <ul className="q-includes">
          {section.includes.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function QuoteView() {
  const project = useApp((s) => s.project)
  const q = useApp((s) => s.project.settings.quote)
  const computed = useComputed()
  const quote = computed.quote
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  // company numbers are NEVER on screen by default — this page gets shown to
  // customers live, and reps don't get the breakdown either. Opening it takes
  // the manager password; the panel resets to hidden on every visit.
  // (SHA-256 of the password — the password itself is not in the bundle.)
  const INTERNAL_HASH = '873cfcae7849d1557eee7c9db749bd91a59b962af3450ed6948eabe948f6276a'
  const [showInternal, setShowInternal] = useState(false)
  const toggleInternal = async () => {
    if (showInternal) {
      setShowInternal(false)
      return
    }
    const pw = window.prompt('Manager password:')
    if (!pw) return
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex === INTERNAL_HASH) setShowInternal(true)
    else window.alert('Incorrect password.')
  }

  return (
    <div className="quote-page">
      {/* rep-only controls — never printed */}
      <div className="q-controls no-print">
        <button onClick={() => setPage('design')}>← Back to design</button>
        <label className="q-toggle">
          <input
            type="checkbox"
            checked={q.demo.enabled}
            onChange={(e) => updateQuote((c) => (c.demo.enabled = e.target.checked))}
          />
          Include demolition
        </label>
        {q.demo.enabled && (
          <label className="q-num">
            Existing structure
            <input
              type="number"
              min={0}
              value={q.demo.areaSqft || ''}
              placeholder="0"
              onChange={(e) => updateQuote((c) => (c.demo.areaSqft = Number(e.target.value) || 0))}
            />
            sq ft
          </label>
        )}
        <label className="q-toggle">
          <input
            type="checkbox"
            checked={q.lighting.enabled}
            onChange={(e) => updateQuote((c) => (c.lighting.enabled = e.target.checked))}
          />
          Include lighting
        </label>
        {q.lighting.enabled && (
          <label className="q-num">
            Fixtures
            <input
              type="number"
              min={0}
              value={q.lighting.fixtures || ''}
              placeholder="0"
              onChange={(e) => updateQuote((c) => (c.lighting.fixtures = Number(e.target.value) || 0))}
            />
          </label>
        )}
        <label className="q-toggle" title="Higher county sales tax (8.25%) + City of Charlotte zoning/tree/stormwater review">
          <input
            type="checkbox"
            checked={q.mecklenburg}
            onChange={(e) => updateQuote((c) => (c.mecklenburg = e.target.checked))}
          />
          Mecklenburg / Charlotte
        </label>
        <label className="q-num grow">
          Prepared for
          <input
            type="text"
            value={q.preparedFor}
            placeholder="Customer name"
            onChange={(e) => updateQuote((c) => (c.preparedFor = e.target.value))}
          />
        </label>
        <button title="Manager only — password required" onClick={() => void toggleInternal()}>
          {showInternal ? 'Hide internals' : 'Internals'}
        </button>
        <button className="primary" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      <div className="q-sheet">
        <header className="q-hero">
          <div className="q-hero-brand">
            <span className="q-mark">V</span>
            <div>
              <div className="q-co">Vivid Outdoor Living</div>
              <div className="q-co-sub">Custom Decks &amp; Outdoor Spaces · North Carolina</div>
            </div>
          </div>
          <div className="q-hero-meta">
            <div className="q-meta-row">
              <span>Prepared for</span>
              <strong>{q.preparedFor || '—'}</strong>
            </div>
            <div className="q-meta-row">
              <span>Project</span>
              <strong>{project.name}</strong>
            </div>
            <div className="q-meta-row">
              <span>Date</span>
              <strong>{today}</strong>
            </div>
          </div>
        </header>

        <div className="q-headline">
          <div className="q-headline-num">{Math.round(quote.areaSqft)}</div>
          <div className="q-headline-txt">
            <strong>square feet</strong>
            <span>of new outdoor living space</span>
          </div>
        </div>

        <div className="q-sections">
          {quote.sections.map((s) => (
            <Section key={s.id} section={s} />
          ))}
        </div>

        <section className="q-total-card">
          <h2>Your Investment</h2>
          <div className="q-total-rows">
            {quote.sections
              .filter((s) => !s.omitted && s.price !== null)
              .map((s) => (
                <div className="q-total-row" key={s.id}>
                  <span>{s.title}</span>
                  <b>{money(s.price)}</b>
                </div>
              ))}
            <div className="q-total-row grand">
              <span>Complete, turn-key</span>
              <b className={quote.total === null ? 'pending' : ''}>
                {quote.total === null ? 'Pricing to follow' : money(quote.total)}
              </b>
            </div>
          </div>
          <p className="q-included">
            Includes all materials, labour, permits and engineered drawings. No hidden extras.
          </p>
          {/* rep-only: the breakdown behind the number. Hidden by default so a
              customer looking at the screen never sees company numbers; never
              printed either way. */}
          {showInternal && (
          <div className="q-internal no-print">
            <div className="q-internal-title">Internal breakdown — not shown to the customer</div>
            <div className="q-internal-grid">
              <span>Labour</span>
              <b>{quote.internal.labor === null ? '—' : money(quote.internal.labor)}</b>
              <span>Material (incl. {quote.internal.wastePct}% waste)</span>
              <b>{money(quote.internal.materialCost)}</b>
              <span>Material tax @ {quote.internal.taxPct}%</span>
              <b>{money(quote.internal.materialTax)}</b>
              <span>Permit</span>
              <b>{money(quote.internal.permit)}</b>
              <span>Drawings</span>
              <b>{money(quote.internal.drawings)}</b>
              <span className="q-rule">Job cost</span>
              <b className="q-rule">{quote.internal.jobCost === null ? '—' : money(quote.internal.jobCost)}</b>
              <span>
                Gross profit @ {quote.internal.profitPct}% {quote.internal.profitIsMarkup ? 'markup' : 'margin'}
              </span>
              <b>{quote.internal.profit === null ? '—' : money(quote.internal.profit)}</b>
            </div>
            {quote.internal.estimatedMaterialLines > 0 && (
              <p className="q-note">
                {quote.internal.estimatedMaterialLines} material line
                {quote.internal.estimatedMaterialLines > 1 ? 's are' : ' is'} priced from RETAIL estimates (dearer than
                contractor cost) — replace with real supplier pricing when available.
              </p>
            )}
            {quote.internal.unpricedMaterialLines > 0 && (
              <p className="q-note">
                {quote.internal.unpricedMaterialLines} material line
                {quote.internal.unpricedMaterialLines > 1 ? 's have' : ' has'} no price in the book (railing, fasteners,
                hardware and tape are not on the current sheets) — the material figure is low by that amount.
              </p>
            )}
            {quote.pendingLines > 0 && (
              <p className="q-note">
                {quote.pendingLines} labour line{quote.pendingLines > 1 ? 's' : ''} awaiting a rate.
              </p>
            )}
            <table className="q-cat-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Material</th>
                  <th>Tax</th>
                  <th>Labour</th>
                  <th>Permits</th>
                  <th>Cost</th>
                  <th>Sell</th>
                </tr>
              </thead>
              <tbody>
                {quote.internal.byCategory
                  .filter((c) => c.material > 0 || (c.labor ?? 0) > 0 || c.jobCosts > 0)
                  .map((c) => (
                    <tr key={c.id}>
                      <td>{c.label}</td>
                      <td>{money(c.material)}</td>
                      <td>{money(c.tax)}</td>
                      <td>{c.labor === null ? '—' : money(c.labor)}</td>
                      <td>{c.jobCosts ? money(c.jobCosts) : '—'}</td>
                      <td>{c.cost === null ? '—' : money(c.cost)}</td>
                      <td>
                        <b>{c.sell === null ? '—' : money(c.sell)}</b>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="q-fine">Price book {quote.internal.priceBookDate}.</p>
          </div>
          )}
        </section>

        <footer className="q-footer">
          <p>
            Every deck we build is engineered to the 2021 IRC and inspected by your local building department. Substructure
            is pressure-treated and protected with joist tape at every framing member.
          </p>
          <p className="q-fine">
            This proposal is valid for 30 days. Final pricing is confirmed on site prior to contract. Colours shown are
            manufacturer names — physical samples available on request.
          </p>
        </footer>
      </div>
    </div>
  )
}
