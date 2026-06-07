# Chores Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark sidebar placeholder with a fully-functional, Stitch-styled family chores panel — CRUD persisted in SQLite, colour-coded by assignee calendar, optimistic done-toggle, add/edit/delete UI.

**Architecture:** Four FastAPI endpoints (`GET/POST/PATCH/DELETE /api/chores`) backed by a new `chores` SQLite table. The frontend lifts `useCalendarData` into `App.jsx` so CalendarPane and Sidebar share one calendar list without double-fetching. A lean `useChores` hook handles chore fetch/refetch; `ChoresList.jsx` owns all chore UI with optimistic toggle, inline add form, and tap-to-edit. Assignee colour is always derived from the calendar list — never hardcoded.

**Tech Stack:** Python 3.12 / FastAPI / SQLite (stdlib sqlite3) / React 18 / Vite / CSS custom properties (tokens.css already present)

---

## File Map

| File | Change |
|------|--------|
| `backend/app/db.py` | Add `chores` table to `SCHEMA` |
| `backend/app/routers/chores.py` | **Create** — all 4 chore endpoints |
| `backend/app/main.py` | Include chores router |
| `backend/tests/test_db.py` | Add chores table creation test |
| `backend/tests/test_chores_router.py` | **Create** — full endpoint coverage |
| `frontend/src/App.jsx` | Lift `useCalendarData` here; pass data as props |
| `frontend/src/components/CalendarPane.jsx` | Accept `{ calendars, events, status, refetch }` as props |
| `frontend/src/hooks/useChores.js` | **Create** — fetch + refetch |
| `frontend/src/components/ChoresList.jsx` | **Create** — chore cards, add form, edit/delete |
| `frontend/src/components/Sidebar.jsx` | Replace placeholder; mount `ChoresList` |

---

## Task 1: Add `chores` table to DB

**Files:**
- Modify: `backend/app/db.py`
- Modify: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/test_db.py`:

```python
def test_init_creates_chores_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "chores" in tables
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
python -m pytest tests/test_db.py::test_init_creates_chores_table -v
```

Expected: `FAILED` — `assert "chores" in {'calendars', 'events', 'calendar_prefs'}`

- [ ] **Step 3: Add the chores table to the schema**

In `backend/app/db.py`, append to the `SCHEMA` string (inside the triple-quoted block, after `calendar_prefs`):

```python
SCHEMA = """
CREATE TABLE IF NOT EXISTS calendars (
    id               TEXT PRIMARY KEY,
    summary          TEXT NOT NULL,
    background_color TEXT NOT NULL,
    foreground_color TEXT NOT NULL,
    synced_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id          TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    title       TEXT NOT NULL,
    start       TEXT NOT NULL,
    end         TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (id, calendar_id)
);

CREATE TABLE IF NOT EXISTS calendar_prefs (
    calendar_id TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chores (
    id                   TEXT PRIMARY KEY,
    title                TEXT NOT NULL,
    assignee_calendar_id TEXT,
    done                 INTEGER NOT NULL DEFAULT 0,
    position             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);
"""
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend
python -m pytest tests/test_db.py::test_init_creates_chores_table -v
```

Expected: `PASSED`

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: all existing tests pass plus the new one.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat(db): add chores table to schema"
```

---

## Task 2: Chores router — GET and POST

**Files:**
- Create: `backend/app/routers/chores.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_chores_router.py` (GET and POST tests only)

- [ ] **Step 1: Write failing tests for GET and POST**

Create `backend/tests/test_chores_router.py`:

```python
import pytest
from app.db import get_conn


def test_list_chores_empty(client):
    resp = client.get("/api/chores")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_chore_minimal(client):
    resp = client.post("/api/chores", json={"title": "Walk the dog"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Walk the dog"
    assert data["done"] is False
    assert data["assignee_calendar_id"] is None
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data


def test_create_chore_with_assignee(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01"),
        )
    resp = client.post(
        "/api/chores",
        json={"title": "Dishes", "assignee_calendar_id": "juan@gmail.com"},
    )
    assert resp.status_code == 201
    assert resp.json()["assignee_calendar_id"] == "juan@gmail.com"


def test_create_chore_missing_title_returns_422(client):
    resp = client.post("/api/chores", json={})
    assert resp.status_code == 422


def test_list_chores_returns_all_created(client):
    client.post("/api/chores", json={"title": "Task A"})
    client.post("/api/chores", json={"title": "Task B"})
    resp = client.get("/api/chores")
    assert resp.status_code == 200
    titles = [c["title"] for c in resp.json()]
    assert "Task A" in titles
    assert "Task B" in titles


def test_list_chores_ordered_by_position_then_created(client):
    client.post("/api/chores", json={"title": "First"})
    client.post("/api/chores", json={"title": "Second"})
    client.post("/api/chores", json={"title": "Third"})
    chores = client.get("/api/chores").json()
    titles = [c["title"] for c in chores]
    assert titles == ["First", "Second", "Third"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_chores_router.py -v
```

