# Idle Photo Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an idle-triggered full-screen photo slideshow that fades in after inactivity, cycles locally-cached photos from a pluggable source (iCloud Shared Album first), and dismisses on any touch/click — working offline from local cache.

**Architecture:** A `PhotoSource` ABC (`fetch_remote_refs` / `download` / `is_configured`) drives a `PhotoService` that owns the SQLite `photos` table and on-disk JPEG cache; a background asyncio loop refreshes on `SLIDESHOW_REFRESH_SECONDS`. The frontend fetches timing from `GET /api/config` at runtime (no Vite build-time vars), uses `useIdle` / `usePhotos` hooks, and renders a `Slideshow.jsx` fixed overlay with CSS opacity crossfade and a localized-gradient clock. Build order is Phase A (idle UX only, no photos) → Phase B (placeholder photo cycling) → Phase C (real backend pipeline) → Phase D (iCloud integration).

**Tech Stack:** Python 3.14 / FastAPI / SQLite / httpx (already installed) / pytest + pytest-asyncio (add) — backend. React / Vite — frontend (no test framework; verify in browser).

**Spec:** `docs/superpowers/specs/2026-06-05-slideshow-design.md`

---

## File Map

### New backend files
| File | Responsibility |
|------|---------------|
| `backend/app/routers/config.py` | `GET /api/config` — serves slideshow timing from env |
| `backend/app/routers/photos.py` | `GET /api/photos`, `GET /api/photos/{id}` |
| `backend/app/services/photo_sources/__init__.py` | package marker |
| `backend/app/services/photo_sources/base.py` | `PhotoSource` ABC + `RemotePhotoRef` |
| `backend/app/services/photo_sources/icloud_shared_album.py` | `ICloudSharedAlbumSource` |
| `backend/app/services/photo_sources/syncthing_folder.py` | stub |
| `backend/app/services/photo_service.py` | `PhotoService`, `photo_refresh_loop` |
| `backend/app/static/placeholder/` | 3 small test PNGs committed to repo |
| `backend/scripts/test_icloud.py` | Phase D standalone iCloud smoke-test |
| `backend/tests/test_config_router.py` | tests for `/api/config` |
| `backend/tests/test_photos_router.py` | tests for `/api/photos*` |
| `backend/tests/test_photo_sources.py` | ABC contract + iCloud unit tests |
| `backend/tests/test_photo_service.py` | PhotoService refresh/prune/list tests |

### Modified backend files
| File | Change |
|------|--------|
| `backend/app/config.py` | Add 5 slideshow vars |
| `backend/app/db.py` | Add `photos` table to schema |
| `backend/app/deps.py` | Add `get_photo_service` dependency |
| `backend/app/main.py` | Register routers, create service on `app.state`, start refresh loop |
| `backend/requirements.txt` | Add `pytest-asyncio` |
| `.env.example` | Add `SLIDESHOW_REFRESH_SECONDS`, `PHOTO_CACHE_DIR`, `PHOTO_SOURCE` |

### New frontend files
| File | Responsibility |
|------|---------------|
| `frontend/src/hooks/useConfig.js` | Fetch `/api/config`; safe defaults while loading |
| `frontend/src/hooks/useIdle.js` | Idle timer + document event listeners |
| `frontend/src/hooks/usePhotos.js` | Fetch `/api/photos`; re-fetch every 5 min |
| `frontend/src/components/Slideshow.jsx` | Full-screen overlay, clock, crossfade |

### Modified frontend files
| File | Change |
|------|--------|
| `frontend/src/App.jsx` | Integrate `useConfig`, `useIdle`, `usePhotos`, `<Slideshow>` |
| `frontend/src/styles/tokens.css` | Add `--slideshow-*` tokens |

---

## Task 1 — Backend: config vars + GET /api/config

**Files:**
- Modify: `backend/app/config.py`
- Modify: `.env.example`
- Create: `backend/app/routers/config.py`
- Modify: `backend/app/main.py`
- Modify: `backend/requirements.txt`
- Create: `backend/tests/test_config_router.py`

- [ ] **Step 1.1 — Add `pytest-asyncio` to requirements**

  ```
  # backend/requirements.txt — append:
  pytest-asyncio==0.23.8
  ```

  Then install in the venv:
  ```bash
  cd backend && pip install pytest-asyncio==0.23.8
  ```

- [ ] **Step 1.2 — Write the failing test**

  Create `backend/tests/test_config_router.py`:

  ```python
  def test_config_returns_slideshow_fields(client):
      r = client.get("/api/config")
      assert r.status_code == 200
      data = r.json()
      assert isinstance(data.get("slideshow_idle_seconds"), int)
      assert isinstance(data.get("slideshow_interval_seconds"), int)
      assert data["slideshow_idle_seconds"] > 0
      assert data["slideshow_interval_seconds"] > 0
  ```

- [ ] **Step 1.3 — Run test, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_config_router.py -v
  ```
  Expected: `FAILED` — 404 because the route doesn't exist yet.

- [ ] **Step 1.4 — Add slideshow config vars**

  Add to the bottom of `backend/app/config.py`:

  ```python
  ICLOUD_SHARED_ALBUM_URL    = os.getenv("ICLOUD_SHARED_ALBUM_URL", "")
  SLIDESHOW_IDLE_SECONDS     = int(os.getenv("SLIDESHOW_IDLE_SECONDS", "120"))
  SLIDESHOW_INTERVAL_SECONDS = int(os.getenv("SLIDESHOW_INTERVAL_SECONDS", "8"))
  SLIDESHOW_REFRESH_SECONDS  = int(os.getenv("SLIDESHOW_REFRESH_SECONDS", "3600"))
  PHOTO_CACHE_DIR            = os.getenv("PHOTO_CACHE_DIR", "/app/data/photos")
  PHOTO_SOURCE               = os.getenv("PHOTO_SOURCE", "icloud")
  ```

- [ ] **Step 1.5 — Create the config router**

  Create `backend/app/routers/config.py`:

  ```python
  from fastapi import APIRouter
  import app.config as config

  router = APIRouter()

  @router.get("/api/config")
  def get_config():
      return {
          "slideshow_idle_seconds": config.SLIDESHOW_IDLE_SECONDS,
          "slideshow_interval_seconds": config.SLIDESHOW_INTERVAL_SECONDS,
      }
  ```

- [ ] **Step 1.6 — Register config router in main.py**

  Add to `backend/app/main.py` (after existing router imports):

  ```python
  from app.routers.config import router as config_router
  ```

  And after `app.include_router(chores_router)`:

  ```python
  app.include_router(config_router)
  ```

- [ ] **Step 1.7 — Run test, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_config_router.py -v
  ```
  Expected: `PASSED`.

- [ ] **Step 1.8 — Update .env.example**

  Add to `.env.example` (in the `# Photos` section, replacing the existing placeholder lines):

  ```
  # Photos
  ICLOUD_SHARED_ALBUM_URL=
  SLIDESHOW_IDLE_SECONDS=120
  SLIDESHOW_INTERVAL_SECONDS=8
  SLIDESHOW_REFRESH_SECONDS=3600
  PHOTO_CACHE_DIR=/app/data/photos
  PHOTO_SOURCE=icloud
  ```

- [ ] **Step 1.9 — Run full test suite to check no regressions**

  ```bash
  cd backend && python -m pytest -v
  ```
  Expected: all existing tests still pass.

- [ ] **Step 1.10 — Commit**

  ```bash
  git add backend/app/config.py backend/app/routers/config.py backend/app/main.py \
          backend/requirements.txt backend/tests/test_config_router.py .env.example
  git commit -m "feat(api): add GET /api/config serving slideshow timing from env"
  ```

---

## Task 2 — Frontend: useConfig + useIdle hooks

