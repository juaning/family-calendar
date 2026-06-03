# Phase 1 — Calendar Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read events from multiple Google Calendars (one per family member), cache them in SQLite, and display them colour-coded in a FullCalendar day/week/month view that fills the left 70% of a 1920×1080 landscape screen.

**Architecture:** FastAPI backend holds all Google OAuth logic, fetches from Google on a background timer (default 5 min), and writes to SQLite. The REST API serves only from cache, so the display keeps working when the internet hiccups. The React frontend polls the API and passes events to FullCalendar as a static array; each event carries the colour from its owning calendar. No to-dos, chores, or photo slideshow in this slice.

**Tech Stack:** Python 3.12+, FastAPI, google-auth / google-auth-oauthlib / google-api-python-client, SQLite, pytest; React 18, Vite 5, FullCalendar v6, Docker Compose linux/arm64.

---

## File Map

```
backend/
├── requirements.txt                   MODIFY — add google packages
├── app/
│   ├── config.py                      MODIFY — add Google + DB vars
│   ├── db.py                          CREATE — SQLite schema, init, connection CM
│   ├── deps.py                        CREATE — FastAPI Depends(get_db)
│   ├── auth.py                        CREATE — one-time OAuth CLI (python -m app.auth)
│   ├── main.py                        MODIFY — lifespan, include router
│   ├── routers/
│   │   ├── __init__.py                CREATE — empty
│   │   └── calendar.py                CREATE — GET /api/calendars, GET /api/events
│   └── services/
│       ├── __init__.py                CREATE — empty
│       ├── google_calendar.py         CREATE — API wrapper, AuthRequiredError
│       └── sync.py                    CREATE — background refresh loop
└── tests/
    ├── conftest.py                    MODIFY — shared fixtures, TESTING env flag
    ├── test_db.py                     CREATE — schema tests
    ├── test_google_calendar.py        CREATE — AuthRequiredError test
    └── test_calendar_router.py        CREATE — endpoint tests (no Google API calls)

frontend/
├── package.json                       MODIFY — add FullCalendar packages
└── src/
    ├── App.jsx                        MODIFY — 70/30 layout
    ├── components/
    │   ├── CalendarPane.jsx           CREATE — FullCalendar + view switcher
    │   └── Sidebar.jsx                CREATE — empty placeholder
    └── hooks/
        └── useCalendarData.js         CREATE — fetch calendars + events, poll

SETUP-google.md                        CREATE — human setup guide (root of repo)
.env.example                           MODIFY — add DB_PATH + CALENDAR_SYNC_INTERVAL_SECONDS
```

---

## Task 1: Update `requirements.txt` and `config.py`

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/config.py`

- [ ] **Step 1: Update `backend/requirements.txt`**

Replace the entire file:

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-dotenv==1.0.1
httpx==0.27.0
pytest==8.3.0
google-auth==2.35.0
google-auth-oauthlib==1.2.1
google-api-python-client==2.151.0
```

- [ ] **Step 2: Replace `backend/app/config.py`**

```python
import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
TZ = os.getenv("TZ", "UTC")

GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "/app/secrets/credentials.json")
GOOGLE_TOKEN_PATH = os.getenv("GOOGLE_TOKEN_PATH", "/app/secrets/token.json")
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]

DB_PATH = os.getenv("DB_PATH", "app/data/calendar.db")
CALENDAR_SYNC_INTERVAL = int(os.getenv("CALENDAR_SYNC_INTERVAL_SECONDS", "300"))
```

- [ ] **Step 3: Install new packages into the local venv**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate   # or the venv path on this machine
pip install -r requirements.txt
```

Expected: `google-auth`, `google-auth-oauthlib`, `google-api-python-client` installed with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/app/config.py
git commit -m "feat: add Google Calendar dependencies and config vars"
```

---

## Task 2: `db.py` and `deps.py`

**Files:**
- Create: `backend/app/db.py`
- Create: `backend/app/deps.py`

- [ ] **Step 1: Create `backend/app/db.py`**

