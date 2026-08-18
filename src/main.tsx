import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { addStairs, loadProject, setLayers, setSelection, store, updateStairs } from './model/store'
import { computeProject } from './engine'

// debug/support hook (used by tests and for quick console inspection)
const vdp = { store, computeProject, addStairs, updateStairs, loadProject, setLayers, setSelection }
declare global {
  interface Window {
    __vdp?: typeof vdp
  }
}
window.__vdp = vdp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