**Files:**
- Create: `frontend/src/hooks/useConfig.js`
- Create: `frontend/src/hooks/useIdle.js`

Frontend has no automated test runner. Verification is in the browser (see step 2.4).

- [ ] **Step 2.1 — Create useConfig.js**

  Create `frontend/src/hooks/useConfig.js`:

  ```js
  import { useState, useEffect } from 'react'

  const DEFAULTS = { idleMs: 120_000, intervalMs: 8_000 }

  export function useConfig() {
    const [config, setConfig] = useState(DEFAULTS)

    useEffect(() => {
      fetch('/api/config')
        .then(r => r.json())
        .then(data => setConfig({
          idleMs: (data.slideshow_idle_seconds ?? 120) * 1000,
          intervalMs: (data.slideshow_interval_seconds ?? 8) * 1000,
        }))
        .catch(() => {})  // keep defaults on error
    }, [])

    return config
  }
  ```

- [ ] **Step 2.2 — Create useIdle.js**

  Create `frontend/src/hooks/useIdle.js`:

  ```js
  import { useState, useEffect, useRef, useCallback } from 'react'

  export function useIdle(idleMs) {
    const [isIdle, setIsIdle] = useState(false)
    const timer = useRef(null)

    const reset = useCallback(() => {
      setIsIdle(false)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setIsIdle(true), idleMs)
    }, [idleMs])

    useEffect(() => {
      const events = ['pointermove', 'pointerdown', 'touchstart', 'keydown']
      events.forEach(e => document.addEventListener(e, reset, { passive: true }))
      reset()  // start the timer immediately
      return () => {
        events.forEach(e => document.removeEventListener(e, reset))
        clearTimeout(timer.current)
      }
    }, [reset])

    return { isIdle, resetIdle: reset }
  }
  ```

- [ ] **Step 2.3 — Smoke-check in browser console**

  Start the dev server:
  ```bash
  cd frontend && npm run dev
  ```

  Open the browser console and paste:
  ```js
  // These modules aren't directly importable from the console,
  // but you can verify /api/config responds correctly:
  fetch('/api/config').then(r=>r.json()).then(console.log)
  ```
  Expected: `{ slideshow_idle_seconds: 120, slideshow_interval_seconds: 8 }` (or whatever is in .env).

- [ ] **Step 2.4 — Commit**

  ```bash
  git add frontend/src/hooks/useConfig.js frontend/src/hooks/useIdle.js
  git commit -m "feat(hooks): add useConfig (runtime timing from /api/config) and useIdle"
  ```

---

## Task 3 — Frontend: Slideshow.jsx empty state + tokens (Phase A)

**Files:**
- Create: `frontend/src/components/Slideshow.jsx`
- Modify: `frontend/src/styles/tokens.css`

This task delivers the empty-state (clock screensaver) only — no photos yet.

- [ ] **Step 3.1 — Add slideshow tokens**

  Add to the bottom of `frontend/src/styles/tokens.css`:

  ```css
  /* ── Slideshow ───────────────────────────────────────────── */
  --slideshow-overlay-bg:        rgba(0, 0, 0, 0.20);
  --slideshow-empty-bg:          var(--color-inverse-surface);  /* #303030 */
  --slideshow-clock-size:        72px;
  --slideshow-clock-weight:      300;
  --slideshow-clock-tracking:    -0.02em;
  --slideshow-date-size:         20px;
  --slideshow-hint-size:         14px;
  --slideshow-text-shadow:       0 2px 8px rgba(0, 0, 0, 0.60);
  --slideshow-fade-duration:     0.7s;
  --slideshow-photo-crossfade:   1s;
  ```

- [ ] **Step 3.2 — Create Slideshow.jsx (empty state)**

  Create `frontend/src/components/Slideshow.jsx`:

  ```jsx
  import { useState, useEffect, useRef } from 'react'

  function useClock() {
    const [now, setNow] = useState(new Date())
    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 60_000)
      return () => clearInterval(id)
    }, [])
    return now
  }

  function fmt(date) {
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const day  = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    return { time, day }
  }

  export default function Slideshow({ isIdle, onWake, photos = [], intervalMs = 8_000 }) {
    const now = useClock()
    const { time, day } = fmt(now)
    const hasPhotos = photos.length > 0

    return (
      <div
        onClick={onWake}
        onTouchStart={onWake}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          opacity: isIdle ? 1 : 0,
          pointerEvents: isIdle ? 'auto' : 'none',
          transition: `opacity var(--slideshow-fade-duration) ease`,
          background: hasPhotos ? 'transparent' : 'var(--slideshow-empty-bg)',
          overflow: 'hidden',
        }}
      >
        {/* flat scrim when photos are present */}
        {hasPhotos && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'var(--slideshow-overlay-bg)',
            zIndex: 1,
          }} />
        )}

        {/* clock + date */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          {/* gradient behind clock for legibility over any photo */}
          <div style={{
            padding: '40px 60px',
            background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.35) 60%, transparent)',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 'var(--slideshow-clock-size)',
              fontWeight: 'var(--slideshow-clock-weight)',
              letterSpacing: 'var(--slideshow-clock-tracking)',
              color: '#ffffff',
              textShadow: 'var(--slideshow-text-shadow)',
              fontFamily: 'var(--font-family)',
            }}>{time}</div>
            <div style={{
              fontSize: 'var(--slideshow-date-size)',
              fontWeight: 400,
              color: '#ffffff',
              opacity: 0.9,
              marginTop: 12,
              textShadow: 'var(--slideshow-text-shadow)',
              fontFamily: 'var(--font-family)',
            }}>{day}</div>
          </div>
        </div>

        {/* bottom gradient + wake hint */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '20%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.40), transparent)',
          zIndex: 2,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 32,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 'var(--slideshow-hint-size)',
            color: '#ffffff',
            opacity: 0.7,
            textShadow: 'var(--slideshow-text-shadow)',
            fontFamily: 'var(--font-family)',
          }}>Tap anywhere to wake</span>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 3.3 — Commit**

  ```bash
  git add frontend/src/components/Slideshow.jsx frontend/src/styles/tokens.css
  git commit -m "feat(ui): add Slideshow component — empty state with clock/date overlay"
  ```

---

## Task 4 — Frontend: wire App.jsx (Phase A complete)

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 4.1 — Update App.jsx**

  Replace the contents of `frontend/src/App.jsx` with:

  ```jsx
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
  ```

  Note: `usePhotos` doesn't exist yet — create a stub now so the import doesn't crash:

  Create `frontend/src/hooks/usePhotos.js` (stub, replaced in Task 6):

  ```js
  export function usePhotos() {
    return { photos: [] }
  }
  ```

- [ ] **Step 4.2 — Phase A manual verification**

  With backend running (`docker compose up` or `uvicorn`) and frontend dev server running:

  1. Open the app in the browser at `http://localhost:8080`.
  2. Stop touching the mouse/keyboard. After `SLIDESHOW_IDLE_SECONDS` seconds (default 120 — set to 5 in .env for testing: `SLIDESHOW_IDLE_SECONDS=5`), the dark overlay with clock and date should fade in smoothly (~0.7s).
  3. Confirm the time and date are correct.
  4. Click or touch anywhere. The overlay should fade out and the calendar board should be visible and interactive.
  5. Verify the overlay does not intercept board interactions while hidden (pointer-events: none).

  Restore `SLIDESHOW_IDLE_SECONDS=120` in .env when satisfied.

- [ ] **Step 4.3 — Commit**

  ```bash
  git add frontend/src/App.jsx frontend/src/hooks/usePhotos.js
  git commit -m "feat(ui): wire Slideshow into App.jsx — Phase A idle UX complete"
  ```

---