```python
import sqlite3
import contextlib
from pathlib import Path
import app.config as config

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
"""


def init_db() -> None:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)


@contextlib.contextmanager
def get_conn():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

- [ ] **Step 2: Create `backend/app/deps.py`**

```python
from app.db import get_conn


def get_db():
    """FastAPI dependency: yields an open, committed SQLite connection."""
    with get_conn() as conn:
        yield conn
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/db.py backend/app/deps.py
git commit -m "feat: add SQLite schema and FastAPI DB dependency"
```

---

## Task 3: DB tests (TDD)

**Files:**
- Modify: `backend/tests/conftest.py`
- Create: `backend/tests/test_db.py`

- [ ] **Step 1: Write the failing test — replace `backend/tests/conftest.py`**

```python
import os
import pytest
import app.config as config
from app.db import init_db

# Prevent the sync background task from starting when TestClient runs the lifespan
os.environ.setdefault("TESTING", "1")


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    return db_file


@pytest.fixture
def no_token(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_TOKEN_PATH", str(tmp_path / "no_token.json"))


@pytest.fixture
def client(tmp_db, no_token):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
```

- [ ] **Step 2: Create `backend/tests/test_db.py`**

```python
from app.db import get_conn


def test_init_creates_calendars_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "calendars" in tables


def test_init_creates_events_table(tmp_db):
    with get_conn() as conn:
        tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "events" in tables


def test_get_conn_commits_on_success(tmp_db):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("id1", "Cal", "#fff", "#000", "2026-01-01"),
        )
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    assert count == 1


def test_get_conn_rolls_back_on_error(tmp_db):
    try:
        with get_conn() as conn:
            conn.execute(
                "INSERT INTO calendars VALUES (?,?,?,?,?)",
                ("id1", "Cal", "#fff", "#000", "2026-01-01"),
            )
            raise RuntimeError("simulated error")
    except RuntimeError:
        pass
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    assert count == 0
```

- [ ] **Step 3: Run tests to confirm they fail (db.py not yet wired to main)**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate
pytest tests/test_db.py -v
```

Expected at this stage: tests pass (db.py is complete) or fail with import errors if config is missing. Fix import errors before moving on.

- [ ] **Step 4: Run all tests to ensure nothing regressed**

```bash
pytest tests/ -v
```

Expected: `test_health_returns_ok` + all 4 db tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_db.py
git commit -m "test: add DB schema tests and TESTING env guard"
```

---

## Task 4: Google Calendar service

**Files:**
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/google_calendar.py`
- Create: `backend/tests/test_google_calendar.py`

- [ ] **Step 1: Write the failing test first — create `backend/tests/test_google_calendar.py`**

```python
import pytest
from app.services.google_calendar import get_service, AuthRequiredError


def test_get_service_raises_when_no_token_file(no_token):
    with pytest.raises(AuthRequiredError, match="python -m app.auth"):
        get_service()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate
pytest tests/test_google_calendar.py -v
```

