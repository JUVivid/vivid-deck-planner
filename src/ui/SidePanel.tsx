import { useState } from 'react'
import { setLayers, useApp } from '../model/store'
import type { Layers } from '../model/types'
import { PropertiesPanel } from './PropertiesPanel'
import { MaterialsPanel } from './MaterialsPanel'
import { useComputed } from './useComputed'

type Tab = 'design' | 'materials'

export function SidePanel() {
  const [tab, setTab] = useState<Tab>('design')
  const computed = useComputed()
  const fails = computed.checks.filter((c) => c.level === 'fail')

  return (
    <aside className="sidepanel">
      <div className="side-tabs">
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}>
          Design
        </button>
        <button className={tab === 'materials' ? 'active' : ''} onClick={() => setTab('materials')}>
          Materials
        </button>
      </div>
      <div className="side-body">
        {tab === 'design' && (
          <>
            {/* framing is auto-sized to code, so this only fires when a layout
                is genuinely unbuildable (e.g. impossible spans or geometry) */}
            {fails.length > 0 && (
              <div className="review-banner">
                <b>⚠ Needs engineering review</b>
                {fails.map((c) => (
                  <div key={c.id} className="review-item">
                    {c.title}: {c.detail}
                  </div>
                ))}
              </div>
            )}
            <LayersBox />
            <PropertiesPanel />
          </>
        )}
        {tab === 'materials' && <MaterialsPanel />}
      </div>
    </aside>
  )
}

function LayersBox() {
  const layers = useApp((s) => s.layers)
  const items: { key: keyof Layers; label: string }[] = [
    { key: 'decking', label: 'Decking' },
    { key: 'framing', label: 'Framing' },
    { key: 'hardware', label: 'Hardware' },
    { key: 'railing', label: 'Railing' },
    { key: 'dimensions', label: 'Dimensions' },
    { key: 'labels', label: 'Labels' },
    { key: 'grid', label: 'Grid' },
  ]
  return (
    <div className="layers-box">
      {items.map((it) => (
        <label key={it.key} className={`layer-chip ${layers[it.key] ? 'on' : ''}`}>
          <input type="checkbox" checked={layers[it.key]} onChange={(e) => setLayers({ [it.key]: e.target.checked })} />
          {it.label}
        </label>
      ))}
    </div>
  )
}