## Task 5 — Backend: placeholder images + /api/photos stub (Phase B)

**Files:**
- Create: `backend/app/static/placeholder/` (3 PNG files committed to repo)
- Create: `backend/app/routers/photos.py` (stub)
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_photos_router.py`

- [ ] **Step 5.1 — Generate 3 placeholder PNG images**

  Run this script from the repo root (pure Python, no Pillow needed):

  ```bash
  python3 - <<'EOF'
  import struct, zlib, os

  def png(r, g, b, w=640, h=360):
      raw = b''.join(b'\x00' + bytes([r, g, b] * w) for _ in range(h))
      def chunk(t, d):
          return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
      return (b'\x89PNG\r\n\x1a\n'
              + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
              + chunk(b'IDAT', zlib.compress(raw))
              + chunk(b'IEND', b''))

  os.makedirs('backend/app/static/placeholder', exist_ok=True)
  for name, color in [('img1.png', (70, 130, 180)),   # steel blue
                      ('img2.png', (34, 139, 34)),     # forest green
                      ('img3.png', (178, 34, 34))]:    # firebrick red
      with open(f'backend/app/static/placeholder/{name}', 'wb') as f:
          f.write(png(*color))
  print("Created 3 placeholder images in backend/app/static/placeholder/")
  EOF
  ```

  Confirm the files are ~1–5 KB each:
  ```bash
  ls -lh backend/app/static/placeholder/
  ```

- [ ] **Step 5.2 — Write failing tests**

  Create `backend/tests/test_photos_router.py`:

  ```python
  def test_list_photos_returns_list(client):
      r = client.get("/api/photos")
      assert r.status_code == 200
      assert isinstance(r.json(), list)


  def test_get_photo_unknown_id_returns_404(client):
      r = client.get("/api/photos/nonexistent-id")
      assert r.status_code == 404
  ```

- [ ] **Step 5.3 — Run tests, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_photos_router.py -v
  ```
  Expected: both `FAILED` — 404 because route doesn't exist.

- [ ] **Step 5.4 — Create the stub photos router**

  Create `backend/app/routers/photos.py`:

  ```python
  from fastapi import APIRouter, HTTPException
  from fastapi.responses import FileResponse
  from pathlib import Path

  router = APIRouter()

  # Phase B stub: serve static placeholder images.
  # Replaced in Task 11 with real PhotoService-backed routes.
  _PLACEHOLDER_DIR = Path(__file__).parent.parent / "static" / "placeholder"
  _PLACEHOLDERS = [
      {"id": "img1", "url": "/api/photos/img1"},
      {"id": "img2", "url": "/api/photos/img2"},
      {"id": "img3", "url": "/api/photos/img3"},
  ]
  _PLACEHOLDER_FILES = {
      "img1": _PLACEHOLDER_DIR / "img1.png",
      "img2": _PLACEHOLDER_DIR / "img2.png",
      "img3": _PLACEHOLDER_DIR / "img3.png",
  }


  @router.get("/api/photos")
  def list_photos():
      return _PLACEHOLDERS


  @router.get("/api/photos/{photo_id}")
  def get_photo(photo_id: str):
      path = _PLACEHOLDER_FILES.get(photo_id)
      if path is None or not path.exists():
          raise HTTPException(status_code=404)
      return FileResponse(path)
  ```

- [ ] **Step 5.5 — Register photos router in main.py**

  Add to `backend/app/main.py`:

  ```python
  from app.routers.photos import router as photos_router
  ```

  And after `app.include_router(config_router)`:

  ```python
  app.include_router(photos_router)
  ```

- [ ] **Step 5.6 — Run tests, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photos_router.py -v
  ```
  Expected: both `PASSED`.

- [ ] **Step 5.7 — Run full suite**

  ```bash
  cd backend && python -m pytest -v
  ```
  Expected: all pass.

- [ ] **Step 5.8 — Commit**

  ```bash
  git add backend/app/routers/photos.py backend/app/main.py \
          backend/app/static/placeholder/ \
          backend/tests/test_photos_router.py
  git commit -m "feat(api): add /api/photos stub with 3 placeholder images for Phase B"
  ```

---

## Task 6 — Frontend: usePhotos + photo crossfade in Slideshow (Phase B complete)

**Files:**
- Modify: `frontend/src/hooks/usePhotos.js` (replace stub)
- Modify: `frontend/src/components/Slideshow.jsx`

- [ ] **Step 6.1 — Replace usePhotos stub with real implementation**

  Replace `frontend/src/hooks/usePhotos.js`:

  ```js
  import { useState, useEffect } from 'react'

  const REFRESH_MS = 5 * 60 * 1000  // 5 minutes — independent of photo advance interval

  export function usePhotos() {
    const [photos, setPhotos] = useState([])

    function load() {
      fetch('/api/photos')
        .then(r => r.json())
        .then(data => setPhotos(Array.isArray(data) ? data : []))
        .catch(() => setPhotos([]))
    }

    useEffect(() => {
      load()
      const id = setInterval(load, REFRESH_MS)
      return () => clearInterval(id)
    }, [])

    return { photos }
  }
  ```

- [ ] **Step 6.2 — Add photo crossfade to Slideshow.jsx**

  Replace the full contents of `frontend/src/components/Slideshow.jsx`:

  ```jsx
  import { useState, useEffect, useRef, useCallback } from 'react'

  function useClock() {
    const [now, setNow] = useState(new Date())
    useEffect(() => {
      const id = setInterval(() => setNow(new Date()), 60_000)
      return () => clearInterval(id)
    }, [])
    return now
  }

  function fmt(date) {
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const day  = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
    return { time, day }
  }

  function PhotoCrossfade({ photos, intervalMs }) {
    const [current, setCurrent] = useState(0)
    const [next, setNext]       = useState(1 % photos.length)
    const [showNext, setShowNext] = useState(false)
    const tickRef = useRef(null)

    const advance = useCallback(() => {
      const nextIdx = (current + 1) % photos.length
      setNext(nextIdx)
      setShowNext(false)

      // give React a tick to apply the new src before triggering the swap
      requestAnimationFrame(() => setShowNext(false))
    }, [current, photos.length])

    function onSettled() {
      // called by onLoad or onError on the next img — swap and schedule
      setShowNext(true)
      tickRef.current = setTimeout(() => {
        setCurrent(c => (c + 1) % photos.length)
        setShowNext(false)
      }, intervalMs)
    }

    useEffect(() => {
      if (photos.length < 2) return
      tickRef.current = setTimeout(advance, intervalMs)
      return () => clearTimeout(tickRef.current)
    }, [current, photos.length, intervalMs, advance])

    useEffect(() => () => clearTimeout(tickRef.current), [])

    if (photos.length === 0) return null

    const imgStyle = {
      position: 'absolute', inset: 0,
      width: '100%', height: '100%',
      objectFit: 'cover',
    }

    return (
      <>
        <img
          src={photos[current]?.url}
          alt=""
          style={{ ...imgStyle, opacity: showNext ? 0 : 1, transition: `opacity var(--slideshow-photo-crossfade) ease`, zIndex: 0 }}
        />
        <img
          key={photos[next]?.url}
          src={photos[next]?.url}
          alt=""
          style={{ ...imgStyle, opacity: showNext ? 1 : 0, transition: `opacity var(--slideshow-photo-crossfade) ease`, zIndex: 0 }}
          onLoad={onSettled}
          onError={onSettled}
        />
      </>
    )
  }

  export default function Slideshow({ isIdle, onWake, photos = [], intervalMs = 8_000 }) {
    const now = useClock()
    const { time, day } = fmt(now)
    const hasPhotos = photos.length > 0

    return (
      <div
        onClick={onWake}
        onTouchStart={onWake}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          opacity: isIdle ? 1 : 0,
          pointerEvents: isIdle ? 'auto' : 'none',
          transition: `opacity var(--slideshow-fade-duration) ease`,
          background: hasPhotos ? 'transparent' : 'var(--slideshow-empty-bg)',
          overflow: 'hidden',
        }}
      >
        {/* photo layer */}
        {hasPhotos && <PhotoCrossfade photos={photos} intervalMs={intervalMs} />}

        {/* flat scrim */}
        {hasPhotos && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--slideshow-overlay-bg)', zIndex: 1 }} />
        )}

        {/* clock + date */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 3,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '40px 60px',
            background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.35) 60%, transparent)',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 'var(--slideshow-clock-size)',
              fontWeight: 'var(--slideshow-clock-weight)',
              letterSpacing: 'var(--slideshow-clock-tracking)',
              color: '#ffffff',
              textShadow: 'var(--slideshow-text-shadow)',
              fontFamily: 'var(--font-family)',
            }}>{time}</div>
            <div style={{
              fontSize: 'var(--slideshow-date-size)',
              fontWeight: 400,
              color: '#ffffff',
              opacity: 0.9,
              marginTop: 12,
              textShadow: 'var(--slideshow-text-shadow)',
              fontFamily: 'var(--font-family)',
            }}>{day}</div>
          </div>
        </div>

        {/* bottom gradient + hint */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: '20%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.40), transparent)',
          zIndex: 2,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          paddingBottom: 32,
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: 'var(--slideshow-hint-size)',
            color: '#ffffff',
            opacity: 0.7,
            textShadow: 'var(--slideshow-text-shadow)',
            fontFamily: 'var(--font-family)',
          }}>Tap anywhere to wake</span>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 6.3 — Phase B manual verification**

  With backend and frontend running (set `SLIDESHOW_IDLE_SECONDS=5` temporarily):

  1. Let the screen go idle. The overlay should fade in.
  2. Confirm the 3 placeholder photos cycle every `SLIDESHOW_INTERVAL_SECONDS` seconds (default 8) with a smooth 1s crossfade between them.
  3. To test the `onError` / 404-skip path: temporarily add a fourth entry to `_PLACEHOLDERS` in `photos.py` with `"id": "broken"` and `"url": "/api/photos/broken"`. Reload. The slideshow should skip the missing photo without freezing.
  4. Touch anywhere — overlay dismisses, board is interactive.

