---
name: calendar-display-picker-design
description: Phase 1 — FullCalendar display polish and per-calendar enabled/disabled picker for the kitchen kiosk
metadata:
  type: project
---

# Calendar Display & Picker — Phase 1 Design

**Date:** 2026-06-03  
**Scope:** FullCalendar display completeness + calendar picker panel. No To-do/Chores, no slideshow, no sidebar changes.

---

## 1. Current State (baseline)

- `CalendarPane.jsx`: FullCalendar month/week/day, events fetched from `/api/events`, per-calendar colours mapped, loading/error/auth_required states all present.
- `Sidebar.jsx`: static placeholder — untouched by this slice.
- `useCalendarData.js`: polls `/api/calendars` + `/api/events` every 5 min; exposes `{ calendars, events, status }`.
- `GET /api/calendars`: returns `{ id, summary, backgroundColor, foregroundColor }` — no `enabled` flag.
- `GET /api/events`: returns all events in a time window; no enabled-calendar filtering.
- DB: `calendars` + `events` tables; no `calendar_prefs` table.
- Sync loop: fetches all calendars and all their events; stores everything.

**Gap:** every calendar (including the account primary and holiday calendars) is shown by default, and there is no way to hide any of them.

---

## 2. Frontend — UI Design

### 2.1 Gear button placement

A `⚙` icon button is absolutely positioned at the top-right corner of `CalendarPane`'s outer wrapper `div`.

**Header toolbar conflict:** the current `headerToolbar` right-side config is `dayGridMonth,timeGridWeek,timeGridDay today prev,next`. To ensure the gear does not overlap those buttons, move the view-switcher buttons to `center` and keep only `prev,next` on the right — or reserve right padding on the toolbar row equal to the gear button width (~50px). Confirm visually that no button is obscured.

Recommended `headerToolbar`:
```js
{ left: 'title', center: 'dayGridMonth,timeGridWeek,timeGridDay', right: 'today prev,next' }
```
The gear floats over the top-right of the wrapper, well clear of all toolbar buttons.

### 2.2 Settings panel

- Absolute-positioned card, anchored top-right, drops below the gear button.
- **Header row:** "Calendars" label (left) + `×` close button (right).
- **Body:** scrollable list (`overflow-y: auto`, `max-height: 60vh`), one row per calendar.
  - Each row: filled colour dot, calendar name, styled toggle switch.
  - Rows for disabled calendars: reduced-opacity dot to signal off state.
- **Styled toggle switch** with a generous touch target (min 44×44 px tap area).
- **Outside-tap-to-close:** a transparent full-screen backdrop sits behind the panel at a lower z-index; clicking it closes the panel.
- Panel closes on `×` tap, backdrop tap, or after a successful toggle that leaves 0 open calendars (guard: never disable the last enabled calendar — or simply allow it and show empty state).

### 2.3 Toggle behaviour (optimistic, revert-on-failure)

1. User taps toggle → flip switch in local state immediately (feels instant).
2. Fire `PATCH /api/calendars/enabled` in the background with `{ "id": calendarId, "enabled": newValue }`.
3. On success → call `refetch()` to pull updated events immediately.
4. On failure → revert switch to previous state; surface a small inline error ("Couldn't save — try again") next to the row. Do not lock the toggle.

The failure path must leave the UI in a correct, non-stuck state. The calendar ID is carried in the request body — never in the URL path — to avoid fragment/encoding issues with IDs like `en-gb.australian#holiday@group.v.calendar.google.com`.

### 2.4 `useCalendarData` changes

Add a `refetch` callback to the return value so `CalendarPane` can trigger an immediate poll cycle after a toggle, without waiting for the 5-minute interval.

State inside `CalendarPane`:
- `panelOpen: boolean` — controls visibility of the settings panel.
- `localCalendars: Calendar[]` — a local copy (initialised from `calendars` returned by the hook) that carries the `enabled` flag and is updated optimistically on toggle.

---

## 3. Backend — API Changes

### 3.1 `GET /api/calendars` (updated)

