// frontend/src/components/ChoresList.jsx
import { useState, useEffect } from 'react'
import { useChores } from '../hooks/useChores'

export default function ChoresList({ calendars }) {
  const { chores, loading, error, refetch } = useChores()

  const [localChores, setLocalChores] = useState([])
  useEffect(() => { setLocalChores(chores) }, [chores])

  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAssignee, setEditAssignee] = useState(null)

  const [addingOpen, setAddingOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addAssignee, setAddAssignee] = useState(null)

  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // FIX 1: only person calendars in the picker — exclude primary/holiday (they default enabled:false)
  const personCalendars = calendars.filter(c => c.enabled)

  function calendarFor(calId) {
    return calendars.find(c => c.id === calId) || null
  }

  async function handleToggle(choreId, newDone) {
    setLocalChores(prev =>
      prev.map(c => c.id === choreId ? { ...c, done: newDone } : c)
    )
    try {
      const res = await fetch(`/api/chores/${choreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: newDone }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      refetch()
    } catch {
      setLocalChores(prev =>
        prev.map(c => c.id === choreId ? { ...c, done: !newDone } : c)
      )
    }
  }

  async function handleAdd() {
    const title = addTitle.trim()
    if (!title) return
    setBusy(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/chores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, assignee_calendar_id: addAssignee }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setAddTitle('')
      setAddAssignee(null)
      setAddingOpen(false)
      refetch()
    } catch {
      setSaveError('Could not save — try again')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(chore) {
    setEditingId(chore.id)
    setEditTitle(chore.title)
    setEditAssignee(chore.assignee_calendar_id)
    setSaveError(null)
  }

  async function handleSaveEdit() {
    const title = editTitle.trim()
    if (!title) return
    setBusy(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/chores/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, assignee_calendar_id: editAssignee }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setEditingId(null)
      refetch()
    } catch {
      setSaveError('Could not save — try again')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(choreId) {
    setBusy(true)
    try {
      const res = await fetch(`/api/chores/${choreId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`${res.status}`)
      setEditingId(null)
      refetch()
    } catch {
      setSaveError('Could not delete — try again')
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...localChores].sort((a, b) => {
    if (a.done === b.done) return 0
    return a.done ? 1 : -1
  })

  return (
    <div style={containerStyle}>

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>☑</span>
        <span style={headerTitleStyle}>Family Chores</span>
      </div>

      {/* FIX 2: "+ Add chore" lives at the top, below the header */}
      <div style={topBarStyle}>
        {addingOpen ? (
          <AddForm
            title={addTitle}
            assignee={addAssignee}
            calendars={personCalendars}
            onTitleChange={setAddTitle}
            onAssigneeChange={setAddAssignee}
            onSubmit={handleAdd}
            onCancel={() => { setAddingOpen(false); setAddTitle(''); setAddAssignee(null); setSaveError(null) }}
            busy={busy}
            saveError={saveError}
          />
        ) : (
          <button style={addButtonStyle} onClick={() => setAddingOpen(true)}>
            + Add chore
          </button>
        )}
      </div>

      {/* Chore list */}
      <div style={listStyle}>
        {loading && <p style={emptyStyle}>Loading…</p>}
        {error && (
          <p style={{ ...emptyStyle, color: 'var(--color-error)' }}>
            Could not load chores — check your connection.
          </p>
        )}
        {!loading && !error && sorted.length === 0 && (
          <p style={emptyStyle}>No chores yet — tap + Add to start.</p>
        )}
        {!loading && !error && sorted.map(chore => (
          editingId === chore.id
            ? (
              <EditCard
                key={chore.id}
                title={editTitle}
                assignee={editAssignee}
                calendars={personCalendars}
                onTitleChange={setEditTitle}
                onAssigneeChange={setEditAssignee}
                onSave={handleSaveEdit}
                onDelete={() => handleDelete(chore.id)}
                onCancel={() => { setEditingId(null); setSaveError(null) }}
                busy={busy}
                saveError={saveError}
              />
            ) : (
              <ChoreCard
                key={chore.id}
                chore={chore}
                calendar={calendarFor(chore.assignee_calendar_id)}
                onToggle={handleToggle}
                onEdit={() => openEdit(chore)}
              />
            )
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChoreCard({ chore, calendar, onToggle, onEdit }) {
  const initial = (calendar?.summary?.[0] ?? '?').toUpperCase()
  const avatarBg = calendar ? calendar.backgroundColor : 'var(--color-surface-container-highest)'
  const avatarFg = calendar ? calendar.foregroundColor : 'var(--color-on-surface-variant)'

  return (
    <div
      style={cardStyle}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      aria-label={`Edit ${chore.title}`}
      onKeyDown={e => e.key === 'Enter' && onEdit()}
    >
      {/* Coloured avatar */}
      <div style={{ ...avatarBase, background: avatarBg, color: avatarFg }}>
        {initial}
      </div>

      {/* Title + person name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 15,
          fontWeight: 600,
          color: chore.done ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
          textDecoration: chore.done ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: '20px',
        }}>
          {chore.title}
        </div>
        {calendar && (
          <div style={{
            fontSize: 12,
            fontWeight: 400,
            color: 'var(--color-on-surface-variant)',
            marginTop: 2,
            lineHeight: '16px',
          }}>
            {calendar.summary}
          </div>
        )}
      </div>

      {/* Checkbox */}
      <div
        role="checkbox"
        aria-checked={chore.done}
        tabIndex={0}
        onClick={e => { e.stopPropagation(); onToggle(chore.id, !chore.done) }}
        onKeyDown={e => {
          if (e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            onToggle(chore.id, !chore.done)
          }
        }}
        style={{
          width: 22,
          height: 22,
          borderRadius: 'var(--radius-md)',
          border: chore.done ? 'none' : '2px solid var(--color-outline)',
          background: chore.done ? 'var(--color-tertiary)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
          minWidth: 44,
          minHeight: 44,
          color: 'var(--color-on-tertiary)',
          fontSize: 14,
          fontWeight: 700,
          transition: 'background 0.15s',
        }}
      >
        {chore.done && '✓'}
      </div>
    </div>
  )
}


function AssigneePicker({ calendars, selected, onSelect }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: 36,
          height: 36,
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-surface-container-highest)',
          border: selected === null ? '3px solid var(--color-primary)' : '2px solid var(--color-outline-variant)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          color: 'var(--color-on-surface-variant)',
          minWidth: 44,
          minHeight: 44,
        }}
        title="No assignee"
        aria-label="No assignee"
      >
        •
      </button>
      {calendars.map(cal => (
        <button
          key={cal.id}
          type="button"
          onClick={() => onSelect(cal.id)}
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-full)',
            background: cal.backgroundColor,
            border: selected === cal.id ? '3px solid var(--color-primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: cal.foregroundColor,
            minWidth: 44,
            minHeight: 44,
          }}
          title={cal.summary}
          aria-label={cal.summary}
        >
          {(cal.summary?.[0] ?? '?').toUpperCase()}
        </button>
      ))}
    </div>
  )
}