- [ ] **Step 6.4 — Commit**

  ```bash
  git add frontend/src/hooks/usePhotos.js frontend/src/components/Slideshow.jsx
  git commit -m "feat(ui): add photo crossfade to Slideshow with onLoad/onError skip — Phase B complete"
  ```

---

## Task 7 — Backend: photos table + PhotoSource ABC

**Files:**
- Modify: `backend/app/db.py`
- Create: `backend/app/services/photo_sources/__init__.py`
- Create: `backend/app/services/photo_sources/base.py`
- Create: `backend/tests/test_photo_sources.py`

- [ ] **Step 7.1 — Write failing test for the ABC contract**

  Create `backend/tests/test_photo_sources.py`:

  ```python
  import asyncio
  import pytest
  from pathlib import Path
  from app.services.photo_sources.base import PhotoSource, RemotePhotoRef


  class _WorkingSource(PhotoSource):
      def is_configured(self): return True
      async def fetch_remote_refs(self): return [RemotePhotoRef(id="abc")]
      async def download(self, ref, dest): dest.write_bytes(b"fake-image-data")


  def test_remote_photo_ref_has_id():
      ref = RemotePhotoRef(id="guid-123")
      assert ref.id == "guid-123"


  def test_concrete_source_fetch_refs():
      src = _WorkingSource()
      refs = asyncio.run(src.fetch_remote_refs())
      assert refs == [RemotePhotoRef(id="abc")]


  def test_concrete_source_download(tmp_path):
      src = _WorkingSource()
      dest = tmp_path / "out.jpg"
      asyncio.run(src.download(RemotePhotoRef(id="abc"), dest))
      assert dest.read_bytes() == b"fake-image-data"


  def test_abstract_source_cannot_be_instantiated():
      with pytest.raises(TypeError):
          PhotoSource()
  ```

- [ ] **Step 7.2 — Run test, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py -v
  ```
  Expected: `FAILED` — `ImportError` because the module doesn't exist.

- [ ] **Step 7.3 — Add photos table to db.py**

  In `backend/app/db.py`, add to the `SCHEMA` string (inside the triple-quoted block, after the `chores` table `);`):

  ```sql

  CREATE TABLE IF NOT EXISTS photos (
      id          TEXT PRIMARY KEY,
      local_path  TEXT NOT NULL,
      cached_at   TEXT NOT NULL
  );
  ```

- [ ] **Step 7.4 — Create the photo_sources package**

  Create `backend/app/services/photo_sources/__init__.py` (empty):
  ```bash
  touch backend/app/services/photo_sources/__init__.py
  ```

- [ ] **Step 7.5 — Create PhotoSource ABC**

  Create `backend/app/services/photo_sources/base.py`:

  ```python
  from abc import ABC, abstractmethod
  from dataclasses import dataclass
  from pathlib import Path


  @dataclass(frozen=True)
  class RemotePhotoRef:
      id: str  # stable GUID from source — NO signed URL (short-lived)


  class PhotoSource(ABC):
      @abstractmethod
      def is_configured(self) -> bool: ...

      @abstractmethod
      async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
          """Return current set of stable photo IDs from the remote source."""
          ...

      @abstractmethod
      async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
          """Download ref to dest. Re-resolve signed URLs immediately before
          streaming bytes. Prefer smallest JPEG >= 1920px wide; skip HEIC."""
          ...
  ```

- [ ] **Step 7.6 — Run test, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py -v
  ```
  Expected: all `PASSED`.

- [ ] **Step 7.7 — Confirm photos table is created**

  ```bash
  cd backend && python3 -c "
  from app.db import init_db, get_conn
  import app.config as config
  config.DB_PATH = '/tmp/test_photos.db'
  init_db()
  with get_conn() as conn:
      rows = conn.execute(\"SELECT name FROM sqlite_master WHERE type='table'\").fetchall()
      print([r['name'] for r in rows])
  "
  ```
  Expected output includes `'photos'`.

- [ ] **Step 7.8 — Commit**

  ```bash
  git add backend/app/db.py \
          backend/app/services/photo_sources/__init__.py \
          backend/app/services/photo_sources/base.py \
          backend/tests/test_photo_sources.py
  git commit -m "feat(db): add photos table; add PhotoSource ABC with RemotePhotoRef"
  ```

---

## Task 8 — Backend: ICloudSharedAlbumSource

**Files:**
- Create: `backend/app/services/photo_sources/icloud_shared_album.py`
- Modify: `backend/tests/test_photo_sources.py`

