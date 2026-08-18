import { useRef, useState } from 'react'
import {
  canUndo,
  exportJson,
  importJson,
  listSaves,
  newProject,
  openSave,
  redo,
  renameProject,
  saveAs,
  setActiveTier,
  setPage,
  setStatus,
  setTool,
  setView,
  undo,
  useApp,
} from '../model/store'
import { bomToCsv } from '../engine'
import { useComputed } from './useComputed'
import type { ViewKind } from '../model/types'

import { download, orderCsvFilename, safeFilename } from './download'

const VIEWS: { key: ViewKind; label: string; title: string }[] = [
  { key: 'top', label: 'Top', title: 'Top-down plan view (edit here)' },
  { key: 'N', label: 'N', title: 'View from the North' },
  { key: 'S', label: 'S', title: 'View from the South' },
  { key: 'E', label: 'E', title: 'View from the East' },
  { key: 'W', label: 'W', title: 'View from the West' },
]

export function TopBar() {
  const project = useApp((s) => s.project)
  const view = useApp((s) => s.view)
  const activeTierId = useApp((s) => s.activeTierId)
  const computed = useComputed()
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportPng = () => {
    const canvas = document.getElementById('plan-canvas') as HTMLCanvasElement | null
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${project.name.replace(/[^\w-]+/g, '_')}_plan.png`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">V</span>
        <div>
          <div className="brand-name">Vivid Deck Planner</div>
          <input
            className="project-name"
            value={project.name}
            onChange={(e) => renameProject(e.target.value)}
            spellCheck={false}
          />
        </div>
      </div>

      <div className="tier-tabs">
        {project.tiers.map((t) => (
          <button
            key={t.id}
            className={`tab ${t.id === activeTierId ? 'active' : ''}`}
            onClick={() => setActiveTier(t.id)}
            title={`Edit ${t.name}`}
          >
            {t.name}
          </button>
        ))}
        <button
          className="tab add"
          title="Draw a new tier / platform"
          onClick={() => {
            setTool('draw')
            setView('top')
            setStatus('Drawing a new tier: click to place corners, Enter to close.')
          }}
        >
          + Tier
        </button>
      </div>

      <div className="view-switch" title="Camera">
        {VIEWS.map((v) => (
          <button key={v.key} className={view === v.key ? 'active' : ''} title={v.title} onClick={() => setView(v.key)}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="top-actions">
        <button
          className="quote-btn"
          title="Open the customer-facing proposal"
          onClick={() => setPage('quote')}
        >
          Customer Quote →
        </button>
        <button title="Undo (Ctrl+Z)" onClick={() => undo()} disabled={!canUndo()}>
          ↩
        </button>
        <button title="Redo (Ctrl+Shift+Z)" onClick={() => redo()}>
          ↪
        </button>
        <div className="menu-wrap">
          <button className="primary" onClick={() => setMenuOpen((o) => !o)}>
            File ▾
          </button>
          {menuOpen && (
            <div className="menu" onClick={() => setMenuOpen(false)}>
              <button onClick={() => newProject('blank')}>New blank project</button>
              <button onClick={() => newProject('demo')}>New from sample deck</button>
              <hr />
              <button
                onClick={() => {
                  const name = prompt('Save project as:', project.name)
                  if (name) saveAs(name)
                }}
              >
                Save as…
              </button>
              {listSaves().length > 0 && (
                <div className="submenu">
                  <div className="submenu-label">Open saved</div>
                  {listSaves().map((n) => (
                    <button key={n} onClick={() => openSave(n)}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              <hr />
              <button onClick={() => download(`${safeFilename(project.name)}.vividdeck.json`, exportJson(), 'application/json')}>
                Export project (.json)
              </button>
              <button onClick={() => fileRef.current?.click()}>Import project (.json)</button>
              <hr />
              <button onClick={() => download(orderCsvFilename(project.name), bomToCsv(computed.bom, project.name), 'text/csv')}>
                Export material order (.csv)
              </button>
              <button onClick={exportPng}>Export plan image (.png)</button>
            </div>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) {
              const err = importJson(await f.text())
              if (err) alert(err)
            }
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}
