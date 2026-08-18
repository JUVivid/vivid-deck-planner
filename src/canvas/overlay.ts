import type { Pt } from '../model/types'

export interface HoverHit {
  kind: 'vertex' | 'edge' | 'stairs' | 'tier'
  tierId?: string
  index?: number
  stairsId?: string
}

/** Transient interaction state — lives outside the store, redraws via bumpOverlay(). */
export interface Overlay {
  draftPts: Pt[]
  cursor: Pt | null
  snapped: Pt | null
  typedBuf: string
  hover: HoverHit | null
  measureA: Pt | null
  measureB: Pt | null
  panning: boolean
}

export function newOverlay(): Overlay {
  return {
    draftPts: [],
    cursor: null,
    snapped: null,
    typedBuf: '',
    hover: null,
    measureA: null,
    measureB: null,
    panning: false,
  }
}