- [ ] **Step 8.1 — Add failing iCloud unit tests**

  Append to `backend/tests/test_photo_sources.py`:

  ```python
  import asyncio
  from unittest.mock import AsyncMock, MagicMock, patch
  from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource

  ALBUM_URL = "https://www.icloud.com/photos/fake#MYTOKEN"

  def _make_http_mock(webstream_body, webasseturls_body=None):
      """Return a context-manager mock for httpx.AsyncClient."""
      resp_ws = MagicMock()
      resp_ws.raise_for_status = MagicMock()
      resp_ws.json.return_value = webstream_body
      resp_ws.headers = {}

      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=False)
      mock_client.post = AsyncMock(return_value=resp_ws)
      return mock_client


  def test_is_configured_true():
      assert ICloudSharedAlbumSource(ALBUM_URL).is_configured() is True


  def test_is_configured_false_when_empty():
      assert ICloudSharedAlbumSource("").is_configured() is False


  def test_token_extracted_from_fragment():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      assert src._token == "MYTOKEN"


  def test_fetch_remote_refs_returns_guids():
      webstream = {
          "photos": [
              {"photoGuid": "guid-aaa", "derivatives": {}},
              {"photoGuid": "guid-bbb", "derivatives": {}},
          ]
      }
      src = ICloudSharedAlbumSource(ALBUM_URL)
      with patch("httpx.AsyncClient", return_value=_make_http_mock(webstream)):
          refs = asyncio.run(src.fetch_remote_refs())
      assert [r.id for r in refs] == ["guid-aaa", "guid-bbb"]


  def test_fetch_remote_refs_empty_album():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      with patch("httpx.AsyncClient", return_value=_make_http_mock({"photos": []})):
          refs = asyncio.run(src.fetch_remote_refs())
      assert refs == []


  def test_redirect_host_is_followed():
      """If webstream body contains X-Apple-MMe-Host, retry against that host."""
      call_count = {"n": 0}

      async def fake_post(url, **kwargs):
          resp = MagicMock()
          resp.raise_for_status = MagicMock()
          resp.headers = {}
          if call_count["n"] == 0:
              resp.json.return_value = {"X-Apple-MMe-Host": "p12-sharedstreams.icloud.com"}
          else:
              resp.json.return_value = {"photos": [{"photoGuid": "g1", "derivatives": {}}]}
          call_count["n"] += 1
          return resp

      src = ICloudSharedAlbumSource(ALBUM_URL)
      mock_client = AsyncMock()
      mock_client.__aenter__ = AsyncMock(return_value=mock_client)
      mock_client.__aexit__ = AsyncMock(return_value=False)
      mock_client.post = fake_post
      with patch("httpx.AsyncClient", return_value=mock_client):
          refs = asyncio.run(src.fetch_remote_refs())
      assert src._stream_host == "p12-sharedstreams.icloud.com"
      assert [r.id for r in refs] == ["g1"]


  def test_select_derivative_prefers_smallest_gte_1920():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      derivatives = {
          "A": {"width": 1600, "mediaAssetType": "JPEG", "url": "http://example.com/1600.jpg"},
          "B": {"width": 2048, "mediaAssetType": "JPEG", "url": "http://example.com/2048.jpg"},
          "C": {"width": 3200, "mediaAssetType": "JPEG", "url": "http://example.com/3200.jpg"},
      }
      chosen = src._select_derivative(derivatives)
      assert chosen["width"] == 2048  # smallest >= 1920


  def test_select_derivative_fallback_to_largest_if_none_gte_1920():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      derivatives = {
          "A": {"width": 800,  "mediaAssetType": "JPEG", "url": "http://example.com/800.jpg"},
          "B": {"width": 1600, "mediaAssetType": "JPEG", "url": "http://example.com/1600.jpg"},
      }
      chosen = src._select_derivative(derivatives)
      assert chosen["width"] == 1600  # fallback to largest


  def test_select_derivative_skips_heic():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      derivatives = {
          "A": {"width": 4032, "mediaAssetType": "HEIC", "url": "http://example.com/orig.heic"},
          "B": {"width": 2048, "mediaAssetType": "JPEG", "url": "http://example.com/2048.jpg"},
      }
      chosen = src._select_derivative(derivatives)
      assert chosen["width"] == 2048  # HEIC skipped


  def test_select_derivative_returns_none_if_only_heic():
      src = ICloudSharedAlbumSource(ALBUM_URL)
      derivatives = {
          "A": {"width": 4032, "mediaAssetType": "HEIC", "url": "http://example.com/orig.heic"},
      }
      assert src._select_derivative(derivatives) is None
  ```

- [ ] **Step 8.2 — Run tests, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py -v -k "icloud or Icloud or redirect or derivative"
  ```
  Expected: `FAILED` — `ImportError`.

- [ ] **Step 8.3 — Implement ICloudSharedAlbumSource**

  Create `backend/app/services/photo_sources/icloud_shared_album.py`:

  ```python
  import logging
  from pathlib import Path
  from urllib.parse import urlparse

  import httpx

  from .base import PhotoSource, RemotePhotoRef

  logger = logging.getLogger(__name__)
  _DEFAULT_HOST = "p06-sharedstreams.icloud.com"


  class ICloudSharedAlbumSource(PhotoSource):
      def __init__(self, album_url: str):
          self._album_url = album_url
          self._token = urlparse(album_url).fragment
          self._stream_host: str = _DEFAULT_HOST

      def is_configured(self) -> bool:
          return bool(self._album_url)

      async def _webstream(self) -> dict:
          url = f"https://{self._stream_host}/{self._token}/sharedstreams/webstream"
          async with httpx.AsyncClient() as client:
              resp = await client.post(url, json={"streamCtag": None})
              resp.raise_for_status()
              data = resp.json()

          # Follow partition redirect if present in the response body or headers
          new_host = data.get("X-Apple-MMe-Host") or resp.headers.get("X-Apple-MMe-Host")
          if new_host and new_host != self._stream_host:
              self._stream_host = new_host
              return await self._webstream()

          return data

      async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
          data = await self._webstream()
          return [
              RemotePhotoRef(id=p["photoGuid"])
              for p in data.get("photos", [])
          ]

      def _select_derivative(self, derivatives: dict) -> dict | None:
          """
          Smallest JPEG derivative >= 1920px wide; fallback to largest JPEG.

          NOTE: derivative key names and exact field structure are from the unofficial
          iCloud webstream API and must be verified against real album output in Phase D.
          Assumes each derivative value has 'width', 'mediaAssetType', and 'url' fields.
          """
          jpeg = []
          for d in derivatives.values():
              asset_type = str(d.get("mediaAssetType", "")).upper()
              if "HEIC" in asset_type or "HEIF" in asset_type:
                  continue
              width = d.get("width", 0)
              jpeg.append((width, d))

          if not jpeg:
              return None

          meets = [(w, d) for w, d in jpeg if w >= 1920]
          if meets:
              return min(meets, key=lambda x: x[0])[1]
          return max(jpeg, key=lambda x: x[0])[1]

      async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
          # Re-resolve the signed URL immediately before downloading
          url = f"https://{self._stream_host}/{self._token}/sharedstreams/webasseturls"
          async with httpx.AsyncClient() as client:
              resp = await client.post(url, json={"photoGuids": [ref.id]})
              resp.raise_for_status()
              data = resp.json()

          # NOTE: actual webasseturls response structure must be verified
          # against real album output. The structure below matches common
          # observations of the unofficial API but may differ on your album.
          items = data.get("items", {})
          photo_data = items.get(ref.id)
          if not photo_data:
              raise ValueError(f"webasseturls returned no data for {ref.id}")

          derivatives = photo_data.get("derivatives", {})
          chosen = self._select_derivative(derivatives)
          if chosen is None:
              raise ValueError(f"no renderable JPEG derivative for {ref.id}")

          signed_url = chosen.get("url")
          if not signed_url:
              raise ValueError(f"chosen derivative has no url for {ref.id}")

          dest.parent.mkdir(parents=True, exist_ok=True)
          async with httpx.AsyncClient(follow_redirects=True) as client:
              async with client.stream("GET", signed_url) as stream:
                  stream.raise_for_status()
                  with open(dest, "wb") as f:
                      async for chunk in stream.aiter_bytes(chunk_size=65536):
                          f.write(chunk)
  ```

- [ ] **Step 8.4 — Run iCloud tests, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py -v
  ```
  Expected: all `PASSED`.