function AddForm({ title, assignee, calendars, onTitleChange, onAssigneeChange, onSubmit, onCancel, busy, saveError }) {
  return (
    <div style={inlineFormStyle}>
      <input
        autoFocus
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Chore title…"
        style={inputStyle}
      />
      <AssigneePicker calendars={calendars} selected={assignee} onSelect={onAssigneeChange} />
      {saveError && (
        <p style={{ fontSize: 12, color: 'var(--color-error)', margin: '4px 0 8px' }}>
          {saveError}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onSubmit} disabled={busy || !title.trim()} style={primaryBtnStyle}>
          Add
        </button>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>
          Cancel
        </button>
      </div>
    </div>
  )
}


function EditCard({ title, assignee, calendars, onTitleChange, onAssigneeChange, onSave, onDelete, onCancel, busy, saveError }) {
  return (
    <div style={{ ...inlineFormStyle, marginBottom: 10 }}>
      <input
        autoFocus
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        style={inputStyle}
      />
      <AssigneePicker calendars={calendars} selected={assignee} onSelect={onAssigneeChange} />
      {saveError && (
        <p style={{ fontSize: 12, color: 'var(--color-error)', margin: '4px 0 8px' }}>
          {saveError}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onSave} disabled={busy || !title.trim()} style={primaryBtnStyle}>
          Save
        </button>
        <button type="button" onClick={onDelete} disabled={busy} style={deleteBtnStyle}>
          Delete
        </button>
        <button type="button" onClick={onCancel} style={ghostBtnStyle}>
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-surface-container-low)',
  borderLeft: '1px solid var(--color-outline-variant)',
  fontFamily: 'var(--font-family)',
  overflow: 'hidden',
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '20px var(--space-gutter)',
  borderBottom: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-low)',
  flexShrink: 0,
}

const headerTitleStyle = {
  fontSize: 'var(--text-headline-lg-size)',
  fontWeight: 'var(--text-headline-lg-weight)',
  color: 'var(--color-on-surface)',
  lineHeight: 'var(--text-headline-lg-line-height)',
}

// FIX 2: top bar replaces footer
const topBarStyle = {
  padding: '12px var(--space-gutter)',
  borderBottom: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-low)',
  flexShrink: 0,
}

const listStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px var(--space-gutter)',
}

const emptyStyle = {
  color: 'var(--color-on-surface-variant)',
  fontSize: 14,
  textAlign: 'center',
  marginTop: 'var(--space-stack-lg)',
}

// FIX 3: white card with elevation — matches Stitch card surface
const cardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 16px',
  marginBottom: 10,
  borderRadius: 'var(--radius-xl)',
  background: 'var(--color-surface-container-lowest)',
  border: '1px solid var(--color-outline-variant)',
  boxShadow: '0 1px 3px rgba(27,28,27,0.07)',
  cursor: 'pointer',
  minHeight: 'var(--space-touch-min)',
  transition: 'box-shadow 0.1s',
  outline: 'none',
}

const avatarBase = {
  width: 40,
  height: 40,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 17,
  fontWeight: 700,
  flexShrink: 0,
  userSelect: 'none',
}

const addButtonStyle = {
  width: '100%',
  padding: '10px 0',
  minHeight: 'var(--space-touch-min)',
  background: 'var(--color-primary)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-on-primary)',
  fontSize: 'var(--text-body-xl-size)',
  fontWeight: 600,
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}

const inlineFormStyle = {
  background: 'var(--color-surface-container-lowest)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-outline-variant)',
  padding: '12px 16px',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  fontSize: 'var(--text-body-xl-size)',
  fontFamily: 'var(--font-family)',
  boxSizing: 'border-box',
  marginBottom: 8,
  outline: 'none',
}

const primaryBtnStyle = {
  flex: 1,
  padding: '10px 0',
  minHeight: 44,
  background: 'var(--color-primary)',
  color: 'var(--color-on-primary)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body-xl-size)',
  fontWeight: 600,
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}

const deleteBtnStyle = {
  padding: '10px 14px',
  minHeight: 44,
  background: 'var(--color-error-container)',
  color: 'var(--color-error)',
  border: 'none',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body-xl-size)',
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}

const ghostBtnStyle = {
  padding: '10px 14px',
  minHeight: 44,
  background: 'transparent',
  color: 'var(--color-on-surface-variant)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body-xl-size)',
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}
