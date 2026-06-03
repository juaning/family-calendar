# Calendar Display & Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `calendar_prefs` table so the kiosk shows only enabled calendars, and a gear-button picker panel in the CalendarPane so the user can toggle which calendars are visible.

**Architecture:** Backend adds a `calendar_prefs` SQLite table, seeds defaults (primary + holiday → disabled, others → enabled) during the sync loop, extends `GET /api/calendars` with an `enabled` flag, filters `GET /api/events` by enabled calendars, and exposes a new `PATCH /api/calendars/enabled` endpoint (ID in body, never in path). Frontend adds a `refetch` callback to `useCalendarData` and a gear button + scrollable settings panel to `CalendarPane` with optimistic toggle-and-revert.

**Tech Stack:** FastAPI, SQLite, Pydantic, pytest; React, FullCalendar

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/app/db.py` | Modify | Add `calendar_prefs` table to SCHEMA |
| `backend/app/services/google_calendar.py` | Modify | Include `primary` flag in `list_calendars()` return value |
| `backend/app/services/sync.py` | Modify | Seed `calendar_prefs` defaults for newly-seen calendars |
| `backend/app/routers/calendar.py` | Modify | `GET /api/calendars` + `enabled`; `GET /api/events` filter; new `PATCH /api/calendars/enabled` |
| `backend/tests/test_db.py` | Modify | Add test for new `calendar_prefs` table |
| `backend/tests/test_google_calendar.py` | Modify | Add test for `primary` flag pass-through |
| `backend/tests/test_sync.py` | Create | Tests for pref seeding defaults and re-sync preservation |
| `backend/tests/test_calendar_router.py` | Modify | Update existing tests + add tests for new behaviour |
| `frontend/src/hooks/useCalendarData.js` | Modify | Expose `refetch` callback |
| `frontend/src/components/CalendarPane.jsx` | Modify | Gear button, settings panel, optimistic toggle |

---

## Task 1: DB — add calendar_prefs table

**Files:**
- Modify: `backend/app/db.py`
- Modify: `backend/tests/test_db.py`

- [ ] **Step 1.1: Write the failing test**

Add to `backend/tests/test_db.py`:

```python
def test_init_creates_calendar_prefs_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "calendar_prefs" in tables
```

- [ ] **Step 1.2: Run test to verify it fails**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_db.py::test_init_creates_calendar_prefs_table -v
```

Expected: `FAILED` — `assert 'calendar_prefs' in {'calendars', 'events'}`

- [ ] **Step 1.3: Add the table to the schema**

