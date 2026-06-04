# Idle Photo Slideshow — Design Spec
**Date:** 2026-06-05  
**Status:** Approved  
**Phase:** 1 (final slice)

---

## 1. Goal

When the kitchen display sits untouched, it fades into a full-screen photo slideshow. Any touch or key press wakes it back to the calendar. Photos come from an iCloud Shared Album (pluggable source), cached locally so the slideshow works offline.

---

## 2. Architecture Overview

```
backend/app/services/photo_sources/
    __init__.py
    base.py                    ← PhotoSource ABC + RemotePhotoRef
    icloud_shared_album.py     ← ICloudSharedAlbumSource
    syncthing_folder.py        ← stub (future private-LAN alternative)
backend/app/services/photo_service.py   ← PhotoService (cache, refresh, list)
backend/app/routers/photos.py           ← GET /api/photos, GET /api/photos/{id}
backend/app/routers/config.py           ← GET /api/config

frontend/src/hooks/useIdle.js
frontend/src/hooks/usePhotos.js
frontend/src/hooks/useConfig.js
frontend/src/components/Slideshow.jsx
```

**Modified:** `backend/app/db.py` (add `photos` table), `backend/app/config.py` (add slideshow vars), `backend/app/main.py` (wire router + refresh task), `frontend/src/App.jsx` (integrate Slideshow), `frontend/src/styles/tokens.css` (add slideshow tokens), `.env.example` (add `SLIDESHOW_REFRESH_SECONDS`).

---

## 3. Backend

### 3.1 Config (`config.py` additions)

```python
ICLOUD_SHARED_ALBUM_URL     = os.getenv("ICLOUD_SHARED_ALBUM_URL", "")
SLIDESHOW_IDLE_SECONDS      = int(os.getenv("SLIDESHOW_IDLE_SECONDS", "120"))
SLIDESHOW_INTERVAL_SECONDS  = int(os.getenv("SLIDESHOW_INTERVAL_SECONDS", "8"))
SLIDESHOW_REFRESH_SECONDS   = int(os.getenv("SLIDESHOW_REFRESH_SECONDS", "3600"))
PHOTO_CACHE_DIR             = os.getenv("PHOTO_CACHE_DIR", "app/data/photos")
PHOTO_SOURCE                = os.getenv("PHOTO_SOURCE", "icloud")  # or "syncthing"
```

### 3.2 Database (`db.py` addition)

```sql
CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,   -- stable GUID from source
    local_path  TEXT NOT NULL,      -- absolute path on disk
    cached_at   TEXT NOT NULL       -- ISO-8601 UTC timestamp
);
```

### 3.3 `PhotoSource` ABC (`services/photo_sources/base.py`)

```python
@dataclass
class RemotePhotoRef:
    id: str   # stable GUID — NO URL (signed URLs are short-lived)

class PhotoSource(ABC):
    def is_configured(self) -> bool: ...

    async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
        """Return current set of photo GUIDs from the source."""
        ...

    async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
        """Download ref to dest. Re-resolve any signed URL immediately before
        streaming bytes. Prefer a JPEG derivative ≤ 1920px wide; skip HEIC."""
        ...
```

**Key invariant:** `RemotePhotoRef` carries only the stable `id`. Signed asset URLs (iCloud `webasseturls`) are resolved fresh inside `download()` — never stored or reused.

### 3.4 `ICloudSharedAlbumSource` (`services/photo_sources/icloud_shared_album.py`)

Implements the unofficial iCloud Shared Album webstream flow. All iCloud-specific logic is isolated here; nothing outside this file knows about Apple's API.

**Flow:**

1. Extract the album token from `ICLOUD_SHARED_ALBUM_URL`.
2. `POST https://p06-sharedstreams.icloud.com/{token}/sharedstreams/webstream` with body `{"streamCtag": null}`.
   - If the response includes `X-Apple-MMe-Host`, retry the POST against the redirected host.
