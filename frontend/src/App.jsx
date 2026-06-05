import { useCalendarData } from './hooks/useCalendarData'
import { useConfig } from './hooks/useConfig'
import { useIdle } from './hooks/useIdle'
import { usePhotos } from './hooks/usePhotos'
import CalendarPane from './components/CalendarPane'
import Sidebar from './components/Sidebar'
import Slideshow from './components/Slideshow'

export default function App() {
  const calendarData = useCalendarData()
  const config       = useConfig()
  const { isIdle, resetIdle } = useIdle(config.idleMs)
  const { photos }   = usePhotos()

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
      <Slideshow
        isIdle={isIdle}
        onWake={resetIdle}
        photos={photos}
        intervalMs={config.intervalMs}
      />
    </div>
  )
}