Adds `enabled` boolean to each item. Source: `calendar_prefs` table.

**Response shape:**
```json
[
  {
    "id": "user@gmail.com",
    "summary": "Juan",
    "backgroundColor": "#039be5",
    "foregroundColor": "#ffffff",
    "enabled": false
  }
]
```

### 3.2 `PATCH /api/calendars/enabled` (new)

**Request body:**
```json
{ "id": "en-gb.australian#holiday@group.v.calendar.google.com", "enabled": false }
```

**Response:** updated calendar object (same shape as `GET /api/calendars` item), or 404 if `id` not found.

The ID is in the body, never in the URL, to avoid fragment/encoding hazards.

### 3.3 `GET /api/events` (updated)

Adds a filter so only events belonging to enabled calendars are returned.

```sql
SELECT e.*, c.background_color, c.foreground_color
FROM   events e
JOIN   calendars c ON e.calendar_id = c.id
JOIN   calendar_prefs cp ON e.calendar_id = cp.calendar_id
WHERE  e.start >= ? AND e.start < ?
  AND  cp.enabled = 1
ORDER  BY e.start
```

---

## 4. Database Changes

### 4.1 New table: `calendar_prefs`

```sql
CREATE TABLE IF NOT EXISTS calendar_prefs (
    calendar_id TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 1
);
```

Added to `SCHEMA` in `db.py` — `CREATE TABLE IF NOT EXISTS` makes this safe for existing installs.

### 4.2 Default initialisation rules

Applied in `_sync_once()` when a calendar ID is seen for the first time (i.e., not yet in `calendar_prefs`):

| Condition | Default `enabled` |
|-----------|-------------------|
| `primary == true` (Google flag) | `0` (disabled) |
| ID contains `#holiday@group.v.calendar.google.com` | `0` (disabled) |
| All others (per-person calendars) | `1` (enabled) |

Existing rows in `calendar_prefs` are never overwritten — user choices are preserved across syncs.

### 4.3 `google_calendar.list_calendars()` update

Pass through `primary: bool` from the Google API response so `_sync_once()` can use it when seeding defaults.

---

## 5. Data Flow

```
[Google Calendar API]
        |
        v
  _sync_once()
  ├── upsert calendars table
  ├── seed calendar_prefs for new calendars (primary/holiday → 0, others → 1)
  └── upsert events table (all calendars, always — filter happens at read time)

[Frontend poll / refetch()]
        |
    GET /api/calendars ──→ calendars + enabled flag
    GET /api/events    ──→ events for enabled calendars only

[User taps toggle]
        |
    optimistic flip in localCalendars
        |
    PATCH /api/calendars/enabled (body: {id, enabled})
        ├── success → refetch() → events list updates
        └── failure → revert localCalendars row
```

---

## 6. Files Changed

| File | Change |
|------|--------|
| `backend/app/db.py` | Add `calendar_prefs` table to `SCHEMA` |
| `backend/app/services/google_calendar.py` | Include `primary` flag in `list_calendars()` return |
| `backend/app/services/sync.py` | Seed `calendar_prefs` for new calendars in `_sync_once()` |
| `backend/app/routers/calendar.py` | Update `GET /api/calendars`; update `GET /api/events`; add `PATCH /api/calendars/enabled` |
| `frontend/src/hooks/useCalendarData.js` | Add `refetch` callback to return value |
| `frontend/src/components/CalendarPane.jsx` | Gear button, settings panel, toggle logic, `headerToolbar` adjustment |

Sidebar (`Sidebar.jsx`), `App.jsx`, `docker-compose.yml`, and `deploy/` are not touched.

---

## 7. Guardrails

- Calendar ID always in request body, never URL path.
- `calendar_prefs` seeded on first sync, never overwritten on subsequent syncs.
- Optimistic toggle reverts on failure — UI never left in a stuck state.
- Gear button does not overlap FullCalendar toolbar buttons.
- Sync loop continues to fetch all calendars/events regardless of prefs — filtering is read-time only.
- `docker compose up` must continue to serve the page without new env vars or secrets.
