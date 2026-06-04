// frontend/src/components/ChoresList.jsx
import { useState, useEffect } from 'react'
import { useChores } from '../hooks/useChores'

export default function ChoresList({ calendars }) {
  const { chores, loading, error, refetch } = useChores()

  // Local copy for optimistic done-toggle
  const [localChores, setLocalChores] = useState([])
  useEffect(() => { setLocalChores(chores) }, [chores])

  // Editing state
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [editAssignee, setEditAssignee] = useState(null)

  // Add-form state
  const [addingOpen, setAddingOpen] = useState(false)
  const [addTitle, setAddTitle] = useState('')
  const [addAssignee, setAddAssignee] = useState(null)

  const [busy, setBusy] = useState(false)

  // ── Helpers ──────────────────────────────────────────────

  function calendarFor(calId) {
    return calendars.find(c => c.id === calId) || null
  }

  // ── Optimistic done toggle ────────────────────────────────

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

  // ── Add chore ─────────────────────────────────────────────

  async function handleAdd() {
    const title = addTitle.trim()
    if (!title) return
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
  }

  // ── Edit chore ────────────────────────────────────────────

  function openEdit(chore) {
    setEditingId(chore.id)
    setEditTitle(chore.title)
    setEditAssignee(chore.assignee_calendar_id)
  }

  async function handleSaveEdit() {
    const title = editTitle.trim()
    if (!title) return
    setBusy(true)
    try {
      const res = await fetch(`/api/chores/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, assignee_calendar_id: editAssignee }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setEditingId(null)
      refetch()
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(choreId) {
    setBusy(true)
    try {
      await fetch(`/api/chores/${choreId}`, { method: 'DELETE' })
      setEditingId(null)
      refetch()
    } finally {
      setBusy(false)
    }
  }

  // ── Sort: undone first ────────────────────────────────────

  const sorted = [...localChores].sort((a, b) => {
    if (a.done === b.done) return 0
    return a.done ? 1 : -1
  })

  // ── Render ────────────────────────────────────────────────

  return (
    <div style={containerStyle}>

      {/* Header */}
      <div style={headerStyle}>
        <span style={{ fontSize: 20, lineHeight: 1 }}>☑</span>
        <span style={headerTitleStyle}>Family Chores</span>
      </div>

      {/* Chore list */}
      <div style={listStyle}>
        {loading && (
          <p style={emptyStyle}>Loading…</p>
        )}
        {!loading && sorted.length === 0 && (
          <p style={emptyStyle}>No chores yet — tap + Add to start.</p>
        )}
        {!loading && sorted.map(chore => (
          editingId === chore.id
            ? (
              <EditCard
                key={chore.id}
                title={editTitle}
                assignee={editAssignee}
                calendars={calendars}
                onTitleChange={setEditTitle}
                onAssigneeChange={setEditAssignee}
                onSave={handleSaveEdit}
                onDelete={() => handleDelete(chore.id)}
                onCancel={() => setEditingId(null)}
                busy={busy}
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

      {/* Add form / button */}
      <div style={footerStyle}>
        {addingOpen ? (
          <AddForm
            title={addTitle}
            assignee={addAssignee}
            calendars={calendars}
            onTitleChange={setAddTitle}
            onAssigneeChange={setAddAssignee}
            onSubmit={handleAdd}
            onCancel={() => { setAddingOpen(false); setAddTitle(''); setAddAssignee(null) }}
            busy={busy}
          />
        ) : (
          <button style={addButtonStyle} onClick={() => setAddingOpen(true)}>
            + Add chore
          </button>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ChoreCard({ chore, calendar, onToggle, onEdit }) {
  const initial = calendar ? calendar.summary[0].toUpperCase() : '•'
  const avatarBg = calendar ? calendar.backgroundColor : 'var(--color-surface-container-highest)'
  const avatarFg = calendar ? calendar.foregroundColor : 'var(--color-on-surface-variant)'

  return (
    <div style={cardStyle} onClick={onEdit} role="button" tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onEdit()}>

      {/* Coloured avatar */}
      <div style={{ ...avatarBase, background: avatarBg, color: avatarFg }}>
        {initial}
      </div>

      {/* Title + person name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-body-xl-size)',
          fontWeight: 'var(--text-body-xl-weight)',
          color: chore.done ? 'var(--color-on-surface-variant)' : 'var(--color-on-surface)',
          textDecoration: chore.done ? 'line-through' : 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {chore.title}
        </div>
        {calendar && (
          <div style={{
            fontSize: 'var(--text-label-lg-size)',
            fontWeight: 'var(--text-label-lg-weight)',
            color: 'var(--color-on-surface-variant)',
            marginTop: 2,
          }}>
            {calendar.summary}
          </div>
        )}
      </div>

      {/* Checkbox — stops propagation so tapping it doesn't open edit */}
      <div
        role="checkbox"
        aria-checked={chore.done}
        tabIndex={0}
        onClick={e => { e.stopPropagation(); onToggle(chore.id, !chore.done) }}
        onKeyDown={e => { if (e.key === ' ') { e.preventDefault(); e.stopPropagation(); onToggle(chore.id, !chore.done) } }}
        style={{
          width: 24,
          height: 24,
          borderRadius: 'var(--radius-sm)',
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
          fontSize: 16,
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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
      {/* Unassigned option */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius-full)',
          background: 'var(--color-surface-container-highest)',
          border: selected === null ? '3px solid var(--color-primary)' : '2px solid var(--color-outline-variant)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          color: 'var(--color-on-surface-variant)',
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
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-full)',
            background: cal.backgroundColor,
            border: selected === cal.id ? '3px solid var(--color-primary)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            fontWeight: 700,
            color: cal.foregroundColor,
          }}
          title={cal.summary}
          aria-label={cal.summary}
        >
          {cal.summary[0].toUpperCase()}
        </button>
      ))}
    </div>
  )
}


function AddForm({ title, assignee, calendars, onTitleChange, onAssigneeChange, onSubmit, onCancel, busy }) {
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


function EditCard({ title, assignee, calendars, onTitleChange, onAssigneeChange, onSave, onDelete, onCancel, busy }) {
  return (
    <div style={{ ...inlineFormStyle, marginBottom: 'var(--space-stack-sm)' }}>
      <input
        autoFocus
        value={title}
        onChange={e => onTitleChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
        style={inputStyle}
      />
      <AssigneePicker calendars={calendars} selected={assignee} onSelect={onAssigneeChange} />
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
  background: 'var(--color-background)',
  borderLeft: '1px solid var(--color-outline-variant)',
  fontFamily: 'var(--font-family)',
  overflow: 'hidden',
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-stack-sm)',
  padding: 'var(--space-stack-md) var(--space-gutter)',
  borderBottom: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-low)',
  flexShrink: 0,
}

const headerTitleStyle = {
  fontSize: 'var(--text-headline-md-size)',
  fontWeight: 'var(--text-headline-md-weight)',
  color: 'var(--color-on-surface)',
  lineHeight: 'var(--text-headline-md-line-height)',
}

const listStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: 'var(--space-stack-sm) var(--space-gutter)',
}

const emptyStyle = {
  color: 'var(--color-on-surface-variant)',
  fontSize: 'var(--text-body-xl-size)',
  textAlign: 'center',
  marginTop: 'var(--space-stack-lg)',
}

const cardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-stack-sm)',
  padding: 'var(--space-stack-sm) var(--space-stack-sm)',
  marginBottom: 'var(--space-stack-sm)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-surface-container-low)',
  cursor: 'pointer',
  minHeight: 'var(--space-touch-min)',
  transition: 'background 0.1s',
  outline: 'none',
}

const avatarBase = {
  width: 36,
  height: 36,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 'var(--text-headline-md-size)',
  fontWeight: 'var(--text-headline-md-weight)',
  flexShrink: 0,
  userSelect: 'none',
}

const footerStyle = {
  padding: 'var(--space-stack-sm) var(--space-gutter)',
  borderTop: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-low)',
  flexShrink: 0,
}

const addButtonStyle = {
  width: '100%',
  padding: 'var(--space-stack-sm) 0',
  minHeight: 'var(--space-touch-min)',
  background: 'transparent',
  border: '1.5px dashed var(--color-outline)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-primary)',
  fontSize: 'var(--text-body-xl-size)',
  fontWeight: 600,
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}

const inlineFormStyle = {
  background: 'var(--color-surface-container)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-stack-sm)',
}

const inputStyle = {
  width: '100%',
  padding: '8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-outline-variant)',
  background: 'var(--color-surface-container-lowest)',
  color: 'var(--color-on-surface)',
  fontSize: 'var(--text-body-xl-size)',
  fontFamily: 'var(--font-family)',
  boxSizing: 'border-box',
  marginBottom: 8,
  outline: 'none',
}

const primaryBtnStyle = {
  flex: 1,
  padding: '8px 0',
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
  padding: '8px 12px',
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
  padding: '8px 12px',
  minHeight: 44,
  background: 'transparent',
  color: 'var(--color-on-surface-variant)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: 'var(--radius-md)',
  fontSize: 'var(--text-body-xl-size)',
  fontFamily: 'var(--font-family)',
  cursor: 'pointer',
}
