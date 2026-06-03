import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useCalendarData } from '../hooks/useCalendarData'

export default function CalendarPane() {
  const { events, status } = useCalendarData()

  if (status === 'auth_required') {
    return (
      <div style={centerStyle}>
        <p style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Calendar needs Google authorisation.
        </p>
        <code style={{ background: '#1e293b', padding: '0.5rem 1rem', borderRadius: 6 }}>
          python -m app.auth
        </code>
        <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
          Run that command on your Mac, then restart the app.
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return <div style={centerStyle}>Loading calendar…</div>
  }

  if (status === 'error') {
    return <div style={centerStyle}>Could not reach the calendar service.</div>
  }

  const fcEvents = events.map(e => ({
    id: `${e.calendarId}::${e.id}`,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    backgroundColor: e.backgroundColor,
    borderColor: e.backgroundColor,
    textColor: e.foregroundColor,
  }))

  return (
    <div style={{ height: '100%', padding: '12px', boxSizing: 'border-box' }}>
      <style>{calendarCss}</style>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'title',
          center: '',
          right: 'dayGridMonth,timeGridWeek,timeGridDay today prev,next',
        }}
        height="100%"
        events={fcEvents}
        buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
        eventDisplay="block"
      />
    </div>
  )
}

const centerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: '#f8fafc',
  fontFamily: 'system-ui, sans-serif',
  textAlign: 'center',
  padding: '2rem',
}

const calendarCss = `
  .fc {
    --fc-border-color: #334155;
    --fc-page-bg-color: #0f172a;
    --fc-neutral-bg-color: #1e293b;
    --fc-list-event-hover-bg-color: #1e293b;
    --fc-today-bg-color: #1e3a5f;
    color: #f8fafc;
    font-size: 1.05rem;
  }
  .fc .fc-toolbar-title { font-size: 1.8rem; font-weight: 400; }
  .fc .fc-button {
    font-size: 1rem;
    padding: 0.5rem 1.1rem;
    background: #1e293b;
    border-color: #475569;
    color: #f8fafc;
  }
  .fc .fc-button:hover { background: #334155; }
  .fc .fc-button-primary:not(:disabled).fc-button-active { background: #2563eb; border-color: #2563eb; }
  .fc .fc-col-header-cell-cushion,
  .fc .fc-daygrid-day-number { color: #94a3b8; font-size: 0.95rem; }
  .fc .fc-event { font-size: 0.9rem; border-radius: 4px; }
`
