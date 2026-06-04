import { useCalendarData } from './hooks/useCalendarData'
import CalendarPane from './components/CalendarPane'
import Sidebar from './components/Sidebar'

export default function App() {
  const calendarData = useCalendarData()

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
        <CalendarPane
          calendars={calendarData.calendars}
          events={calendarData.events}
          status={calendarData.status}
          refetch={calendarData.refetch}
        />
      </div>
      <div style={{ flex: '0 0 30%', height: '100%', overflow: 'hidden' }}>
        <Sidebar calendars={calendarData.calendars} />
      </div>
    </div>
  )
}
