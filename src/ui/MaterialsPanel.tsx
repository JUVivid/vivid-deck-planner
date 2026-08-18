import { useApp } from '../model/store'
import { bomToCsv, type LumberPlan } from '../engine'
import { DISCLAIMER } from '../codes/tables'
import { download, orderCsvFilename } from './download'
import { fmtQty, ftIn } from './format'
import { useComputed } from './useComputed'

/** collapse identical boards (same stock + same cuts) into one cut-list row */
function groupBoards(p: LumberPlan) {
  type Board = LumberPlan['boards'][number]
  const map = new Map<string, { stockFt: number; cuts: Board['cuts']; offcutFt: number; count: number }>()
  for (const b of p.boards) {
    const key = `${b.stockFt}|${b.cuts.map((c) => `${Math.round(c.lenFt * 100)}~${c.label}`).join(',')}`
    const ex = map.get(key)
    if (ex) ex.count++
    else map.set(key, { stockFt: b.stockFt, cuts: b.cuts, offcutFt: b.offcutFt, count: 1 })
  }
  return [...map.values()].sort((a, b) => b.stockFt - a.stockFt || b.count - a.count)
}

export function MaterialsPanel() {
  const project = useApp((s) => s.project)
  const computed = useComputed()
  const { bom, cutPlans, totals } = computed

  const sections = [...new Set(bom.map((l) => l.section))]

  // creates a real .csv file in Downloads (clipboard copy stays as a fallback)
  const downloadCsv = () => download(orderCsvFilename(project.name), bomToCsv(bom, project.name, cutPlans), 'text/csv')
  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(bomToCsv(bom, project.name, cutPlans))
    } catch {
      /* clipboard unavailable — the download button is the primary path */
    }
  }

  return (
    <div className="materials">
      <div className="totals-row">
        <div className="total-card">
          <div className="total-num">{Math.round(totals.areaSqft)}</div>
          <div className="total-label">sq ft deck</div>
        </div>
        <div className="total-card">
          <div className="total-num">{totals.posts}</div>
          <div className="total-label">posts</div>
        </div>
        <div className="total-card">
          <div className="total-num">{totals.footings}</div>
          <div className="total-label">footings</div>
        </div>
        <div className="total-card">
          <div className="total-num">{bom.length}</div>
          <div className="total-label">line items</div>
        </div>
      </div>

      <div className="btn-row">
        <button className="primary" onClick={downloadCsv}>
          Download order (.csv)
        </button>
        <button onClick={copyCsv} title="Copy the CSV text to the clipboard instead of saving a file">
          Copy
        </button>
      </div>

      {sections.map((sec) => (
        <div key={sec} className="bom-section">
          <h3>{sec.replace(/^\d+ — /, '')}</h3>
          <table className="bom-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Detail</th>
                <th className="num">Qty</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {bom
                .filter((l) => l.section === sec)
                .map((l, i) => (
                  <tr key={i}>
                    <td>{l.item}</td>
                    <td className="detail">
                      {l.detail}
                      {l.note ? <span className="note"> {l.note}</span> : null}
                    </td>
                    <td className="num">{fmtQty(l.qty)}</td>
                    <td>{l.unit}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}

      {cutPlans.length > 0 && (
        <div className="bom-section">
          <h3>Lumber Cut Plan</h3>
          <table className="bom-table">
            <thead>
              <tr>
                <th>Board</th>
                <th>Cuts</th>
                <th className="num">Offcut</th>
              </tr>
            </thead>
            <tbody>
              {cutPlans.flatMap((p) =>
                groupBoards(p).map((g, i) => (
                  <tr key={`${p.section}|${p.size}|${i}`}>
                    <td>
                      {g.count} × {p.size}-{g.stockFt}'
                    </td>
                    <td className="detail">{g.cuts.map((c) => `${ftIn(c.lenFt)} ${c.label}`).join(' + ')}</td>
                    <td className="num">{g.offcutFt > 0.05 ? ftIn(g.offcutFt) : '—'}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <div className="field-hint">
            Each row is one saw setup. Order quantities above add the company waste allowance on top of these boards.
          </div>
        </div>
      )}

      <p className="disclaimer">
        Quantities include the company 10% waste allowance (railing systems and framing hardware are ordered to exact
        count). {DISCLAIMER}
      </p>
    </div>
  )
}
