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

      {/* Backdrop — semi-transparent with blur, closes panel on tap */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={backdropStyle}
        />
      )}

      {/* Settings panel — full-height right drawer */}
      {panelOpen && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={panelHeaderStyle}>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-on-surface)' }}>
              Calendar Settings
            </span>
            <button onClick={() => setPanelOpen(false)} style={closeButtonStyle} aria-label="Close">✕</button>
          </div>

          {/* Body */}
          <div style={panelBodyStyle}>
            <div style={sectionLabelStyle}>Family Members Visibility</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {localCalendars.map(cal => (
                <div key={cal.id} style={calRowStyle}>
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 'var(--radius-full)',
                      background: cal.backgroundColor,
                      opacity: cal.enabled ? 1 : 0.35,
                      flexShrink: 0,
                      display: 'inline-block',
                    }}
                  />
                  <span style={{
                    flex: 1,
                    color: cal.enabled ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                    fontSize: 16,
                    fontWeight: 400,
                    transition: 'color 0.15s',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {cal.summary}
                  </span>
                  {toggleErrors[cal.id] && (
                    <span style={{ fontSize: 11, color: 'var(--color-error)', marginRight: 8 }}>
                      {toggleErrors[cal.id]}
                    </span>
                  )}
                  {/* Styled toggle switch */}
                  <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={cal.enabled}
                      onChange={e => handleToggle(cal.id, e.target.checked)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div style={{
                      width: 56,
                      height: 28,
                      borderRadius: 14,
                      background: cal.enabled ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
                      position: 'relative',
                      transition: 'background 0.2s',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: 22,
                        height: 22,
                        borderRadius: 'var(--radius-full)',
                        background: '#ffffff',
                        border: '2px solid var(--color-outline-variant)',
                        position: 'absolute',
                        top: 3,
                        transform: cal.enabled ? 'translateX(31px)' : 'translateX(3px)',
                        transition: 'transform 0.2s',
                      }} />
                    </div>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div style={panelFooterStyle}>
            <button onClick={() => setPanelOpen(false)} style={footerPrimaryBtnStyle}>
              Save Changes
            </button>
            <button onClick={() => setPanelOpen(false)} style={footerGhostBtnStyle}>
              Cancel
            </button>
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
  background: 'rgba(48,48,48,0.25)',
  backdropFilter: 'blur(2px)',
}

const panelStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  zIndex: 30,
  background: 'var(--color-surface)',
  borderLeft: '4px solid var(--color-outline-variant)',
  width: 320,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '-8px 0 40px rgba(27,28,27,0.18)',
  fontFamily: 'var(--font-family)',
}

const panelHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '20px 24px',
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-surface-container-high)',
  flexShrink: 0,
}

const closeButtonStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--color-on-surface)',
  fontSize: '1.1rem',
  cursor: 'pointer',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

const panelBodyStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px 24px',
}

const sectionLabelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-on-surface-variant)',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  marginBottom: 12,
}

const calRowStyle = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  gap: 12,
  minHeight: 64,
  background: 'var(--color-surface-container-lowest)',
  borderRadius: 'var(--radius-card)',
  border: '2px solid var(--color-surface-container)',
}

const panelFooterStyle = {
  padding: '16px 24px',
  borderTop: '2px solid var(--color-surface-container-high)',
  background: 'var(--color-surface)',
  display: 'flex',
  gap: 12,
  flexShrink: 0,
}

const footerPrimaryBtnStyle = {
  flex: 1,
  padding: '14px',
  minHeight: 52,
  background: 'var(--color-primary-container)',
  color: 'var(--color-on-primary-container)',
  border: '3px solid var(--color-primary-container)',
  borderRadius: 'var(--radius-xl)',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}

const footerGhostBtnStyle = {
  flex: 1,
  padding: '14px',
  minHeight: 52,
  background: 'transparent',
  color: 'var(--color-on-surface)',
  border: '3px solid var(--color-outline)',
  borderRadius: 'var(--radius-xl)',
  fontSize: 16,
  fontWeight: 700,
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
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
    border-radius: 6px;
    border: none;
    padding: 3px 8px;
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
