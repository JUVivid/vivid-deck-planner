import { CanvasView } from './canvas/CanvasView'
import { TopBar } from './ui/TopBar'
import { Toolbar } from './ui/Toolbar'
import { SidePanel } from './ui/SidePanel'
import { StatusBar } from './ui/StatusBar'
import { QuoteView } from './ui/QuoteView'
import { useApp } from './model/store'

export default function App() {
  const page = useApp((s) => s.page)
  if (page === 'quote') return <QuoteView />
  return (
    <div className="app">
      <TopBar />
      <div className="app-main">
        <Toolbar />
        <CanvasView />
        <SidePanel />
      </div>
      <StatusBar />
    </div>
  )
}
