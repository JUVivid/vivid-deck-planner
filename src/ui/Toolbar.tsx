import { setStatus, setTool, useApp } from '../model/store'
import type { Tool } from '../model/types'

const TOOLS: { key: Tool; icon: string; label: string; hint: string; kbd: string }[] = [
  { key: 'select', icon: '⬚', label: 'Select', hint: 'Select & move corners, edges, tiers, stairs', kbd: 'V' },
  { key: 'draw', icon: '✏', label: 'Draw', hint: 'Draw a deck outline — click corners, type lengths, Enter to close', kbd: 'D' },
  { key: 'stairs', icon: '≡', label: 'Stairs', hint: 'Click a deck edge to attach stairs', kbd: 'S' },
  { key: 'measure', icon: '⟷', label: 'Measure', hint: 'Click & drag to measure', kbd: 'M' },
  { key: 'pan', icon: '✥', label: 'Pan', hint: 'Drag to pan (or hold right mouse button)', kbd: 'H' },
]

export function Toolbar() {
  const tool = useApp((s) => s.tool)
  const view = useApp((s) => s.view)
  return (
    <nav className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.key}
          className={`tool ${tool === t.key ? 'active' : ''}`}
          disabled={view !== 'top'}
          title={`${t.label} (${t.kbd}) — ${t.hint}`}
          onClick={() => {
            setTool(t.key)
            setStatus(t.hint)
          }}
        >
          <span className="tool-icon">{t.icon}</span>
          <span className="tool-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
