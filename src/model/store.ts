import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { Layers, Project, QuoteConfig, Selection, Stairs, Tier, Tool, ViewKind } from './types'
import { blankProject, demoProject, migrateProject, newTier, uid } from './defaults'
import { normalizeDecking, normalizeRailing } from '../catalog/compat'
import { autoFrameAll } from '../engine/autoframe'
import type { Pt } from './types'

/** 'design' = the internal CAD workspace, 'quote' = the customer-facing proposal. */
export type Page = 'design' | 'quote'

export interface AppState {
  project: Project
  page: Page
  tool: Tool
  view: ViewKind
  activeTierId: string | null
  selection: Selection
  layers: Layers
  /** grid snap, inches */
  snapIn: number
  /** bumped by interactions to trigger redraws of transient overlay state */
  overlayVersion: number
  statusMsg: string
}

const AUTOSAVE_KEY = 'vdp.autosave.v1'
const SAVES_KEY = 'vdp.saves.v1'

function loadInitial(): Project {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY)
    if (raw) {
      const p = migrateProject(JSON.parse(raw))
      if (p) {
        autoFrameAll(p)
        return p
      }
    }
  } catch {
    /* fall through to demo */
  }
  return demoProject()
}

export const store = createStore<AppState>(() => {
  const project = loadInitial()
  return {
    project,
    page: 'design',
    tool: 'select',
    view: 'top',
    activeTierId: project.tiers[0]?.id ?? null,
    selection: { kind: 'none' },
    layers: {
      grid: true,
      decking: true,
      framing: true,
      hardware: false,
      dimensions: true,
      railing: true,
      labels: true,
    },
    snapIn: 3,
    overlayVersion: 0,
    statusMsg: '',
  }
})

export function useApp<T>(selector: (s: AppState) => T): T {
  return useStore(store, selector)
}

// ---------------- history ----------------

const past: Project[] = []
const future: Project[] = []
let gestureBase: Project | null = null
const MAX_HISTORY = 100

function pushHistory(base: Project) {
  past.push(base)
  if (past.length > MAX_HISTORY) past.shift()
  future.length = 0
}

/** Apply a mutation to a cloned project; records history unless in a gesture. */
export function commit(fn: (p: Project) => void) {
  const cur = store.getState().project
  const next = structuredClone(cur)
  fn(next)
  // company framing standard: the program sizes the structure, not the rep
  autoFrameAll(next)
  if (gestureBase === null) pushHistory(cur)
  store.setState({ project: next })
}

/** Begin a drag gesture: history gets one entry for the whole drag. */
export function beginGesture() {
  if (gestureBase === null) gestureBase = store.getState().project
}

export function endGesture() {
  if (gestureBase !== null) {
    if (gestureBase !== store.getState().project) pushHistory(gestureBase)
    gestureBase = null
  }
}

function revalidateActiveTier() {
  const s = store.getState()
  if (s.activeTierId && !s.project.tiers.some((t) => t.id === s.activeTierId)) {
    store.setState({ activeTierId: s.project.tiers[0]?.id ?? null })
  } else if (!s.activeTierId && s.project.tiers.length > 0) {
    store.setState({ activeTierId: s.project.tiers[0].id })
  }
}

export function undo() {
  const prev = past.pop()
  if (!prev) return
  future.push(store.getState().project)
  store.setState({ project: prev, selection: { kind: 'none' } })
  revalidateActiveTier()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(store.getState().project)
  store.setState({ project: next, selection: { kind: 'none' } })
  revalidateActiveTier()
}

export function canUndo() {
  return past.length > 0
}

// ---------------- UI actions ----------------

export const setTool = (tool: Tool) => store.setState({ tool, statusMsg: '' })
export const setView = (view: ViewKind) => store.setState({ view })
export const setPage = (page: Page) => store.setState({ page, statusMsg: '' })

/** Edit the customer quote config (scope toggles, rates, tax). */
export const updateQuote = (fn: (q: QuoteConfig) => void) =>
  commit((p) => {
    fn(p.settings.quote)
  })
export const setSelection = (selection: Selection) => store.setState({ selection })
export const setLayers = (layers: Partial<Layers>) =>
  store.setState((s) => ({ layers: { ...s.layers, ...layers } }))
export const setSnap = (snapIn: number) => store.setState({ snapIn })
export const setStatus = (statusMsg: string) => store.setState({ statusMsg })
export const bumpOverlay = () => store.setState((s) => ({ overlayVersion: s.overlayVersion + 1 }))

export function setActiveTier(id: string | null) {
  store.setState({ activeTierId: id, selection: id ? { kind: 'tier', tierId: id } : { kind: 'none' } })
}

export function activeTier(): Tier | null {
  const s = store.getState()
  return s.project.tiers.find((t) => t.id === s.activeTierId) ?? null
}

export function tierById(id: string): Tier | null {
  return store.getState().project.tiers.find((t) => t.id === id) ?? null
}

// ---------------- project actions ----------------