Expected: all `FAILED` — `404 Not Found` (router not registered yet)

- [ ] **Step 3: Create the chores router**

Create `backend/app/routers/chores.py`:

```python
import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.deps import get_db

router = APIRouter(prefix="/api")


class ChoreCreate(BaseModel):
    title: str
    assignee_calendar_id: str | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "assignee_calendar_id": row["assignee_calendar_id"],
        "done": bool(row["done"]),
        "position": row["position"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("/chores")
def list_chores(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT * FROM chores ORDER BY position ASC, created_at ASC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/chores", status_code=201)
def create_chore(payload: ChoreCreate, db: sqlite3.Connection = Depends(get_db)):
    next_pos = db.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM chores"
    ).fetchone()[0]
    chore_id = str(uuid.uuid4())
    now = _now()
    db.execute(
        """
        INSERT INTO chores (id, title, assignee_calendar_id, done, position, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (chore_id, payload.title, payload.assignee_calendar_id, next_pos, now, now),
    )
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _row_to_dict(row)
```

- [ ] **Step 4: Register the router in main.py**

In `backend/app/main.py`, add after the calendar router import/include:

```python
from app.routers.chores import router as chores_router
```

And after `app.include_router(calendar_router)`:

```python
app.include_router(chores_router)
```

The full `main.py` after the change:

```python
import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.services.sync import sync_loop
from app.routers.calendar import router as calendar_router
from app.routers.chores import router as chores_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not os.getenv("TESTING"):
        task = asyncio.create_task(sync_loop())
    else:
        task = None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Family Calendar API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calendar_router)
app.include_router(chores_router)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Run the GET and POST tests to verify they pass**

```bash
cd backend
python -m pytest tests/test_chores_router.py::test_list_chores_empty \
                 tests/test_chores_router.py::test_create_chore_minimal \
                 tests/test_chores_router.py::test_create_chore_with_assignee \
                 tests/test_chores_router.py::test_create_chore_missing_title_returns_422 \
                 tests/test_chores_router.py::test_list_chores_returns_all_created \
                 tests/test_chores_router.py::test_list_chores_ordered_by_position_then_created \
                 -v
```

Expected: all 6 `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/chores.py backend/app/main.py backend/tests/test_chores_router.py
git commit -m "feat(api): add GET and POST /api/chores endpoints"
```

---

## Task 3: Chores router — PATCH and DELETE

**Files:**
- Modify: `backend/app/routers/chores.py`
- Modify: `backend/tests/test_chores_router.py`

- [ ] **Step 1: Write failing tests for PATCH and DELETE**

Append to `backend/tests/test_chores_router.py`:

```python
def test_patch_chore_done(client):
    chore_id = client.post("/api/chores", json={"title": "Do laundry"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"done": True})
    assert resp.status_code == 200
    assert resp.json()["done"] is True


