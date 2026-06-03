import CalendarPane from './components/CalendarPane'
import Sidebar from './components/Sidebar'

export default function App() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--color-background)',
      fontFamily: 'var(--font-family)',
      color: 'var(--color-on-background)',
      overflow: 'hidden',
    }}>
      <div style={{ flex: '0 0 70%', height: '100%', minWidth: 0, overflow: 'hidden' }}>
        <CalendarPane />
      </div>
      <div style={{ flex: '0 0 30%', height: '100%' }}>
        <Sidebar />
      </div>
    </div>
  )
}