- [ ] **Step 8.5 — Commit**

  ```bash
  git add backend/app/services/photo_sources/icloud_shared_album.py \
          backend/tests/test_photo_sources.py
  git commit -m "feat(photos): implement ICloudSharedAlbumSource with webstream flow"
  ```

---

## Task 9 — Backend: SyncthingFolderSource stub

**Files:**
- Create: `backend/app/services/photo_sources/syncthing_folder.py`

- [ ] **Step 9.1 — Add stub test**

  Append to `backend/tests/test_photo_sources.py`:

  ```python
  from app.services.photo_sources.syncthing_folder import SyncthingFolderSource

  def test_syncthing_source_not_configured_by_default():
      assert SyncthingFolderSource().is_configured() is False

  def test_syncthing_fetch_refs_raises():
      with pytest.raises(NotImplementedError):
          asyncio.run(SyncthingFolderSource().fetch_remote_refs())
  ```

- [ ] **Step 9.2 — Run, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py::test_syncthing_source_not_configured_by_default -v
  ```
  Expected: `FAILED`.

- [ ] **Step 9.3 — Create the stub**

  Create `backend/app/services/photo_sources/syncthing_folder.py`:

  ```python
  from pathlib import Path
  from .base import PhotoSource, RemotePhotoRef


  class SyncthingFolderSource(PhotoSource):
      """Stub for a future private-LAN photo source via a Syncthing-synced folder.

      Switch to this source by setting PHOTO_SOURCE=syncthing in .env.
      """

      def is_configured(self) -> bool:
          return False

      async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
          raise NotImplementedError("SyncthingFolderSource not yet implemented")

      async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
          raise NotImplementedError("SyncthingFolderSource not yet implemented")
  ```

- [ ] **Step 9.4 — Run, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photo_sources.py -v
  ```

- [ ] **Step 9.5 — Commit**

  ```bash
  git add backend/app/services/photo_sources/syncthing_folder.py \
          backend/tests/test_photo_sources.py
  git commit -m "feat(photos): add SyncthingFolderSource stub"
  ```

---

## Task 10 — Backend: PhotoService

**Files:**
- Create: `backend/app/services/photo_service.py`
- Create: `backend/tests/test_photo_service.py`

- [ ] **Step 10.1 — Write failing PhotoService tests**

  Create `backend/tests/test_photo_service.py`:

  ```python
  import asyncio
  import pytest
  from pathlib import Path
  from unittest.mock import AsyncMock
  import app.config as config
  from app.db import init_db, get_conn
  from app.services.photo_sources.base import PhotoSource, RemotePhotoRef
  from app.services.photo_service import PhotoService


  class _FakeSource(PhotoSource):
      def __init__(self, refs, configured=True):
          self._refs = refs
          self._downloads: dict[str, bytes] = {}

      def is_configured(self): return True

      async def fetch_remote_refs(self): return self._refs

      async def download(self, ref, dest):
          dest.parent.mkdir(parents=True, exist_ok=True)
          dest.write_bytes(b"fake-jpeg-data")
          self._downloads[ref.id] = dest


  @pytest.fixture
  def svc(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"
      return PhotoService(_FakeSource([]), cache_dir)


  def test_list_photos_empty(svc):
      assert svc.list_photos() == []


  def test_refresh_downloads_new_photos(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"
      refs = [RemotePhotoRef(id="aaa"), RemotePhotoRef(id="bbb")]
      src = _FakeSource(refs)
      svc = PhotoService(src, cache_dir)

      asyncio.run(svc.refresh())

      photos = svc.list_photos()
      assert {p["id"] for p in photos} == {"aaa", "bbb"}
      assert (cache_dir / "aaa.jpg").exists()
      assert (cache_dir / "bbb.jpg").exists()


  def test_refresh_skips_already_cached(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"
      refs = [RemotePhotoRef(id="aaa")]
      src = _FakeSource(refs)
      svc = PhotoService(src, cache_dir)

      asyncio.run(svc.refresh())
      asyncio.run(svc.refresh())  # second refresh — aaa already cached

      with get_conn() as conn:
          count = conn.execute("SELECT COUNT(*) FROM photos WHERE id='aaa'").fetchone()[0]
      assert count == 1  # not duplicated


  def test_refresh_prunes_stale_photos(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"

      # First refresh: 2 photos
      src = _FakeSource([RemotePhotoRef(id="aaa"), RemotePhotoRef(id="bbb")])
      svc = PhotoService(src, cache_dir)
      asyncio.run(svc.refresh())
      assert (cache_dir / "aaa.jpg").exists()

      # Second refresh: only bbb remains remotely
      src._refs = [RemotePhotoRef(id="bbb")]
      asyncio.run(svc.refresh())

      assert not (cache_dir / "aaa.jpg").exists()  # file deleted
      assert (cache_dir / "bbb.jpg").exists()       # file kept
      ids = {p["id"] for p in svc.list_photos()}
      assert ids == {"bbb"}


  def test_refresh_continues_on_download_error(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"

      class ErrorSource(_FakeSource):
          async def download(self, ref, dest):
              if ref.id == "bad":
                  raise RuntimeError("network error")
              await super().download(ref, dest)

      refs = [RemotePhotoRef(id="bad"), RemotePhotoRef(id="good")]
      svc = PhotoService(ErrorSource(refs), cache_dir)
      asyncio.run(svc.refresh())

      ids = {p["id"] for p in svc.list_photos()}
      assert "good" in ids   # good downloaded
      assert "bad" not in ids  # bad skipped, no crash


  def test_list_photos_returns_url_shape(tmp_path, monkeypatch):
      db_file = str(tmp_path / "test.db")
      monkeypatch.setattr(config, "DB_PATH", db_file)
      init_db()
      cache_dir = tmp_path / "photos"
      src = _FakeSource([RemotePhotoRef(id="xyz")])
      svc = PhotoService(src, cache_dir)
      asyncio.run(svc.refresh())

      photos = svc.list_photos()
      assert photos == [{"id": "xyz", "url": "/api/photos/xyz"}]
  ```

- [ ] **Step 10.2 — Run tests, confirm FAIL**

  ```bash
  cd backend && python -m pytest tests/test_photo_service.py -v
  ```
  Expected: `FAILED` — `ImportError`.

- [ ] **Step 10.3 — Implement PhotoService**

  Create `backend/app/services/photo_service.py`:

  ```python
  import asyncio
  import logging
  from datetime import datetime, timezone
  from pathlib import Path

  import app.config as config
  from app.db import get_conn
  from app.services.photo_sources.base import PhotoSource

  logger = logging.getLogger(__name__)


  class PhotoService:
      def __init__(self, source: PhotoSource, cache_dir: Path):
          self._source = source
          self._cache_dir = cache_dir

      def list_photos(self) -> list[dict]:
          try:
              with get_conn() as conn:
                  rows = conn.execute(
                      "SELECT id FROM photos ORDER BY cached_at ASC"
                  ).fetchall()
              return [{"id": r["id"], "url": f"/api/photos/{r['id']}"} for r in rows]
          except Exception:
              logger.exception("list_photos failed")
              return []

      async def refresh(self) -> None:
          if not self._source.is_configured():
              return

          try:
              remote_refs = await self._source.fetch_remote_refs()
          except Exception:
              logger.exception("fetch_remote_refs failed")
              return

          remote_ids = {r.id for r in remote_refs}

          with get_conn() as conn:
              rows = conn.execute("SELECT id, local_path FROM photos").fetchall()
          cached = {r["id"]: r["local_path"] for r in rows}
          cached_ids = set(cached)

          # Download new photos
          for ref in remote_refs:
              if ref.id in cached_ids:
                  continue
              dest = self._cache_dir / f"{ref.id}.jpg"
              try:
                  await self._source.download(ref, dest)
                  now = datetime.now(timezone.utc).isoformat()
                  with get_conn() as conn:
                      conn.execute(
                          "INSERT OR IGNORE INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
                          (ref.id, str(dest), now),
                      )
                  logger.info("cached photo %s", ref.id)
              except Exception:
                  logger.exception("download failed for %s", ref.id)

          # Prune stale photos
          for photo_id, local_path in cached.items():
              if photo_id in remote_ids:
                  continue
              Path(local_path).unlink(missing_ok=True)  # file first
              with get_conn() as conn:
                  conn.execute("DELETE FROM photos WHERE id=?", (photo_id,))
              logger.info("pruned photo %s", photo_id)


  def _make_source(source_name: str, album_url: str) -> PhotoSource:
      if source_name == "syncthing":
          from app.services.photo_sources.syncthing_folder import SyncthingFolderSource
          return SyncthingFolderSource()
      from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource
      return ICloudSharedAlbumSource(album_url)


  def make_photo_service() -> PhotoService:
      source = _make_source(config.PHOTO_SOURCE, config.ICLOUD_SHARED_ALBUM_URL)
      return PhotoService(source, Path(config.PHOTO_CACHE_DIR))


  async def photo_refresh_loop(service: PhotoService) -> None:
      while True:
          try:
              await service.refresh()
          except Exception:
              logger.exception("photo_refresh_loop error")
          await asyncio.sleep(config.SLIDESHOW_REFRESH_SECONDS)
  ```