3. Parse the webstream JSON for photo GUIDs and their `derivatives` dict.
4. `fetch_remote_refs()` returns one `RemotePhotoRef(id=guid)` per photo.
5. `download(ref, dest)`:
   - POST to `https://{host}/{token}/sharedstreams/webasseturls` with `{"photoGuids": [ref.id]}`.
   - From the response, choose the derivative with the largest JPEG at or below 1920px width (typically the `"2048x2048"` or `"1600x1200"` bucket). If only HEIC is available, log a warning and skip — raise `ValueError("no renderable derivative")`.
   - Stream bytes from the signed URL to `dest`.
6. `is_configured()` returns `bool(ICLOUD_SHARED_ALBUM_URL)`.

**Error handling:** network errors and JSON parse errors raise; the caller (`PhotoService.refresh()`) catches and logs them without crashing the refresh loop.

### 3.5 `SyncthingFolderSource` (`services/photo_sources/syncthing_folder.py`)

Stub only. `is_configured()` returns `False`. `fetch_remote_refs()` and `download()` raise `NotImplementedError`. Switching to this source is a config change (`PHOTO_SOURCE=syncthing`).

### 3.6 `PhotoService` (`services/photo_service.py`)

Wraps a `PhotoSource`. The router and refresh loop talk only to `PhotoService`.

**`refresh()` algorithm:**
1. If source is not configured, return immediately.
2. Call `source.fetch_remote_refs()` → `remote_refs`.
3. Query `photos` table → `cached_ids`.
4. **Download new:** for each `ref` in `remote_refs` where `ref.id not in cached_ids`:
   - Destination: `PHOTO_CACHE_DIR/{ref.id}.jpg`
   - Call `source.download(ref, dest)`; on any error, log and continue.
   - On success, insert row `(id, local_path, cached_at)`.
5. **Prune stale:** for each `id` in `cached_ids` where `id not in remote_ids`:
   - `Path(row.local_path).unlink(missing_ok=True)` — delete file first.
   - Delete row from `photos` table.

**`list_photos()` → `list[dict]`:** query `photos` table ordered by `cached_at ASC`; return `[{"id": row.id, "url": f"/api/photos/{row.id}"}]`. Returns `[]` if table is empty.

### 3.7 Routes

**`GET /api/photos`**
```json
[{"id": "abc123", "url": "/api/photos/abc123"}, ...]
```
Calls `photo_service.list_photos()`. Returns `[]` on any error — never raises.

**`GET /api/photos/{id}`**
Looks up `local_path` from DB. Streams file with `FileResponse`. Returns 404 if row or file not found. Frontend skips broken entries and advances to the next.

**`GET /api/config`**
```json
{
  "slideshow_idle_seconds": 120,
  "slideshow_interval_seconds": 8
}
```
Reads directly from `config.py` — no DB query. Always succeeds.

### 3.8 Background Refresh Task (`main.py`)

A second asyncio background task alongside `sync_loop`, running every `SLIDESHOW_REFRESH_SECONDS`. Calls `photo_service.refresh()`. On uncaught exception, logs and continues the loop — never crashes the process.

---

## 4. Frontend

### 4.1 `useConfig()` hook

Fetches `GET /api/config` once on mount. Returns `{ idleMs, intervalMs }`. While loading or on error, returns safe defaults: `idleMs=120_000`, `intervalMs=8_000`. Config is live from the backend `.env` — no rebuild needed to change timing.

### 4.2 `useIdle(idleMs)` hook

- Attaches event listeners to `document` for `pointermove`, `pointerdown`, `touchstart`, `keydown`.
- Maintains a `setTimeout` ref. Any event clears and resets the timer to `idleMs`.
- Returns `{ isIdle: boolean, resetIdle: () => void }`.
- `resetIdle` is also called directly by the Slideshow's touch handler.
- Cleans up listeners and timer on unmount.

### 4.3 `usePhotos()` hook

- Fetches `GET /api/photos` on mount.
- Re-fetches every 5 minutes (fixed, independent of the per-photo advance interval) to pick up newly-cached photos mid-session.
- Returns `{ photos: [{id, url}] }`. Empty array is valid — no error state exposed.

### 4.4 `Slideshow.jsx`

**Overlay mounting:**
- `position:fixed; inset:0; z-index:1000`
- `opacity:0; pointer-events:none` when `!isIdle`
- `opacity:1; pointer-events:auto` when `isIdle`
- CSS transition: `opacity 0.7s ease`
- Fades in gently on idle; invisible and non-blocking when hidden.