export function addTierFromOutline(outline: Pt[]) {
  const s = store.getState()
  const name = `Tier ${s.project.tiers.length + 1}`
  const tier = newTier(outline, s.project.tiers.length === 0 ? 'Main Deck' : name, 3)
  commit((p) => {
    p.tiers.push(tier)
  })
  store.setState({ activeTierId: tier.id, selection: { kind: 'tier', tierId: tier.id }, tool: 'select' })
  return tier.id
}

export function updateTier(tierId: string, fn: (t: Tier) => void) {
  commit((p) => {
    const t = p.tiers.find((x) => x.id === tierId)
    if (!t) return
    fn(t)
    const msgs = [...normalizeDecking(t), ...normalizeRailing(p)]
    if (msgs.length > 0) {
      queueMicrotask(() => setStatus(msgs.join(' ')))
    }
  })
}

export function addBreaker(tierId: string, t = 0.5) {
  updateTier(tierId, (x) => {
    x.decking.breakerStations = [...(x.decking.breakerStations ?? []), Math.max(0.05, Math.min(0.95, t))]
  })
}

export function removeBreaker(tierId: string, idx: number) {
  updateTier(tierId, (x) => {
    x.decking.breakerStations = (x.decking.breakerStations ?? []).filter((_, i) => i !== idx)
  })
}

export function moveBreaker(tierId: string, idx: number, t: number) {
  updateTier(tierId, (x) => {
    const arr = [...(x.decking.breakerStations ?? [])]
    if (idx >= 0 && idx < arr.length) arr[idx] = Math.max(0.03, Math.min(0.97, t))
    x.decking.breakerStations = arr
  })
}

export function deleteTier(tierId: string) {
  commit((p) => {
    p.tiers = p.tiers.filter((t) => t.id !== tierId)
    p.stairs = p.stairs.filter(
      (st) => st.tierId !== tierId && !(st.landing.kind === 'tier' && st.landing.tierId === tierId),
    )
  })
  const s = store.getState()
  if (s.activeTierId === tierId) {
    setActiveTier(s.project.tiers[0]?.id ?? null)
  }
}

export function addStairs(tierId: string, edgeIndex: number, t: number): string {
  const id = uid('stair')
  const stairs: Stairs = { id, tierId, edgeIndex, t, width: 4, landing: { kind: 'grade' } }
  commit((p) => {
    p.stairs.push(stairs)
  })
  store.setState({ selection: { kind: 'stairs', stairsId: id }, tool: 'select' })
  return id
}

export function updateStairs(id: string, fn: (s: Stairs) => void) {
  commit((p) => {
    const st = p.stairs.find((x) => x.id === id)
    if (st) fn(st)
  })
}

export function deleteStairs(id: string) {
  commit((p) => {
    p.stairs = p.stairs.filter((x) => x.id !== id)
  })
  store.setState({ selection: { kind: 'none' } })
}

export function updateSettings(fn: (s: Project['settings']) => void) {
  commit((p) => {
    fn(p.settings)
    const msgs = normalizeRailing(p)
    if (msgs.length > 0) {
      queueMicrotask(() => setStatus(msgs.join(' ')))
    }
  })
}

export function renameProject(name: string) {
  commit((p) => {
    p.name = name
  })
}

export function loadProject(p: Project) {
  autoFrameAll(p)
  pushHistory(store.getState().project)
  store.setState({
    project: p,
    activeTierId: p.tiers[0]?.id ?? null,
    selection: { kind: 'none' },
  })
}

export function newProject(kind: 'blank' | 'demo') {
  loadProject(kind === 'demo' ? demoProject() : blankProject())
  if (kind === 'blank') store.setState({ tool: 'draw', statusMsg: 'Draw your deck outline: click to place corners, Enter or click the first corner to close.' })
}

// ---------------- persistence ----------------

let saveTimer: ReturnType<typeof setTimeout> | null = null
store.subscribe((s, prev) => {
  if (s.project === prev.project) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(s.project))
    } catch {
      /* storage full/unavailable — ignore */
    }
  }, 600)
})

export function listSaves(): string[] {
  try {
    return Object.keys(JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}')).sort()
  } catch {
    return []
  }
}

export function saveAs(name: string) {
  const saves = JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}')
  saves[name] = store.getState().project
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves))
  renameProject(name)
}

export function openSave(name: string): boolean {
  try {
    const saves = JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}')
    if (saves[name]) {
      loadProject(saves[name])
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}

export function deleteSave(name: string) {
  const saves = JSON.parse(localStorage.getItem(SAVES_KEY) ?? '{}')
  delete saves[name]
  localStorage.setItem(SAVES_KEY, JSON.stringify(saves))
}

export function exportJson(): string {
  return JSON.stringify(store.getState().project, null, 2)
}

export function importJson(text: string): string | null {
  try {
    const p = migrateProject(JSON.parse(text))
    if (!p) return 'Not a valid Vivid Deck Planner file.'
    loadProject(p)
    return null
  } catch (e) {
    return `Could not parse file: ${e instanceof Error ? e.message : String(e)}`
  }
}
