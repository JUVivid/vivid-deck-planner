import { useEffect, useState } from 'react'
import { ftIn, parseLen } from './format'

export function LenInput(props: {
  value: number
  onCommit: (v: number) => void
  min?: number
  max?: number
  disabled?: boolean
}) {
  const [txt, setTxt] = useState(ftIn(props.value))
  useEffect(() => setTxt(ftIn(props.value)), [props.value])
  const commit = () => {
    const v = parseLen(txt)
    if (v === null) {
      setTxt(ftIn(props.value))
      return
    }
    const clamped = Math.max(props.min ?? 0, Math.min(props.max ?? 1000, v))
    if (Math.abs(clamped - props.value) > 1e-6) props.onCommit(clamped)
    else setTxt(ftIn(props.value))
  }
  return (
    <input
      className="len-input"
      value={txt}
      disabled={props.disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setTxt(ftIn(props.value))
      }}
    />
  )
}

export function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </label>
  )
}

export function Row(props: { children: React.ReactNode }) {
  return <div className="field-row">{props.children}</div>
}

export function Section(props: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <h3>{props.title}</h3>
        {props.right}
      </div>
      {props.children}
    </div>
  )
}