**Photo crossfade (when photos.length > 0):**
- Two `<img>` elements, absolutely positioned, fill the overlay (`object-fit:cover`).
- `current` img: `opacity:1`; `next` img: `opacity:0`; transition `1s ease`.
- On each tick (`intervalMs`): set `next.src` to the upcoming photo (preloaded), wait for `onLoad`, then swap opacities. Then advance the index and schedule the next tick.
- `setInterval` starts when `isIdle` becomes `true`; clears when `isIdle` is `false` or on unmount.

**Empty state (photos.length === 0):**
- Background: `var(--color-inverse-surface)` (`#303030`). No `<img>` elements rendered — zero broken-image risk.
- Clock/date still rendered centered. Functions as a clock screensaver.

**Clock / date overlay (always rendered when isIdle):**
- Layer: `position:absolute; inset:0; z-index:2; display:flex; flex-direction:column; align-items:center; justify-content:center`
- Dark scrim: `background:rgba(0,0,0,0.2)` on the overlay itself.
- Time: `font-size:72px; font-weight:300; color:#ffffff; letter-spacing:-2px; text-shadow:0 2px 8px rgba(0,0,0,0.6)`
- Date: `font-size:20px; font-weight:400; color:#ffffff; opacity:0.9; margin-top:12px; text-shadow:0 2px 8px rgba(0,0,0,0.6)`
- Localized gradient behind clock block: `background:linear-gradient(to bottom, transparent, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.35) 60%, transparent)` on the center content area — keeps text readable over bright photos (snow, beach, pale sky) without darkening the whole image.
- Clock ticks once per minute (`HH:MM` display, `setInterval` at 60 000 ms). No per-second timer.

**Bottom hint:**
- `position:absolute; bottom:32px; left:50%; transform:translateX(-50%)`
- Text: "Tap anywhere to wake" at `font-size:14px; opacity:0.7; color:#ffffff; text-shadow:0 2px 8px rgba(0,0,0,0.6)`
- Localized gradient behind hint: `background:linear-gradient(to top, rgba(0,0,0,0.4), transparent)` spanning the bottom 20% of the overlay.

**Touch-to-wake:**
- `onClick` and `onTouchStart` on the overlay root call `onWake` (`resetIdle` from `useIdle`).

### 4.5 `App.jsx` integration

```jsx
const config  = useConfig()
const { isIdle, resetIdle } = useIdle(config.idleMs)
const { photos } = usePhotos()

return (
  <>
    <div style={layoutStyle}>
      <CalendarPane … />
      <Sidebar … />
    </div>
    <Slideshow
      isIdle={isIdle}
      onWake={resetIdle}
      photos={photos}
      intervalMs={config.intervalMs}
    />
  </>
)
```

---

## 5. Build Order

1. **Phase A — idle UX without photos.** Implement `useIdle`, `useConfig`, `GET /api/config`, and `Slideshow.jsx` with the empty-state (dark background + clock). Verify idle → overlay appears → touch wakes → board visible, no photos needed.
2. **Phase B — placeholder photos.** Add a `GET /api/photos` stub returning 2–3 local test images. Verify crossfade cycling, preload, and 404-skip in the browser.
3. **Phase C — backend photo pipeline.** Implement `PhotoSource` ABC, `ICloudSharedAlbumSource`, `PhotoService`, `photos` table, `/api/photos` and `/api/photos/{id}` routes, and the background refresh task. Wire source selection by `PHOTO_SOURCE` config.
4. **Phase D — integration.** Set `ICLOUD_SHARED_ALBUM_URL` in `.env`, trigger a manual refresh, confirm photos land in `/app/data/photos/`, confirm `/api/photos` lists them, confirm slideshow cycles them.

---

## 6. `.env.example` Additions

```
SLIDESHOW_REFRESH_SECONDS=3600
PHOTO_CACHE_DIR=/app/data/photos
PHOTO_SOURCE=icloud
```

---

## 7. Out of Scope

- Two-way photo management (delete from album via UI).
- Syncthing source implementation (stub only).
- Transition effects beyond CSS opacity crossfade.
- Checksum/etag deduplication (ID-based is sufficient for Phase 1).