- [ ] **Step 10.4 — Run tests, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photo_service.py -v
  ```
  Expected: all `PASSED`.

- [ ] **Step 10.5 — Commit**

  ```bash
  git add backend/app/services/photo_service.py backend/tests/test_photo_service.py
  git commit -m "feat(photos): implement PhotoService with refresh/prune/list"
  ```

---

## Task 11 — Backend: real /api/photos + /api/photos/{id} routes

**Files:**
- Modify: `backend/app/routers/photos.py`
- Modify: `backend/app/deps.py`
- Modify: `backend/tests/test_photos_router.py`

- [ ] **Step 11.1 — Check existing deps.py content**

  ```bash
  cat backend/app/deps.py
  ```
  Note what's already there; we'll append to it, not replace it.

- [ ] **Step 11.2 — Add get_photo_service to deps.py**

  Append to `backend/app/deps.py`:

  ```python
  from fastapi import Request
  from app.services.photo_service import PhotoService


  def get_photo_service(request: Request) -> PhotoService:
      return request.app.state.photo_service
  ```

- [ ] **Step 11.3 — Write the updated router tests**

  Replace `backend/tests/test_photos_router.py` with:

  ```python
  from unittest.mock import MagicMock
  from pathlib import Path
  import pytest
  from fastapi.testclient import TestClient
  from app.services.photo_service import PhotoService, get_photo_service  # noqa: F401
  from app.deps import get_photo_service as dep_get_photo_service


  def _mock_service(photos=None, file_bytes=b"fake-image"):
      svc = MagicMock(spec=PhotoService)
      svc.list_photos.return_value = photos if photos is not None else []
      return svc, file_bytes


  @pytest.fixture
  def photos_client(tmp_db, no_token, tmp_path):
      from app.main import app
      svc, _ = _mock_service()
      app.dependency_overrides[dep_get_photo_service] = lambda: svc
      with TestClient(app) as c:
          yield c, svc
      app.dependency_overrides.clear()


  def test_list_photos_empty(photos_client):
      c, svc = photos_client
      svc.list_photos.return_value = []
      r = c.get("/api/photos")
      assert r.status_code == 200
      assert r.json() == []


  def test_list_photos_returns_service_result(photos_client):
      c, svc = photos_client
      svc.list_photos.return_value = [{"id": "abc", "url": "/api/photos/abc"}]
      r = c.get("/api/photos")
      assert r.status_code == 200
      assert r.json() == [{"id": "abc", "url": "/api/photos/abc"}]


  def test_get_photo_not_in_db_returns_404(photos_client):
      c, _ = photos_client
      r = c.get("/api/photos/nonexistent")
      assert r.status_code == 404


  def test_get_photo_file_missing_returns_404(photos_client, tmp_path):
      c, _ = photos_client
      # Insert a row with a non-existent file path
      from app.db import get_conn
      with get_conn() as conn:
          conn.execute(
              "INSERT INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
              ("orphan", str(tmp_path / "missing.jpg"), "2026-06-05T00:00:00+00:00"),
          )
      r = c.get("/api/photos/orphan")
      assert r.status_code == 404


  def test_get_photo_serves_file(photos_client, tmp_path):
      c, _ = photos_client
      img = tmp_path / "test.jpg"
      img.write_bytes(b"fake-jpeg-data")
      from app.db import get_conn
      with get_conn() as conn:
          conn.execute(
              "INSERT INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
              ("test-id", str(img), "2026-06-05T00:00:00+00:00"),
          )
      r = c.get("/api/photos/test-id")
      assert r.status_code == 200
      assert r.content == b"fake-jpeg-data"
  ```

- [ ] **Step 11.4 — Run tests, confirm some FAIL (404 for get_photo)**

  ```bash
  cd backend && python -m pytest tests/test_photos_router.py -v
  ```
  Expected: `test_list_photos_*` pass (stub already there), `test_get_photo_*` may fail due to DB lookup not in stub.

- [ ] **Step 11.5 — Replace photos router with real implementation**

  Replace `backend/app/routers/photos.py`:

  ```python
  from fastapi import APIRouter, Depends, HTTPException
  from fastapi.responses import FileResponse
  from pathlib import Path

  from app.deps import get_photo_service
  from app.db import get_conn
  from app.services.photo_service import PhotoService

  router = APIRouter()


  @router.get("/api/photos")
  def list_photos(service: PhotoService = Depends(get_photo_service)):
      return service.list_photos()


  @router.get("/api/photos/{photo_id}")
  def get_photo(photo_id: str):
      with get_conn() as conn:
          row = conn.execute(
              "SELECT local_path FROM photos WHERE id=?", (photo_id,)
          ).fetchone()
      if row is None:
          raise HTTPException(status_code=404)
      path = Path(row["local_path"])
      if not path.exists():
          raise HTTPException(status_code=404)
      return FileResponse(path)
  ```

- [ ] **Step 11.6 — Run all router tests, confirm PASS**

  ```bash
  cd backend && python -m pytest tests/test_photos_router.py -v
  ```
  Expected: all `PASSED`.

- [ ] **Step 11.7 — Run full suite**

  ```bash
  cd backend && python -m pytest -v
  ```
  Expected: all pass.

- [ ] **Step 11.8 — Commit**

  ```bash
  git add backend/app/routers/photos.py backend/app/deps.py \
          backend/tests/test_photos_router.py
  git commit -m "feat(api): replace /api/photos stub with real PhotoService-backed routes"
  ```

---

## Task 12 — Backend: photo refresh loop + main.py wiring (Phase C complete)

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 12.1 — Update main.py lifespan to create PhotoService and start refresh loop**

  Replace the lifespan in `backend/app/main.py`:

  ```python
  import asyncio
  import os
  from contextlib import asynccontextmanager
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware
  from app.db import init_db
  from app.services.sync import sync_loop
  from app.services.photo_service import make_photo_service, photo_refresh_loop
  from app.routers.calendar import router as calendar_router
  from app.routers.chores import router as chores_router
  from app.routers.config import router as config_router
  from app.routers.photos import router as photos_router


  @asynccontextmanager
  async def lifespan(app: FastAPI):
      init_db()
      photo_service = make_photo_service()
      app.state.photo_service = photo_service
      if not os.getenv("TESTING"):
          sync_task   = asyncio.create_task(sync_loop())
          photo_task  = asyncio.create_task(photo_refresh_loop(photo_service))
      else:
          sync_task = photo_task = None
      yield
      if sync_task:
          sync_task.cancel()
      if photo_task:
          photo_task.cancel()


  app = FastAPI(title="Family Calendar API", lifespan=lifespan)

  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:8080"],
      allow_methods=["*"],
      allow_headers=["*"],
  )

  app.include_router(calendar_router)
  app.include_router(chores_router)
  app.include_router(config_router)
  app.include_router(photos_router)


  @app.get("/health")
  def health():
      return {"status": "ok"}
  ```

- [ ] **Step 12.2 — Run full test suite**

  ```bash
  cd backend && python -m pytest -v
  ```
  Expected: all pass. The `TESTING=1` env var (set in conftest.py) prevents the refresh loop from starting during tests.

- [ ] **Step 12.3 — Smoke-test the server locally (no iCloud configured yet)**

  ```bash
  cd backend && uvicorn app.main:app --reload
  ```
  Then:
  ```bash
  curl http://localhost:8000/api/config
  # Expected: {"slideshow_idle_seconds":120,"slideshow_interval_seconds":8}
  curl http://localhost:8000/api/photos
  # Expected: []  (no album configured, list_photos returns empty)
  curl http://localhost:8000/health
  # Expected: {"status":"ok"}
  ```

- [ ] **Step 12.4 — Commit**

  ```bash
  git add backend/app/main.py
  git commit -m "feat(api): wire PhotoService into lifespan, start photo_refresh_loop"
  ```

---

## Task 13 — Phase D: standalone iCloud test + integration

**Files:**
- Create: `backend/scripts/test_icloud.py`

This task verifies `ICloudSharedAlbumSource` against a real album before trusting the full pipeline.

- [ ] **Step 13.1 — Create the standalone test script**

  Create `backend/scripts/test_icloud.py`:

  ```python
  """
  Standalone smoke-test for ICloudSharedAlbumSource.
  Run with a real ICLOUD_SHARED_ALBUM_URL set in your environment.

  Usage:
      ICLOUD_SHARED_ALBUM_URL="https://www.icloud.com/photos/..." \
          python backend/scripts/test_icloud.py
  """
  import asyncio
  import os
  import sys
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).parent.parent))

  from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource


  async def main():
      url = os.environ.get("ICLOUD_SHARED_ALBUM_URL", "")
      if not url:
          print("ERROR: Set ICLOUD_SHARED_ALBUM_URL in your environment.")
          sys.exit(1)

      src = ICloudSharedAlbumSource(url)
      print(f"Token: {src._token}")
      print(f"Fetching photo refs from {src._stream_host} ...")
      refs = await src.fetch_remote_refs()
      print(f"Found {len(refs)} photos")
      if not refs:
          print("Album is empty or URL is wrong.")
          return

      # Inspect the first photo's derivatives to verify key names
      print(f"\nFirst ref: {refs[0].id}")
      print("Downloading first photo to /tmp/test_photo.jpg ...")
      dest = Path("/tmp/test_photo.jpg")
      try:
          await src.download(refs[0], dest)
          print(f"Downloaded {dest.stat().st_size} bytes to {dest}")
          print("SUCCESS — open /tmp/test_photo.jpg to confirm it renders correctly.")
      except Exception as e:
          print(f"DOWNLOAD FAILED: {e}")
          print("\nHint: inspect the webasseturls response structure by adding a print(data)")
          print("to ICloudSharedAlbumSource.download() and re-running.")
          sys.exit(1)


  if __name__ == "__main__":
      asyncio.run(main())
  ```

- [ ] **Step 13.2 — Run standalone smoke-test**

  Set your iCloud album URL in the environment (from `.env` if already set, or provide directly):

  ```bash
  cd backend && source ../.env 2>/dev/null || true
  ICLOUD_SHARED_ALBUM_URL="$ICLOUD_SHARED_ALBUM_URL" \
      python scripts/test_icloud.py
  ```

  **Expected:** `Found N photos`, `Downloaded X bytes to /tmp/test_photo.jpg`, no errors.

  **If webasseturls returns unexpected structure:** Add `print(data)` inside `ICloudSharedAlbumSource.download()` before the `items = data.get("items", {})` line, re-run, and adjust the parsing to match the actual response shape. The spec explicitly notes the structure must be verified against real output.

- [ ] **Step 13.3 — Trigger a full refresh via the running server**

  With the server running and `ICLOUD_SHARED_ALBUM_URL` set in `.env`:

  ```bash
  # Restart the server so the lifespan starts a fresh refresh loop
  # (or call refresh manually)
  curl http://localhost:8000/api/photos
  # Should return [] immediately (refresh runs in background)

  # Wait 5–10 seconds, then:
  curl http://localhost:8000/api/photos
  # Expected: list of {id, url} entries — one per album photo
  ```

  Confirm JPEG files landed on disk:
  ```bash
  ls -lh backend/app/data/photos/
  ```

- [ ] **Step 13.4 — End-to-end browser test**

  Open `http://localhost:8080`, let idle timeout trigger, confirm:
  - Real family photos appear in the slideshow (not the placeholder colors)
  - Crossfade is smooth
  - Clock text is readable over all photos (check a bright/pale one)
  - Touch dismisses correctly