def test_patch_chore_title(client):
    chore_id = client.post("/api/chores", json={"title": "Old title"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"title": "New title"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New title"


def test_patch_chore_clear_assignee(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01"),
        )
    chore_id = client.post(
        "/api/chores",
        json={"title": "Task", "assignee_calendar_id": "juan@gmail.com"},
    ).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={"assignee_calendar_id": None})
    assert resp.status_code == 200
    assert resp.json()["assignee_calendar_id"] is None


def test_patch_chore_not_found(client):
    resp = client.patch("/api/chores/no-such-id", json={"done": True})
    assert resp.status_code == 404


def test_patch_empty_body_returns_422(client):
    chore_id = client.post("/api/chores", json={"title": "X"}).json()["id"]
    resp = client.patch(f"/api/chores/{chore_id}", json={})
    assert resp.status_code == 422


def test_delete_chore(client):
    chore_id = client.post("/api/chores", json={"title": "Delete me"}).json()["id"]
    del_resp = client.delete(f"/api/chores/{chore_id}")
    assert del_resp.status_code == 204
    remaining_ids = [c["id"] for c in client.get("/api/chores").json()]
    assert chore_id not in remaining_ids


def test_delete_chore_not_found(client):
    resp = client.delete("/api/chores/no-such-id")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
python -m pytest tests/test_chores_router.py::test_patch_chore_done \
                 tests/test_chores_router.py::test_delete_chore \
                 -v
```

Expected: `FAILED` — `405 Method Not Allowed` (routes don't exist yet)

- [ ] **Step 3: Add PATCH and DELETE endpoints to the router**

In `backend/app/routers/chores.py`, add after `create_chore`:

```python
class ChoreUpdate(BaseModel):
    done: bool | None = None
    title: str | None = None
    assignee_calendar_id: str | None = None


@router.patch("/chores/{chore_id}")
def update_chore(
    chore_id: str,
    payload: ChoreUpdate,
    db: sqlite3.Connection = Depends(get_db),
):
    if not db.execute("SELECT 1 FROM chores WHERE id = ?", (chore_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Chore not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    set_clauses = []
    params = []
    if "done" in updates:
        set_clauses.append("done = ?")
        params.append(int(updates["done"]))
    if "title" in updates:
        set_clauses.append("title = ?")
        params.append(updates["title"])
    if "assignee_calendar_id" in updates:
        set_clauses.append("assignee_calendar_id = ?")
        params.append(updates["assignee_calendar_id"])  # None → SQL NULL

    set_clauses.append("updated_at = ?")
    params.append(_now())
    params.append(chore_id)

    db.execute(
        f"UPDATE chores SET {', '.join(set_clauses)} WHERE id = ?",
        params,
    )
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _row_to_dict(row)


@router.delete("/chores/{chore_id}", status_code=204)
def delete_chore(chore_id: str, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM chores WHERE id = ?", (chore_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Chore not found")
    db.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
```

- [ ] **Step 4: Run all chores router tests**

```bash
cd backend
python -m pytest tests/test_chores_router.py -v
```

Expected: all 13 tests `PASSED`

- [ ] **Step 5: Run full test suite**

```bash
cd backend
python -m pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/chores.py backend/tests/test_chores_router.py
git commit -m "feat(api): add PATCH and DELETE /api/chores/{id} endpoints"
```

---

## Task 4: Lift `useCalendarData` into `App.jsx`

Sharing the calendar list between CalendarPane (for event display and picker) and Sidebar (for assignee colour lookup) without double-fetching.

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/CalendarPane.jsx`

- [ ] **Step 1: Rewrite `App.jsx` to call `useCalendarData` and pass props down**

```jsx
// frontend/src/App.jsx
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
```

- [ ] **Step 2: Update `CalendarPane.jsx` to accept props instead of calling the hook**

Change the first line of the component from:

```jsx
export default function CalendarPane() {
  const { events, calendars, status, refetch } = useCalendarData()
```

To:

```jsx
export default function CalendarPane({ calendars, events, status, refetch }) {
```

And remove the `useCalendarData` import entirely — the line:

```jsx
import { useCalendarData } from '../hooks/useCalendarData'
```

is no longer needed in CalendarPane.jsx.

- [ ] **Step 3: Verify the app still works**

```bash
docker compose up --build -d
```

Open `http://localhost:8080` — the calendar should display exactly as before (no visual change). Check the browser console for errors. There should be none.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/CalendarPane.jsx
git commit -m "refactor(frontend): lift useCalendarData to App.jsx, pass as props"
```

---

## Task 5: `useChores` hook

**Files:**
- Create: `frontend/src/hooks/useChores.js`

- [ ] **Step 1: Create the hook**

```js
// frontend/src/hooks/useChores.js
import { useState, useEffect, useCallback } from 'react'

export function useChores() {
  const [chores, setChores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchChores = useCallback(async () => {
    try {
      const res = await fetch('/api/chores')
      if (!res.ok) throw new Error(`/api/chores ${res.status}`)
      setChores(await res.json())
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchChores()
  }, [fetchChores])

  return { chores, loading, error, refetch: fetchChores }
}
```

- [ ] **Step 2: Smoke-test the hook by temporarily importing it in Sidebar.jsx**

Temporarily add to `frontend/src/components/Sidebar.jsx`:

```jsx
import { useChores } from '../hooks/useChores'

export default function Sidebar({ calendars }) {
  const { chores, loading } = useChores()
  return (
    <div style={{ padding: 16, color: 'var(--color-on-surface)', fontFamily: 'var(--font-family)' }}>
      {loading ? 'Loading…' : `${chores.length} chores`}
    </div>
  )
}
```

```bash
docker compose up --build -d
```

Open `http://localhost:8080` — the sidebar should show "0 chores" (or N if you already added chores via curl). Check the Network tab: `GET /api/chores` should return `200 []`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useChores.js frontend/src/components/Sidebar.jsx
git commit -m "feat(hook): add useChores hook and smoke-test Sidebar"
```

---

## Task 6: `ChoresList` component and Sidebar wire-up

**Files:**
- Create: `frontend/src/components/ChoresList.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`

This task replaces the placeholder with the full Stitch-styled chores panel.

- [ ] **Step 1: Create `ChoresList.jsx`**

```jsx
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
```

- [ ] **Step 2: Update `Sidebar.jsx` to mount ChoresList**

```jsx
// frontend/src/components/Sidebar.jsx
import ChoresList from './ChoresList'

export default function Sidebar({ calendars }) {
  return <ChoresList calendars={calendars} />
}
```

- [ ] **Step 3: Build and verify**

```bash
docker compose up --build -d
```

Open `http://localhost:8080`. Verify:
- Sidebar shows "Family Chores" header with ☑ icon on warm off-white background
- "+ Add chore" dashed button at the bottom
- No JavaScript errors in the browser console

- [ ] **Step 4: Add a chore via the UI**

Tap "+ Add chore", type a title, pick an assignee dot, tap "Add". Verify:
- Chore card appears with a coloured circular avatar
- Person name shown below the chore title
- Checkbox on the right is unchecked

- [ ] **Step 5: Toggle the checkbox**

Tap the checkbox on a chore. Verify:
- Checkbox fills green immediately (optimistic)
- Title gets a strikethrough and dims
- Chore sinks to the bottom of the list

- [ ] **Step 6: Verify persistence across restart**

```bash
docker compose down
docker compose up -d
```

Open `http://localhost:8080`. Verify all chores you added are still present and their done states are preserved.

- [ ] **Step 7: Tap a card to edit, then delete it**

Tap any chore card (not the checkbox). Verify:
- Inline edit form appears with current title pre-filled and current assignee pre-selected
- "Save", "Delete", "Cancel" buttons all have ≥ 44px tap height
- Tap "Delete" removes the chore
- Tap "Cancel" restores the card view

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChoresList.jsx frontend/src/components/Sidebar.jsx
git commit -m "feat(ui): add Stitch-styled ChoresList sidebar with CRUD and optimistic toggle"
```

---

## Self-Review

### Spec coverage check

| Requirement | Covered by |
|-------------|-----------|
| `chores` table with uuid, title, assignee_calendar_id, done, position, created_at, updated_at | Task 1 |
| GET /api/chores — list ordered by position/created | Task 2 |
| POST /api/chores — create with title + optional assignee | Task 2 |
| PATCH /api/chores/{id} — update done/title/assignee | Task 3 |
| DELETE /api/chores/{id} — delete | Task 3 |
| Chore ID is our own UUID — safe in path | Task 2/3 |
| assignee_calendar_id in request body, not path | Task 2/3 |
| Persist to SQLite; survive restart | Task 1, verified in Task 6 step 6 |
| Calendar colour as single source of truth; no hardcoding | Task 4 lifts calendars to App; Task 6 derives colour from prop |
| Optimistic done-toggle with revert on failure | Task 6 — `handleToggle` |
| "Family Chores" header + ☑ icon | Task 6 — `headerStyle` + icon |
| Coloured circular avatar with person initial | Task 6 — `ChoreCard` + `avatarBase` |
| Title + person name on card | Task 6 — `ChoreCard` |
| Checkbox: rounded square, green when checked (tertiary token) | Task 6 — `var(--color-tertiary)` |
| Done items: strikethrough + de-emphasis + sink to bottom | Task 6 — `sorted` array + `textDecoration: line-through` |
| "+ Add" inline form with title + assignee picker | Task 6 — `AddForm` + `AssigneePicker` |
| Edit / delete per chore; 44px+ touch targets | Task 6 — `EditCard` + `minHeight: 44` |
| Tokens.css variables throughout — no hardcoded values | Task 6 — all style objects use `var(--...)` |
| `docker compose up` keeps working; no new env vars | All tasks |
| arm64 target; no new build steps | No new deps added |
| deploy/ and secrets untouched | ✓ |

### Placeholder scan — none found

All steps contain actual code, commands, and expected outputs.

### Type/name consistency — verified

- `_row_to_dict` defined in Task 2, used in Task 2 and 3 ✓
- `_now()` defined in Task 2, used in Task 2 and 3 ✓
- `ChoreCreate` defined in Task 2, `ChoreUpdate` defined in Task 3 — separate models, no overlap ✓
- `useChores` exported from `hooks/useChores.js`, imported in `ChoresList.jsx` ✓
- `ChoresList` exported from `components/ChoresList.jsx`, imported in `Sidebar.jsx` ✓
- All `calendars` prop threading: App → Sidebar → ChoresList ✓