In `backend/app/db.py`, append the new table to `SCHEMA` (inside the triple-quoted string, after the `events` block):

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
"""
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_db.py -v
```

Expected: all 5 tests `PASSED`

- [ ] **Step 1.5: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/db.py backend/tests/test_db.py
git commit -m "feat(db): add calendar_prefs table for enabled/disabled state"
```

---

## Task 2: google_calendar.py — include primary flag

**Files:**
- Modify: `backend/app/services/google_calendar.py`
- Modify: `backend/tests/test_google_calendar.py`

- [ ] **Step 2.1: Write the failing test**

Replace the full contents of `backend/tests/test_google_calendar.py` with:

```python
import pytest
from unittest.mock import patch, MagicMock
from app.services.google_calendar import get_service, AuthRequiredError, list_calendars


def test_get_service_raises_when_no_token_file(no_token):
    with pytest.raises(AuthRequiredError, match="python -m app.auth"):
        get_service()


def test_list_calendars_includes_primary_flag():
    mock_service = MagicMock()
    mock_service.calendarList.return_value.list.return_value.execute.return_value = {
        "items": [
            {
                "id": "user@gmail.com",
                "summary": "Personal",
                "backgroundColor": "#039be5",
                "foregroundColor": "#ffffff",
                "primary": True,
            },
            {
                "id": "en.australian#holiday@group.v.calendar.google.com",
                "summary": "Holidays in Australia",
                "backgroundColor": "#0b8043",
                "foregroundColor": "#ffffff",
            },
        ]
    }
    with patch("app.services.google_calendar.get_service", return_value=mock_service):
        result = list_calendars()

    personal = next(c for c in result if c["id"] == "user@gmail.com")
    holidays = next(c for c in result if "holiday" in c["id"])
    assert personal["primary"] is True
    assert holidays["primary"] is False
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_google_calendar.py::test_list_calendars_includes_primary_flag -v
```

Expected: `FAILED` — `KeyError: 'primary'` or `AssertionError`

- [ ] **Step 2.3: Add primary flag to list_calendars()**

In `backend/app/services/google_calendar.py`, update `list_calendars()`:

```python
def list_calendars() -> list[dict]:
    service = get_service()
    result = service.calendarList().list().execute()
    return [
        {
            "id": item["id"],
            "summary": item.get("summary", item["id"]),
            "backgroundColor": item.get("backgroundColor", "#039be5"),
            "foregroundColor": item.get("foregroundColor", "#ffffff"),
            "primary": item.get("primary", False),
        }
        for item in result.get("items", [])
    ]
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_google_calendar.py -v
```

Expected: both tests `PASSED`

- [ ] **Step 2.5: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/services/google_calendar.py backend/tests/test_google_calendar.py
git commit -m "feat(google): include primary flag in list_calendars() return value"
```

---

## Task 3: sync.py — seed calendar_prefs defaults

**Files:**
- Modify: `backend/app/services/sync.py`
- Create: `backend/tests/test_sync.py`

- [ ] **Step 3.1: Write the failing tests**

Create `backend/tests/test_sync.py`:

```python
from unittest.mock import patch
from app.services.sync import _sync_once
from app.db import get_conn


CALENDARS_FIXTURE = [
    {
        "id": "user@gmail.com",
        "summary": "Personal",
        "backgroundColor": "#039be5",
        "foregroundColor": "#ffffff",
        "primary": True,
    },
    {
        "id": "family@group.calendar.google.com",
        "summary": "Family",
        "backgroundColor": "#e67c73",
        "foregroundColor": "#ffffff",
        "primary": False,
    },
    {
        "id": "en.australian#holiday@group.v.calendar.google.com",
        "summary": "Holidays in Australia",
        "backgroundColor": "#0b8043",
        "foregroundColor": "#ffffff",
        "primary": False,
    },
]


def _run_sync(calendars=None):
    cals = calendars if calendars is not None else CALENDARS_FIXTURE
    with patch("app.services.sync.list_calendars", return_value=cals):
        with patch("app.services.sync.list_events", return_value=[]):
            _sync_once()


def test_sync_disables_primary_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("user@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 0


def test_sync_disables_holiday_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("en.australian#holiday@group.v.calendar.google.com",),
        ).fetchone()
    assert row["enabled"] == 0


def test_sync_enables_person_calendar_by_default(tmp_db):
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("family@group.calendar.google.com",),
        ).fetchone()
    assert row["enabled"] == 1


def test_sync_preserves_user_preference_on_re_sync(tmp_db):
    _run_sync()
    # User manually enables the primary calendar
    with get_conn() as conn:
        conn.execute(
            "UPDATE calendar_prefs SET enabled = 1 WHERE calendar_id = ?",
            ("user@gmail.com",),
        )
    # Second sync — must not overwrite user's choice
    _run_sync()
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("user@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 1
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_sync.py -v
```

Expected: all 4 tests `FAILED` (pref rows missing / seeding not implemented yet)

- [ ] **Step 3.3: Update _sync_once() to seed calendar_prefs**

Replace the full contents of `backend/app/services/sync.py` with:

```python
import asyncio
from datetime import datetime, timezone, timedelta
from app.db import get_conn
from app.services.google_calendar import list_calendars, list_events, AuthRequiredError
import app.config as config


async def sync_loop() -> None:
    while True:
        try:
            await asyncio.to_thread(_sync_once)
        except AuthRequiredError:
            pass  # expected until the user runs python -m app.auth
        except Exception as exc:
            print(f"[sync] error: {exc}")
        await asyncio.sleep(config.CALENDAR_SYNC_INTERVAL)


def _sync_once() -> None:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=30)).isoformat()
    end = (now + timedelta(days=90)).isoformat()

    calendars = list_calendars()

    with get_conn() as conn:
        conn.execute("DELETE FROM calendars")
        conn.executemany(
            "INSERT INTO calendars (id, summary, background_color, foreground_color, synced_at)"
            " VALUES (?, ?, ?, ?, ?)",
            [
                (c["id"], c["summary"], c["backgroundColor"], c["foregroundColor"], now.isoformat())
                for c in calendars
            ],
        )
        # Seed calendar_prefs for calendars we haven't seen before.
        # Primary and holiday calendars default to disabled; all others default to enabled.
        # Existing rows (user choices) are never overwritten.
        for c in calendars:
            existing = conn.execute(
                "SELECT 1 FROM calendar_prefs WHERE calendar_id = ?", (c["id"],)
            ).fetchone()
            if existing is None:
                is_holiday = "#holiday@group.v.calendar.google.com" in c["id"]
                enabled = 0 if (c.get("primary") or is_holiday) else 1
                conn.execute(
                    "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?, ?)",
                    (c["id"], enabled),
                )

    cal_ids = [c["id"] for c in calendars]
    events = list_events(start, end, cal_ids)

    with get_conn() as conn:
        conn.execute("DELETE FROM events")
        conn.executemany(
            "INSERT INTO events (id, calendar_id, title, start, end, all_day, synced_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    e["id"],
                    e["calendarId"],
                    e["title"],
                    e["start"],
                    e["end"],
                    int(e["allDay"]),
                    now.isoformat(),
                )
                for e in events
            ],
        )

    print(f"[sync] ok — {len(calendars)} calendars, {len(events)} events")
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_sync.py -v
```

Expected: all 4 tests `PASSED`

- [ ] **Step 3.5: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/services/sync.py backend/tests/test_sync.py
git commit -m "feat(sync): seed calendar_prefs defaults on first sync (primary+holiday disabled)"
```

---

## Task 4: GET /api/calendars — add enabled flag

**Files:**
- Modify: `backend/app/routers/calendar.py`
- Modify: `backend/tests/test_calendar_router.py`

- [ ] **Step 4.1: Write the failing tests**

Add to the bottom of `backend/tests/test_calendar_router.py`:

```python
def test_get_calendars_includes_enabled_true_when_pref_set(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?,?)",
            ("juan@gmail.com", 1),
        )
    resp = client.get("/api/calendars")
    data = resp.json()
    assert data[0]["enabled"] is True


def test_get_calendars_includes_enabled_false_when_pref_set(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?,?)",
            ("juan@gmail.com", 0),
        )
    resp = client.get("/api/calendars")
    data = resp.json()
    assert data[0]["enabled"] is False


def test_get_calendars_enabled_defaults_true_when_no_pref(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        # No calendar_prefs row
    resp = client.get("/api/calendars")
    data = resp.json()
    assert data[0]["enabled"] is True
```

- [ ] **Step 4.2: Run tests to verify they fail**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py::test_get_calendars_includes_enabled_true_when_pref_set tests/test_calendar_router.py::test_get_calendars_includes_enabled_false_when_pref_set tests/test_calendar_router.py::test_get_calendars_enabled_defaults_true_when_no_pref -v
```

Expected: all 3 `FAILED` — `KeyError: 'enabled'`

- [ ] **Step 4.3: Update get_calendars() in the router**

In `backend/app/routers/calendar.py`, replace the `get_calendars` function:

```python
@router.get("/calendars")
def get_calendars(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """
        SELECT c.id, c.summary, c.background_color, c.foreground_color,
               COALESCE(cp.enabled, 1) AS enabled
        FROM   calendars c
        LEFT   JOIN calendar_prefs cp ON c.id = cp.calendar_id
        """
    ).fetchall()
    return [
        {
            "id": r["id"],
            "summary": r["summary"],
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
            "enabled": bool(r["enabled"]),
        }
        for r in rows
    ]
```

- [ ] **Step 4.4: Run the full router test suite**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py -v
```

Expected: all existing tests still `PASSED`, 3 new tests `PASSED`

- [ ] **Step 4.5: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/routers/calendar.py backend/tests/test_calendar_router.py
git commit -m "feat(api): GET /api/calendars now includes enabled flag per calendar"
```

---

## Task 5: GET /api/events — filter by enabled calendars

**Files:**
- Modify: `backend/app/routers/calendar.py`
- Modify: `backend/tests/test_calendar_router.py`

- [ ] **Step 5.1: Write the failing tests**

Add to the bottom of `backend/tests/test_calendar_router.py`:

```python
def test_get_events_excludes_disabled_calendar(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?,?)",
            ("juan@gmail.com", 0),
        )
        conn.execute(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            ("evt1", "juan@gmail.com", "Hidden event",
             "2026-06-15T09:00:00", "2026-06-15T10:00:00", 0, "2026-06-01T00:00:00Z"),
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_events_includes_enabled_calendar(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?,?)",
            ("juan@gmail.com", 1),
        )
        conn.execute(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            ("evt1", "juan@gmail.com", "Visible event",
             "2026-06-15T09:00:00", "2026-06-15T10:00:00", 0, "2026-06-01T00:00:00Z"),
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Visible event"
```

- [ ] **Step 5.2: Run tests to verify they fail**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py::test_get_events_excludes_disabled_calendar tests/test_calendar_router.py::test_get_events_includes_enabled_calendar -v
```

Expected: `test_get_events_excludes_disabled_calendar` FAILS (returns 1 event instead of 0)

- [ ] **Step 5.3: Update get_events() to filter by enabled**

In `backend/app/routers/calendar.py`, replace the `get_events` function:

```python
@router.get("/events")
def get_events(
    start: str = Query(..., description="ISO 8601 datetime — inclusive lower bound"),
    end: str = Query(..., description="ISO 8601 datetime — exclusive upper bound"),
    db: sqlite3.Connection = Depends(get_db),
):
    cal_count = db.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    if cal_count == 0 and not Path(config.GOOGLE_TOKEN_PATH).exists():
        raise HTTPException(
            status_code=503,
            detail={"error": "auth_required", "message": "Run: python -m app.auth"},
        )

    rows = db.execute(
        """
        SELECT e.id, e.calendar_id, e.title, e.start, e.end, e.all_day,
               c.background_color, c.foreground_color
        FROM   events e
        JOIN   calendars c ON e.calendar_id = c.id
        LEFT   JOIN calendar_prefs cp ON e.calendar_id = cp.calendar_id
        WHERE  e.start >= ? AND e.start < ?
          AND  COALESCE(cp.enabled, 1) = 1
        ORDER  BY e.start
        """,
        (start, end),
    ).fetchall()

    return [
        {
            "id": r["id"],
            "calendarId": r["calendar_id"],
            "title": r["title"],
            "start": r["start"],
            "end": r["end"],
            "allDay": bool(r["all_day"]),
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
        }
        for r in rows
    ]
```

- [ ] **Step 5.4: Run the full router test suite**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py -v
```

Expected: all tests `PASSED` (existing tests pass because LEFT JOIN + COALESCE means calendars with no pref row still show their events)

- [ ] **Step 5.5: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/routers/calendar.py backend/tests/test_calendar_router.py
git commit -m "feat(api): GET /api/events filters out disabled calendars"
```

---

## Task 6: PATCH /api/calendars/enabled — new endpoint

**Files:**
- Modify: `backend/app/routers/calendar.py`
- Modify: `backend/tests/test_calendar_router.py`

- [ ] **Step 6.1: Write the failing tests**

Add to the bottom of `backend/tests/test_calendar_router.py`:

```python
def test_patch_calendar_enabled_disables_calendar(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
    resp = client.patch(
        "/api/calendars/enabled",
        json={"id": "juan@gmail.com", "enabled": False},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "juan@gmail.com"
    assert data["enabled"] is False
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("juan@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 0


def test_patch_calendar_enabled_updates_existing_pref(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?,?)",
            ("juan@gmail.com", 0),
        )
    resp = client.patch(
        "/api/calendars/enabled",
        json={"id": "juan@gmail.com", "enabled": True},
    )
    assert resp.status_code == 200
    assert resp.json()["enabled"] is True
    with get_conn() as conn:
        row = conn.execute(
            "SELECT enabled FROM calendar_prefs WHERE calendar_id = ?",
            ("juan@gmail.com",),
        ).fetchone()
    assert row["enabled"] == 1


def test_patch_calendar_enabled_handles_id_with_special_chars(client):
    cal_id = "en.australian#holiday@group.v.calendar.google.com"
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            (cal_id, "Holidays in Australia", "#0b8043", "#ffffff", "2026-06-01T00:00:00Z"),
        )
    resp = client.patch(
        "/api/calendars/enabled",
        json={"id": cal_id, "enabled": True},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == cal_id
    assert resp.json()["enabled"] is True


def test_patch_calendar_enabled_returns_404_for_unknown_id(client):
    resp = client.patch(
        "/api/calendars/enabled",
        json={"id": "ghost@gmail.com", "enabled": True},
    )
    assert resp.status_code == 404
```

- [ ] **Step 6.2: Run tests to verify they fail**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py::test_patch_calendar_enabled_disables_calendar tests/test_calendar_router.py::test_patch_calendar_enabled_updates_existing_pref tests/test_calendar_router.py::test_patch_calendar_enabled_handles_id_with_special_chars tests/test_calendar_router.py::test_patch_calendar_enabled_returns_404_for_unknown_id -v
```

Expected: all 4 `FAILED` — 404 from FastAPI (route doesn't exist yet)

- [ ] **Step 6.3: Add the PATCH endpoint to the router**

At the top of `backend/app/routers/calendar.py`, add the Pydantic import:

```python
from pydantic import BaseModel
```

Then add the model and endpoint after the `get_events` function:

```python
class CalendarToggle(BaseModel):
    id: str
    enabled: bool


@router.patch("/calendars/enabled")
def toggle_calendar_enabled(
    payload: CalendarToggle,
    db: sqlite3.Connection = Depends(get_db),
):
    cal = db.execute(
        "SELECT id, summary, background_color, foreground_color FROM calendars WHERE id = ?",
        (payload.id,),
    ).fetchone()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    db.execute(
        "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?, ?)"
        " ON CONFLICT(calendar_id) DO UPDATE SET enabled = excluded.enabled",
        (payload.id, int(payload.enabled)),
    )

    return {
        "id": cal["id"],
        "summary": cal["summary"],
        "backgroundColor": cal["background_color"],
        "foregroundColor": cal["foreground_color"],
        "enabled": payload.enabled,
    }
```

- [ ] **Step 6.4: Run the full router test suite**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/test_calendar_router.py -v
```

Expected: all tests `PASSED`

- [ ] **Step 6.5: Run all backend tests**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/ -v
```

Expected: all tests across all test files `PASSED`

- [ ] **Step 6.6: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add backend/app/routers/calendar.py backend/tests/test_calendar_router.py
git commit -m "feat(api): add PATCH /api/calendars/enabled to toggle calendar visibility"
```

---

## Task 7: useCalendarData — expose refetch callback

**Files:**
- Modify: `frontend/src/hooks/useCalendarData.js`

No automated frontend test suite — verified manually in Task 8.

- [ ] **Step 7.1: Add refetch to the return value**

Replace `frontend/src/hooks/useCalendarData.js` with:

```js
import { useState, useEffect, useCallback } from 'react'

const POLL_MS = 5 * 60 * 1000  // 5 minutes

function buildRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  const end = new Date(now.getFullYear(), now.getMonth() + 4, 1).toISOString()
  return { start, end }
}

export function useCalendarData() {
  const [calendars, setCalendars] = useState([])
  const [events, setEvents] = useState([])
  // 'loading' | 'auth_required' | 'ok' | 'error'
  const [status, setStatus] = useState('loading')

  const fetchData = useCallback(async () => {
    const { start, end } = buildRange()
    try {
      const calRes = await fetch('/api/calendars')
      if (!calRes.ok) throw new Error(`/api/calendars ${calRes.status}`)
      const cals = await calRes.json()
      setCalendars(cals)

      const evtRes = await fetch(
        `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      )
      if (evtRes.status === 503) {
        setStatus('auth_required')
        return
      }
      if (!evtRes.ok) throw new Error(`/api/events ${evtRes.status}`)
      const evts = await evtRes.json()
      setEvents(evts)
      setStatus('ok')
    } catch (err) {
      console.error('[calendar]', err)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_MS)
    return () => clearInterval(id)
  }, [fetchData])

  return { calendars, events, status, refetch: fetchData }
}
```

- [ ] **Step 7.2: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add frontend/src/hooks/useCalendarData.js
git commit -m "feat(hook): expose refetch callback from useCalendarData"
```

---

## Task 8: CalendarPane — gear button + settings panel

**Files:**
- Modify: `frontend/src/components/CalendarPane.jsx`

- [ ] **Step 8.1: Replace CalendarPane.jsx with the full implementation**

Replace the full contents of `frontend/src/components/CalendarPane.jsx` with:

```jsx
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
```

- [ ] **Step 8.2: Build and start the app**

```bash
cd /Users/juaning/Devel/family-calendar && docker compose up --build
```

Wait for both services to be healthy (watch for `[sync] ok` or `Application startup complete` in logs).

- [ ] **Step 8.3: Visual checks in browser at http://localhost:8080**

Verify each of the following:

1. **Toolbar layout:** Month/Week/Day buttons are centred; Today, `<`, `>` are on the right; there is a `⚙` button in the top-right corner that does NOT overlap any toolbar button.
2. **Panel opens:** Tapping `⚙` opens the panel with a "Calendars" header and `✕` close button.
3. **Panel scrolls:** If more than ~5 calendars, the body scrolls within `60vh`.
4. **Toggles respond immediately:** Tapping a switch flips it without waiting for the server round-trip.
5. **× closes panel; outside-tap closes panel.**
6. **Disabled calendar events disappear:** Disabling a calendar removes its events from the FullCalendar view (after the background refetch completes).
7. **Re-enable restores events.**
8. **No horizontal scroll** on the 1920×1080 layout.

- [ ] **Step 8.4: Commit**

```bash
cd /Users/juaning/Devel/family-calendar && git add frontend/src/components/CalendarPane.jsx
git commit -m "feat(ui): add calendar picker panel with gear button and optimistic toggles"
```

---

## Final verification

- [ ] **Run the full backend test suite one last time**

```bash
cd /Users/juaning/Devel/family-calendar/backend && venv/bin/pytest tests/ -v
```

Expected: all tests `PASSED`, none skipped.

- [ ] **Confirm API shapes with curl (while docker compose up is running)**

```bash
curl -s http://localhost:8000/api/calendars | python3 -m json.tool
# Expected: array of { id, summary, backgroundColor, foregroundColor, enabled }

curl -s "http://localhost:8000/api/events?start=2026-06-01T00:00:00Z&end=2026-07-01T00:00:00Z" | python3 -m json.tool
# Expected: array of { id, calendarId, title, start, end, allDay, backgroundColor, foregroundColor }
# Only events from enabled calendars appear

curl -s -X PATCH http://localhost:8000/api/calendars/enabled \
  -H "Content-Type: application/json" \
  -d '{"id":"<any_calendar_id>","enabled":false}' | python3 -m json.tool
# Expected: { id, summary, backgroundColor, foregroundColor, enabled: false }
```
