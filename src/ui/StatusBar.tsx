import { setSnap, useApp } from '../model/store'

export function StatusBar() {
  const snapIn = useApp((s) => s.snapIn)
  const msg = useApp((s) => s.statusMsg)
  const tool = useApp((s) => s.tool)
  const view = useApp((s) => s.view)

  const defaultHint =
    view !== 'top'
      ? 'Elevation views are read-only — switch to Top to edit.'
      : {
          select: 'Click to select · drag corners/edges/tiers · double-click an edge to add a corner · Delete removes',
          draw: "Click corners · type 12'6 + Enter for exact lengths · Enter closes · Esc cancels",
          stairs: 'Click a deck edge to attach stairs',
          measure: 'Click and drag to measure · Esc clears',
          pan: 'Drag to pan · scroll to zoom',
        }[tool]

  return (
    <footer className="statusbar">
      <span className="status-msg">{msg || defaultHint}</span>
      <span className="status-right">
        <label>
          Snap
          <select value={snapIn} onChange={(e) => setSnap(parseFloat(e.target.value))}>
            <option value={0.5}>1/2"</option>
            <option value={1}>1"</option>
            <option value={3}>3"</option>
            <option value={6}>6"</option>
            <option value={12}>12"</option>
          </select>
        </label>
        <span className="status-sep">·</span>
        <span>Scroll = zoom · Right-drag = pan · F = fit</span>
      </span>
    </footer>
  )
}
