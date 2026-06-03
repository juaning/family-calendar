import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { useCalendarData } from '../hooks/useCalendarData'

export default function CalendarPane() {
  const { events, calendars, status, refetch } = useCalendarData()
  const [panelOpen, setPanelOpen] = useState(false)
  const [localCalendars, setLocalCalendars] = useState([])
  const [toggleErrors, setToggleErrors] = useState({})

  useEffect(() => {
    setLocalCalendars(calendars)
  }, [calendars])

  async function handleToggle(calId, newEnabled) {
    setToggleErrors(prev => ({ ...prev, [calId]: null }))
    setLocalCalendars(prev =>
      prev.map(c => c.id === calId ? { ...c, enabled: newEnabled } : c)
    )
    try {
      const res = await fetch('/api/calendars/enabled', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: calId, enabled: newEnabled }),
      })
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`)
      refetch()
    } catch {
      setLocalCalendars(prev =>
        prev.map(c => c.id === calId ? { ...c, enabled: !newEnabled } : c)
      )
      setToggleErrors(prev => ({ ...prev, [calId]: 'Could not save — try again' }))
    }
  }

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
    <div style={{ position: 'relative', height: '100%', padding: '12px', boxSizing: 'border-box' }}>
      <style>{calendarCss}</style>

      {/* Gear button — absolutely positioned top-right, clear of FullCalendar toolbar buttons */}
      <button
        onClick={() => setPanelOpen(o => !o)}
        style={gearButtonStyle}
        aria-label="Calendar settings"
        title="Show/hide calendars"
      >
        ⚙
      </button>

      {/* Transparent backdrop — closes panel on outside tap */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={backdropStyle}
        />
      )}

      {/* Settings panel */}
      {panelOpen && (
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <span style={{ fontWeight: 600, fontSize: '1rem', color: '#f8fafc' }}>Calendars</span>
            <button onClick={() => setPanelOpen(false)} style={closeButtonStyle} aria-label="Close">✕</button>
          </div>
          <div style={panelBodyStyle}>
            {localCalendars.map(cal => (
              <div key={cal.id} style={calRowStyle}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: cal.backgroundColor,
                    opacity: cal.enabled ? 1 : 0.3,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span style={{
                  flex: 1,
                  color: cal.enabled ? '#f8fafc' : '#64748b',
                  fontSize: '0.95rem',
                  transition: 'color 0.15s',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {cal.summary}
                </span>
                {toggleErrors[cal.id] && (
                  <span style={{ fontSize: '0.75rem', color: '#f87171', marginRight: 8 }}>
                    {toggleErrors[cal.id]}
                  </span>
                )}
                {/* Styled toggle switch — 44×44px minimum tap area */}
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '10px 0', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={cal.enabled}
                    onChange={e => handleToggle(cal.id, e.target.checked)}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                  <div style={{
                    width: 48,
                    height: 26,
                    borderRadius: 13,
                    background: cal.enabled ? '#2563eb' : '#475569',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: '#fff',
                      position: 'absolute',
                      top: 2,
                      transform: cal.enabled ? 'translateX(24px)' : 'translateX(2px)',
                      transition: 'transform 0.2s',
                    }} />
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}

      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'title',
          center: 'dayGridMonth,timeGridWeek,timeGridDay',
          right: 'today prev,next',
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

const gearButtonStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  zIndex: 20,
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: '1.4rem',
  cursor: 'pointer',
  width: 44,
  height: 44,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  lineHeight: 1,
}

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 25,
  background: 'transparent',
}

const panelStyle = {
  position: 'absolute',
  top: 60,
  right: 16,
  zIndex: 30,
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 12,
  width: 280,
  maxHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  fontFamily: 'system-ui, sans-serif',
}

const panelHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid #334155',
  flexShrink: 0,
}

const closeButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 4,
  lineHeight: 1,
}

const panelBodyStyle = {
  overflowY: 'auto',
  padding: '4px 0',
}

const calRowStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 16px',
  gap: 12,
  minHeight: 52,
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
  .fc .fc-toolbar { padding-right: 52px; }
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