- [ ] **Step 13.5 — Commit**

  ```bash
  git add backend/scripts/test_icloud.py
  git commit -m "chore: add standalone iCloud source smoke-test script (Phase D)"
  ```

---

## Self-Review

**Spec coverage check:**
- §3.1 Config vars — Task 1 ✓
- §3.2 `photos` table — Task 7 ✓
- §3.3 `PhotoSource` ABC + `RemotePhotoRef` — Task 7 ✓
- §3.4 `ICloudSharedAlbumSource` (token in fragment, redirect, JPEG selection, HEIC skip, sign-fresh) — Task 8 ✓
- §3.5 `SyncthingFolderSource` stub — Task 9 ✓
- §3.6 `PhotoService` (refresh, prune-file+row, list) — Task 10 ✓
- §3.7 `GET /api/photos`, `GET /api/photos/{id}` (404 for missing), `GET /api/config` — Tasks 1, 11 ✓
- §3.8 Background refresh loop, `TESTING` guard — Task 12 ✓
- §4.1 `useConfig` (runtime, safe defaults) — Task 2 ✓
- §4.2 `useIdle` (document events, resetIdle exposed) — Task 2 ✓
- §4.3 `usePhotos` (5-min list refresh, separate from advance interval) — Task 6 ✓
- §4.4 Slideshow overlay (opacity+pointer-events toggle, crossfade, onLoad+onError, empty state, clock, gradient legibility, bottom hint, touch-to-wake) — Tasks 3, 6 ✓
- §4.5 `App.jsx` integration — Task 4 ✓
- §5 Build order A→B→C→D (standalone iCloud test before full integration) — Tasks 4, 6, 12, 13 ✓
- §6 `.env.example` additions — Task 1 ✓

**Placeholder scan:** No TBDs or "implement later" remaining. All code blocks are complete.

**Type consistency:**
- `RemotePhotoRef(id=...)` defined in Task 7, used in Tasks 8, 10 — consistent.
- `PhotoService.list_photos()` → `list[dict]` defined in Task 10, returned in Task 11 router — consistent.
- `photo_refresh_loop(service)` defined in Task 10, called with `photo_service` in Task 12 — consistent.
- `get_photo_service` in `deps.py` (Task 11) uses `request.app.state.photo_service` set in Task 12 — consistent.
- `usePhotos()` returns `{ photos }` (Task 6), consumed as `photos={photos}` in App.jsx (Task 4) — consistent (stub in Task 4 returns same shape).
