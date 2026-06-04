import { useState, useEffect } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
export default function CalendarPane({ calendars, events, status, refetch }) {
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
        <p style={{ fontSize: 'var(--text-headline-md-size)', marginBottom: 'var(--space-stack-md)' }}>
          Calendar needs Google authorisation.
        </p>
        <code style={{
          background: 'var(--color-surface-container-highest)',
          color: 'var(--color-on-surface)',
          padding: '0.5rem 1rem',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'monospace',
        }}>
          python -m app.auth
        </code>
        <p style={{ marginTop: 'var(--space-stack-md)', color: 'var(--color-on-surface-variant)', fontSize: 'var(--text-body-xl-size)' }}>
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
    <div style={{
      position: 'relative',
      height: '100%',
      padding: 'var(--space-stack-sm)',
      boxSizing: 'border-box',
      background: 'var(--color-background)',
      fontFamily: 'var(--font-family)',
    }}>
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
            <span style={{
              fontWeight: 'var(--text-headline-md-weight)',
              fontSize: 'var(--text-headline-md-size)',
              color: 'var(--color-on-surface)',
            }}>
              Calendars
            </span>
            <button onClick={() => setPanelOpen(false)} style={closeButtonStyle} aria-label="Close">✕</button>
          </div>
          <div style={panelBodyStyle}>
            {localCalendars.map(cal => (
              <div key={cal.id} style={calRowStyle}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 'var(--radius-full)',
                    background: cal.backgroundColor,
                    opacity: cal.enabled ? 1 : 0.3,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
                <span style={{
                  flex: 1,
                  color: cal.enabled ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                  fontSize: 'var(--text-body-xl-size)',
                  transition: 'color 0.15s',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {cal.summary}
                </span>
                {toggleErrors[cal.id] && (
                  <span style={{ fontSize: 'var(--text-label-lg-size)', color: 'var(--color-error)', marginRight: 8 }}>
                    {toggleErrors[cal.id]}
                  </span>
                )}
                {/* Styled toggle switch — touch-min tap area */}
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
                    background: cal.enabled ? 'var(--color-primary)' : 'var(--color-outline)',
                    position: 'relative',
                    transition: 'background 0.2s',
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--color-surface-container-lowest)',
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
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-family)',
  textAlign: 'center',
  padding: 'var(--space-margin)',
}

const gearButtonStyle = {
  position: 'absolute',
  top: 16,
  right: 16,
  zIndex: 20,
  background: 'transparent',
  border: 'none',
  color: 'var(--color-on-surface-variant)',
  fontSize: '1.4rem',
  cursor: 'pointer',
  width: 'var(--space-touch-min)',
  height: 'var(--space-touch-min)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 'var(--radius-md)',
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
  background: 'var(--color-surface-container-high)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: 'var(--radius-lg)',
  width: 280,
  maxHeight: '60vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 16px rgba(27,28,27,0.12)',
  fontFamily: 'var(--font-family)',
}

const panelHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 'var(--space-stack-sm) var(--space-stack-md)',
  borderBottom: '1px solid var(--color-outline-variant)',
  flexShrink: 0,
}

const closeButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-on-surface-variant)',
  fontSize: '1.1rem',
  cursor: 'pointer',
  padding: '4px 8px',
  borderRadius: 'var(--radius-sm)',
  lineHeight: 1,
}

const panelBodyStyle = {
  overflowY: 'auto',
  padding: 'var(--space-unit) 0',
}

const calRowStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '0 var(--space-stack-md)',
  gap: 'var(--space-stack-sm)',
  minHeight: 52,
}

const calendarCss = `
  .fc {
    --fc-border-color: var(--color-outline-variant);
    --fc-page-bg-color: var(--color-background);
    --fc-neutral-bg-color: var(--color-surface-container-low);
    --fc-list-event-hover-bg-color: var(--color-surface-container);
    --fc-today-bg-color: var(--color-primary-fixed);
    color: var(--color-on-surface);
    font-family: var(--font-family);
    font-size: 15px;
  }
  .fc .fc-toolbar-title {
    font-size: var(--text-headline-xl-size);
    font-weight: var(--text-headline-xl-weight);
    line-height: var(--text-headline-xl-line-height);
    color: var(--color-on-surface);
  }
  .fc .fc-toolbar {
    padding-right: 52px;
    padding: 16px 68px 16px 20px;
    background: var(--color-surface-container-low);
    border-bottom: 1px solid var(--color-outline-variant);
  }
  .fc .fc-button {
    font-size: 14px !important;
    font-family: var(--font-family) !important;
    padding: 0.5rem 1.1rem !important;
    background: var(--color-surface-container-lowest) !important;
    border-color: var(--color-outline-variant) !important;
    color: var(--color-on-surface) !important;
    border-radius: var(--radius-md) !important;
    box-shadow: none !important;
    font-weight: 600 !important;
    min-height: 36px !important;
  }
  .fc .fc-button:hover {
    background: var(--color-surface-container-high) !important;
    border-color: var(--color-outline) !important;
  }
  .fc .fc-button-primary:not(:disabled).fc-button-active,
  .fc .fc-button-primary:not(:disabled):active {
    background: var(--color-primary) !important;
    border-color: var(--color-primary) !important;
    color: var(--color-on-primary) !important;
  }
  .fc .fc-col-header-cell-cushion,
  .fc .fc-daygrid-day-number {
    color: var(--color-on-surface-variant);
    font-size: 13px;
    text-decoration: none;
    padding: 6px 8px;
  }
  .fc .fc-daygrid-day-number:hover { color: var(--color-on-surface); }
  .fc .fc-event {
    font-size: 13px;
    border-radius: var(--radius-md);
    border: none;
    padding: 2px 6px;
    font-weight: 600;
  }
  .fc .fc-col-header-cell {
    background: var(--color-surface-container-low);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .fc .fc-scrollgrid { border-color: var(--color-outline-variant); }
  .fc .fc-scrollgrid-section > td { border-color: var(--color-outline-variant); }
  .fc .fc-daygrid-day.fc-day-today { background: var(--color-primary-fixed) !important; }
  .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number { color: var(--color-primary); font-weight: 700; }
`