Expected: `ModuleNotFoundError` or `ImportError` (service doesn't exist yet).

- [ ] **Step 3: Create `backend/app/services/__init__.py`** (empty)

- [ ] **Step 4: Create `backend/app/services/google_calendar.py`**

```python
from pathlib import Path
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import app.config as config


class AuthRequiredError(Exception):
    pass


def get_service():
    token_path = Path(config.GOOGLE_TOKEN_PATH)
    if not token_path.exists():
        raise AuthRequiredError(
            f"No token found at {config.GOOGLE_TOKEN_PATH}. Run: python -m app.auth"
        )
    creds = Credentials.from_authorized_user_file(str(token_path), config.GOOGLE_SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        token_path.write_text(creds.to_json())
    return build("calendar", "v3", credentials=creds)


def list_calendars() -> list[dict]:
    service = get_service()
    result = service.calendarList().list().execute()
    return [
        {
            "id": item["id"],
            "summary": item.get("summary", item["id"]),
            "backgroundColor": item.get("backgroundColor", "#039be5"),
            "foregroundColor": item.get("foregroundColor", "#ffffff"),
        }
        for item in result.get("items", [])
    ]


def list_events(start: str, end: str, calendar_ids: list[str]) -> list[dict]:
    service = get_service()
    all_events: list[dict] = []
    for cal_id in calendar_ids:
        items = (
            service.events()
            .list(
                calendarId=cal_id,
                timeMin=start,
                timeMax=end,
                singleEvents=True,
                orderBy="startTime",
            )
            .execute()
            .get("items", [])
        )
        for item in items:
            s = item["start"]
            e = item["end"]
            all_day = "date" in s and "dateTime" not in s
            all_events.append(
                {
                    "id": item["id"],
                    "calendarId": cal_id,
                    "title": item.get("summary", "(no title)"),
                    "start": s.get("dateTime", s.get("date")),
                    "end": e.get("dateTime", e.get("date")),
                    "allDay": all_day,
                }
            )
    return all_events
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pytest tests/test_google_calendar.py -v
```

Expected: `PASSED tests/test_google_calendar.py::test_get_service_raises_when_no_token_file`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/ backend/tests/test_google_calendar.py
git commit -m "feat: add Google Calendar service with AuthRequiredError"
```

---

## Task 5: One-time OAuth auth module

**Files:**
- Create: `backend/app/auth.py`

This module is invoked directly on the host (not inside Docker) as `python -m app.auth` to perform the one-time browser consent flow. It reads `credentials.json` and writes `token.json` to the paths specified by env vars.

- [ ] **Step 1: Create `backend/app/auth.py`**

```python
"""
One-time Google OAuth consent flow.

Usage (from the backend/ directory, with venv activated):
    GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \
    GOOGLE_TOKEN_PATH=../secrets/token.json \
    python -m app.auth

The browser will open. After granting consent, token.json is written.
Copy token.json to the Pi's secrets/ directory via scp (never via git).
"""
from pathlib import Path
from google_auth_oauthlib.flow import InstalledAppFlow
import app.config as config


def main() -> None:
    cred_path = Path(config.GOOGLE_CREDENTIALS_PATH)
    if not cred_path.exists():
        print(f"ERROR: credentials.json not found at {config.GOOGLE_CREDENTIALS_PATH}")
        print("Download it from Google Cloud Console → APIs & Services → Credentials")
        raise SystemExit(1)

    flow = InstalledAppFlow.from_client_secrets_file(str(cred_path), config.GOOGLE_SCOPES)
    creds = flow.run_local_server(port=0)

    token_path = Path(config.GOOGLE_TOKEN_PATH)
    token_path.parent.mkdir(parents=True, exist_ok=True)
    token_path.write_text(creds.to_json())
    print(f"✓ Token saved to {config.GOOGLE_TOKEN_PATH}")
    print("Copy this file to the Pi's secrets/ directory. Never commit it.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/auth.py
git commit -m "feat: add one-time OAuth auth module (python -m app.auth)"
```

---

## Task 6: Background sync service

**Files:**
- Create: `backend/app/services/sync.py`

- [ ] **Step 1: Create `backend/app/services/sync.py`**

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
    # Fetch a window that matches the frontend's display range
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

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/sync.py
git commit -m "feat: add background sync loop for Google Calendar cache"
```

---

## Task 7: Calendar router and tests

**Files:**
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/routers/calendar.py`
- Create: `backend/tests/test_calendar_router.py`

- [ ] **Step 1: Write the failing tests — create `backend/tests/test_calendar_router.py`**

```python
from app.db import get_conn


def test_get_calendars_returns_empty_list(client):
    resp = client.get("/api/calendars")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_calendars_returns_seeded_data(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
    resp = client.get("/api/calendars")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "juan@gmail.com"
    assert data[0]["summary"] == "Juan"
    assert data[0]["backgroundColor"] == "#039be5"
    assert data[0]["foregroundColor"] == "#ffffff"


def test_get_events_returns_503_when_no_auth(client):
    # empty calendars table + no token file → 503
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 503
    body = resp.json()
    assert body["detail"]["error"] == "auth_required"


def test_get_events_returns_events_with_colour(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.execute(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            (
                "evt1",
                "juan@gmail.com",
                "Team meeting",
                "2026-06-15T09:00:00",
                "2026-06-15T10:00:00",
                0,
                "2026-06-01T00:00:00Z",
            ),
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    evt = data[0]
    assert evt["title"] == "Team meeting"
    assert evt["calendarId"] == "juan@gmail.com"
    assert evt["start"] == "2026-06-15T09:00:00"
    assert evt["allDay"] is False
    assert evt["backgroundColor"] == "#039be5"
    assert evt["foregroundColor"] == "#ffffff"


def test_get_events_filters_by_date_range(client):
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO calendars VALUES (?,?,?,?,?)",
            ("juan@gmail.com", "Juan", "#039be5", "#ffffff", "2026-06-01T00:00:00Z"),
        )
        conn.executemany(
            "INSERT INTO events VALUES (?,?,?,?,?,?,?)",
            [
                ("in_range", "juan@gmail.com", "In-range", "2026-06-15T09:00:00", "2026-06-15T10:00:00", 0, "2026-06-01"),
                ("out_of_range", "juan@gmail.com", "Out-of-range", "2026-07-01T09:00:00", "2026-07-01T10:00:00", 0, "2026-06-01"),
            ],
        )
    resp = client.get("/api/events?start=2026-06-01T00:00:00Z&end=2026-06-30T23:59:59Z")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == "in_range"
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate
pytest tests/test_calendar_router.py -v
```

Expected: fails because the router doesn't exist yet.

- [ ] **Step 3: Create `backend/app/routers/__init__.py`** (empty)

- [ ] **Step 4: Create `backend/app/routers/calendar.py`**

```python
import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from app.deps import get_db
import app.config as config

router = APIRouter(prefix="/api")


@router.get("/calendars")
def get_calendars(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, summary, background_color, foreground_color FROM calendars"
    ).fetchall()
    return [
        {
            "id": r["id"],
            "summary": r["summary"],
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
        }
        for r in rows
    ]


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
        WHERE  e.start >= ? AND e.start < ?
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

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_calendar_router.py -v
```

Expected: all 5 router tests pass. If any fail, check that the router isn't registered in `main.py` yet — the `client` fixture in conftest uses `app.main.app`, and the router must be included there (Task 8). Skip forward to Task 8 briefly if needed, then come back and verify.

Note: tests will still fail until Task 8 wires the router into `main.py`. Accept this and move on — Task 8 will make them green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/ backend/tests/test_calendar_router.py
git commit -m "feat: add calendar router (GET /api/calendars, GET /api/events)"
```

---

## Task 8: Update `main.py` — lifespan + router

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Replace `backend/app/main.py`**

```python
import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.services.sync import sync_loop
from app.routers.calendar import router as calendar_router


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


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate
pytest tests/ -v
```

Expected: all tests pass, including the 5 router tests that were written in Task 7.

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: wire lifespan (DB init + sync loop) and calendar router into main"
```

---

## Task 9: Update `.env.example` and create `SETUP-google.md`

**Files:**
- Modify: `.env.example`
- Create: `SETUP-google.md` (at repo root)

- [ ] **Step 1: Update `.env.example`** — add two new vars under the Google Calendar block:

```
TZ=Australia/Brisbane
FRONTEND_PORT=8080
BACKEND_PORT=8000

# Google Calendar — Phase 1 setup required
# GOOGLE_CREDENTIALS_PATH and GOOGLE_TOKEN_PATH are paths INSIDE the Docker container
# (mounted from host via docker-compose volumes)
GOOGLE_CREDENTIALS_PATH=/app/secrets/credentials.json
GOOGLE_TOKEN_PATH=/app/secrets/token.json

# How often to re-fetch from Google (seconds). Default 300 = 5 min.
CALENDAR_SYNC_INTERVAL_SECONDS=300

# SQLite database location inside the container
DB_PATH=/app/data/calendar.db

# Photos (Phase 1)
ICLOUD_SHARED_ALBUM_URL=
SLIDESHOW_IDLE_SECONDS=120
SLIDESHOW_INTERVAL_SECONDS=8

# AI intake (Phase 2 — leave blank)
ANTHROPIC_API_KEY=
IMAP_HOST=
IMAP_USER=
IMAP_PASSWORD=
```

Also update `.env` on disk to match (copy from `.env.example`).

- [ ] **Step 2: Create `SETUP-google.md`** at repo root

```markdown
# Google Calendar Setup

One-time steps to connect the calendar display to Google Calendar.
Run these on your **Mac**, then copy the resulting token to the Pi.

---

## Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com).
2. Create a new project (e.g. "Family Calendar").
3. In the left menu go to **APIs & Services → Library**.
4. Search for **Google Calendar API** and click **Enable**.

---

## Step 2 — Create an OAuth client

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Desktop app**.
4. Name it anything (e.g. "Family Calendar Pi").
5. Click **Create**, then **Download JSON**.
6. Rename the downloaded file to `credentials.json` and place it in `secrets/`:

```bash
mv ~/Downloads/client_secret_*.json secrets/credentials.json
```

---

## Step 3 — Configure the consent screen (IMPORTANT — read this)

If your OAuth app stays in **"Testing"** status, refresh tokens for Calendar scopes
**silently expire after 7 days**, forcing constant re-authorisation. This will break
the Pi calendar within a week.

Fix:
1. Go to **APIs & Services → OAuth consent screen**.
2. Under **Publishing status**, click **Publish App** → confirm.
   (External + In Production is fine for a private personal app; Google does not review it.)
3. You may need to add your Google account as a test user first, then publish.

---

## Step 4 — Add family member calendars

Each family member should have their own Google Calendar (so events are colour-coded).

1. In [Google Calendar](https://calendar.google.com), create one calendar per person.
2. Give each calendar a distinct colour.
3. Share each calendar with the Google account you'll use on the Pi
   (or use the same account for all).
4. The `/api/calendars` endpoint will list all calendars visible to that account.

---

## Step 5 — Run the one-time auth flow

Run from the `backend/` directory with the venv active:

```bash
cd family-calendar/backend
source venv/bin/activate
GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \
GOOGLE_TOKEN_PATH=../secrets/token.json \
python -m app.auth
```

Your browser will open. Sign in with the Google account that owns the calendars.
Grant the requested permissions.

After consent, `secrets/token.json` is written. Verify:

```bash
ls -la secrets/token.json   # should exist and be non-empty
```

---

## Step 6 — Verify locally

```bash
# In backend/ with venv active
GOOGLE_CREDENTIALS_PATH=../secrets/credentials.json \
GOOGLE_TOKEN_PATH=../secrets/token.json \
DB_PATH=../backend/app/data/calendar.db \
uvicorn app.main:app --reload
```

In a second terminal:
```bash
curl http://localhost:8000/api/calendars
# Should return a JSON array of your calendars with colours
```

---

## Step 7 — Copy secrets to the Pi

**Never commit `credentials.json` or `token.json` to git.**

Copy them to the Pi via scp:

```bash
scp secrets/credentials.json pi@<PI_IP>:~/family-calendar/secrets/
scp secrets/token.json        pi@<PI_IP>:~/family-calendar/secrets/
```

Replace `pi` with your actual username and `<PI_IP>` with the Pi's IP address.

The Pi's `docker-compose.yml` mounts `./secrets:/app/secrets:ro`, so the
container will find the files automatically.

---

## Token refresh

The app auto-refreshes the token on every API call if it's expired.
Because the consent screen is set to "In Production" (Step 3), the refresh
token never expires — no re-auth needed on the Pi.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example SETUP-google.md
git commit -m "docs: add SETUP-google.md and update .env.example with DB_PATH and sync interval"
```

---

## Task 10: Frontend — FullCalendar packages and `useCalendarData` hook

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/hooks/useCalendarData.js`

- [ ] **Step 1: Update `frontend/package.json`** — add FullCalendar to dependencies

Replace the `"dependencies"` block:

```json
{
  "name": "family-calendar-frontend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@fullcalendar/core": "^6.1.15",
    "@fullcalendar/react": "^6.1.15",
    "@fullcalendar/daygrid": "^6.1.15",
    "@fullcalendar/timegrid": "^6.1.15",
    "@fullcalendar/interaction": "^6.1.15"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Install the packages**

```bash
cd /path/to/family-calendar/frontend
npm install
```

Expected: lock file updated, `@fullcalendar/*` packages appear in `node_modules/`.

- [ ] **Step 3: Verify the build still works**

```bash
npm run build
```

Expected: build succeeds, no errors.

- [ ] **Step 4: Create `frontend/src/hooks/useCalendarData.js`**

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

      const evtRes = await fetch(`/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
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

  return { calendars, events, status }
}
```

- [ ] **Step 5: Commit**

```bash
cd /path/to/family-calendar
git add frontend/package.json frontend/package-lock.json frontend/src/hooks/useCalendarData.js
git commit -m "feat: add FullCalendar packages and useCalendarData hook"
```

---

## Task 11: Frontend — `CalendarPane`, `Sidebar`, and updated `App.jsx`

**Files:**
- Create: `frontend/src/components/CalendarPane.jsx`
- Create: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Create `frontend/src/components/Sidebar.jsx`**

```jsx
export default function Sidebar() {
  return (
    <div style={{
      height: '100%',
      background: '#1e293b',
      borderLeft: '1px solid #334155',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#475569',
      fontFamily: 'system-ui, sans-serif',
      fontSize: '1.1rem',
    }}>
      Sidebar — Phase 2
    </div>
  )
}
```

- [ ] **Step 2: Create `frontend/src/components/CalendarPane.jsx`**

```jsx
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

// Kiosk-friendly overrides for 1920×1080 readability from a few feet away
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
```

- [ ] **Step 3: Replace `frontend/src/App.jsx`**

```jsx
import CalendarPane from './components/CalendarPane'
import Sidebar from './components/Sidebar'

export default function App() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0f172a',
      overflow: 'hidden',
    }}>
      <div style={{ flex: '0 0 70%', height: '100%', minWidth: 0, overflow: 'hidden' }}>
        <CalendarPane />
      </div>
      <div style={{ flex: '0 0 30%', height: '100%' }}>
        <Sidebar />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify the frontend build succeeds**

```bash
cd /path/to/family-calendar/frontend
npm run build
```

Expected: build completes with no errors. The bundle will be larger now (FullCalendar included).

- [ ] **Step 5: Commit**

```bash
cd /path/to/family-calendar
git add frontend/src/components/CalendarPane.jsx \
        frontend/src/components/Sidebar.jsx \
        frontend/src/App.jsx
git commit -m "feat: add CalendarPane (FullCalendar) and 70/30 layout"
```

---

## Task 12: Integration verification

This task has no new code. It verifies the whole stack works end-to-end and confirms no secrets are tracked.

- [ ] **Step 1: Update `.env` on disk with new vars**

```bash
cp /path/to/family-calendar/.env.example /path/to/family-calendar/.env
```

Also add local dev overrides to `.env` (do NOT commit):
```
DB_PATH=./backend/app/data/calendar.db
```

- [ ] **Step 2: Clean build**

```bash
cd /path/to/family-calendar
docker compose down --rmi all --volumes 2>/dev/null || true
docker compose up --build -d
```

Wait ~20 seconds.

- [ ] **Step 3: Verify health endpoint**

```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 4: Verify calendars endpoint — auth_required state**

```bash
curl http://localhost:8080/api/calendars
# Expected: [] (empty — no token yet, but endpoint works)

curl http://localhost:8080/api/events?start=2026-06-01T00:00:00Z\&end=2026-06-30T23:59:59Z
# Expected: {"detail":{"error":"auth_required","message":"Run: python -m app.auth"}}
```

- [ ] **Step 5: Verify frontend renders**

```bash
open http://localhost:8080
```

Expected: the 70/30 layout with FullCalendar on the left showing the current month (dark theme, empty — no auth yet) and "Sidebar — Phase 2" placeholder on the right. The calendar should show an "authorisation needed" message.

- [ ] **Step 6: Verify secrets are not tracked**

```bash
git status
# Must NOT list secrets.json, token.json, or .env
git check-ignore -v secrets/credentials.json secrets/token.json .env
# Each file must show it is ignored
```

- [ ] **Step 7: Run full backend test suite**

```bash
cd /path/to/family-calendar/backend
source venv/bin/activate
pytest tests/ -v
```

Expected output:
```
PASSED tests/test_main.py::test_health_returns_ok
PASSED tests/test_db.py::test_init_creates_calendars_table
PASSED tests/test_db.py::test_init_creates_events_table
PASSED tests/test_db.py::test_get_conn_commits_on_success
PASSED tests/test_db.py::test_get_conn_rolls_back_on_error
PASSED tests/test_google_calendar.py::test_get_service_raises_when_no_token_file
PASSED tests/test_calendar_router.py::test_get_calendars_returns_empty_list
PASSED tests/test_calendar_router.py::test_get_calendars_returns_seeded_data
PASSED tests/test_calendar_router.py::test_get_events_returns_503_when_no_auth
PASSED tests/test_calendar_router.py::test_get_events_returns_events_with_colour
PASSED tests/test_calendar_router.py::test_get_events_filters_by_date_range
11 passed
```

- [ ] **Step 8: Stop compose**

```bash
cd /path/to/family-calendar
docker compose down
```

- [ ] **Step 9: Push**

```bash
git push origin master
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| google-auth / google-auth-oauthlib / google-api-python-client | Task 1 |
| OAuth scope `https://www.googleapis.com/auth/calendar` | Task 1 (config), Task 5 (auth.py) |
| Read credentials from GOOGLE_CREDENTIALS_PATH, persist token at GOOGLE_TOKEN_PATH | Task 4, Task 5 |
| `python -m app.auth` one-time local-server flow | Task 5 |
| Auto-refresh token on expiry | Task 4 (get_service) |
| GET /api/calendars → id, summary, backgroundColor, foregroundColor | Task 7 |
| GET /api/events?start=&end= → events with calendarId + colour | Task 7 |
| Cache in SQLite, refresh on background interval (default 5 min) | Tasks 2, 6 |
| Serve from cache (local-first, survives network blip) | Task 7 (reads only from SQLite) |
| Graceful 503 when no token | Task 7, tests in Task 7 |
| FullCalendar month/week/day views with view switcher | Task 11 |
| Per-calendar colours from /api/calendars | Task 11 (CalendarPane maps colours) |
| 70/30 layout, calendar in left 70% | Task 11 (App.jsx) |
| Right 30% sidebar placeholder | Task 11 (Sidebar.jsx) |
| Poll /api/events periodically | Task 10 (useCalendarData, 5-min interval) |
| Loading + error + auth_required states | Task 11 (CalendarPane) |
| Sized for 1920×1080 kiosk readability | Task 11 (calendarCss overrides) |
| SETUP-google.md with full human steps | Task 9 |
| "In Production" consent screen warning | Task 9 (Step 3 in SETUP-google.md) |
| `token.json` is a secret — copy via scp | Task 9 (Step 7 in SETUP-google.md) |
| .env.example updated with new vars | Task 9 |
| Secrets never committed | gitignore already covers these; Task 12 verifies |
| `docker compose up` still works | Task 12 |

### Placeholder scan
No TBD/TODO/fill-in. All code blocks are complete and self-contained.

### Type consistency
- `AuthRequiredError` defined in `google_calendar.py` (Task 4), imported in `sync.py` (Task 6) — consistent.
- `get_conn` defined in `db.py` (Task 2), imported in `deps.py` (Task 2) and `sync.py` (Task 6) and tests — consistent.
- `sync_loop` defined in `sync.py` (Task 6), imported in `main.py` (Task 8) — consistent.
- `calendar_router` defined in `routers/calendar.py` (Task 7), imported in `main.py` (Task 8) — consistent.
- `useCalendarData` returns `{calendars, events, status}` (Task 10), destructured in `CalendarPane.jsx` (Task 11) — consistent.
- Event shape: `{id, calendarId, title, start, end, allDay, backgroundColor, foregroundColor}` from router (Task 7), consumed in `CalendarPane.jsx` (Task 11) — consistent.
