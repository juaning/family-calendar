# CLAUDE.md — Family Kitchen Calendar

> Project brief for Claude Code. Read this fully before scaffolding or writing code.
> It captures every decision already made during planning so you have full context from turn one.

---

## 1. What we're building

A wall-mounted **family calendar display** for a kitchen — a self-hosted, Skylight-style appliance.

- A large touchscreen runs a **local web app full-screen in kiosk mode**.
- **Landscape 70/30 split**: left ~70% is the calendar, right ~30% is a sidebar (to-dos / chores; later recipes & meal plans).
- Events are **colour-coded per family member**.
- When idle, the screen becomes a **photo slideshow**; a touch wakes it back to the calendar.
- Later, an **AI intake** lets us forward party invites / school fliers (PDF/JPG/PNG) by email and have events auto-extracted and added after a confirmation tap.

**Design principle: local-first.** The display must keep working when the internet hiccups. Cache calendar data and photos locally; degrade gracefully.

---

## 2. Hardware & target environment

| Thing | Detail |
|---|---|
| Compute | Raspberry Pi 5 Model B, 4GB RAM |
| Display | Waveshare 15.6″ Full HD IPS touch monitor, 1920×1080, in case |
| Orientation | Landscape (native, no rotation needed) |
| Pi OS | **Raspberry Pi OS (64-bit) Desktop, Debian 13 "trixie" — `arm64`** (confirmed on device) |
| Compositor | Wayland / **labwc** (Pi 5 default) |
| Dev machine | MacBook Air M2 (Apple Silicon, `arm64`) |

**Critical architecture note:** the Pi runs 64-bit `arm64` (reflashed from the old 32-bit Raspbian; confirmed via `dpkg --print-architecture` → `arm64`). The dev Mac is Apple Silicon (`arm64`), so Docker images built on the Mac run natively on the Pi with **no cross-architecture step**. Always build/target `linux/arm64`.

---

## 3. Stack (locked)

- **Backend:** FastAPI (Python). Home for Google OAuth, photo-source fetching, and (Phase 2) vision parsing + email polling.
- **Frontend:** React (Vite) + **FullCalendar** for day/week/month views (it supports multiple colour-coded event sources out of the box — maps directly onto per-person calendars).
- **Database:** SQLite (chores, to-dos, display/config, cached calendar events).
- **Deploy:** Docker Compose on the Pi. Chromium kiosk runs on the **host** (not in a container) pointing at `http://localhost`.
- **Tooling on the Mac:** Homebrew, Node.js, Docker Desktop, Claude Code.

---

## 4. Recommended repo structure

```
family-calendar/
├── CLAUDE.md                # this file
├── README.md
├── .gitignore               # MUST exist before first GitHub push (see §9)
├── .env.example             # documented, committed
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt     # or pyproject.toml
│   └── app/
│       ├── main.py
│       ├── config.py
│       ├── db.py
│       ├── models.py
│       ├── routers/
│       │   ├── calendar.py
│       │   ├── todos.py
│       │   ├── chores.py
│       │   ├── photos.py
│       │   └── ingest.py            # Phase 2
│       ├── services/
│       │   ├── google_calendar.py
│       │   ├── photo_sources/
│       │   │   ├── base.py          # PhotoSource interface
│       │   │   ├── icloud_shared_album.py
│       │   │   └── syncthing_folder.py   # later, fully-private alternative
│       │   ├── vision_ingest.py     # Phase 2
│       │   └── email_poller.py      # Phase 2
│       └── data/            # sqlite db lives here (gitignored)
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── CalendarPane.jsx     # FullCalendar, ~70%
│       │   ├── Sidebar.jsx          # ~30% container
│       │   ├── TodoList.jsx
│       │   ├── ChoreBoard.jsx
│       │   └── Slideshow.jsx        # idle overlay
│       ├── hooks/
│       │   └── useIdle.js           # idle detection -> slideshow
│       └── styles/
└── deploy/
    ├── kiosk/
    │   ├── kiosk.sh
    │   └── labwc-autostart
    └── README-deploy.md
```

---

## 5. Phased plan — build in this order

### Phase 0 — Foundation (do this first)
Goal: prove the whole deploy loop *before* any features exist.
- Scaffold the repo above with a placeholder FastAPI backend and a minimal React page (just "Family Calendar" on screen).
- Write `docker-compose.yml` so `docker compose up` serves the frontend and backend locally.
- Get it rendering **full-screen in Chromium kiosk mode on the actual Pi** (see §8).
- Set up `.gitignore` and `.env.example` now.
- **Exit criteria:** `docker compose up` on the Pi, screen shows the page full-screen on boot, reachable from the Mac.

### Phase 1 — MVP
- **Google Calendar sync** (read): OAuth, fetch events from multiple calendars, cache in SQLite, show day/week/month in FullCalendar with **per-calendar colours** (see §6).
- **To-do / Chores** module: local CRUD in SQLite, colour-coded per person, shown in the sidebar.
- **Idle photo slideshow** from an **iCloud Shared Album** via a pluggable photo-source (see §7).
- **70/30 landscape layout** assembled.

### Phase 2 — AI invite/flier import
- Dedicated intake email address; **IMAP polling** to start (Cloudflare Email Routing → webhook is a cleaner future swap).
- Pipeline: email + attachment (PDF/JPG/PNG) → **Claude vision API** extracts `title / date / time / location` → **confirmation card** in the UI (human-in-the-loop — never write silently) → on approval, **create the event in Google Calendar**.

### Phase 3 — Later
Meal plans & recipes in the sidebar; two-way calendar editing from the device; polish.

---

## 6. Calendar & per-person colours

- Source is **Google Calendar** (one Google account that the device authenticates as).
- **Colour-coding strategy:** create **one Google calendar per family member**, each with its own colour, all shared into the device's account. FullCalendar treats each as a separate event source and renders its colour automatically. No custom tagging needed.
- Phase 1 only needs **read** access, but **request the write scope at first consent** (`https://www.googleapis.com/auth/calendar.events`) so Phase 2 can create events without re-authorising.

### ⚠️ Google OAuth gotcha — handle in Phase 1
While the OAuth app's publishing status is **"Testing"**, refresh tokens for calendar scopes **silently expire after 7 days**, forcing constant re-auth — a classic Pi-calendar trap. Fix: set the consent screen to **"In production"** (External user type). It can still be effectively private for personal use. Document this clearly in the README so the user does it once during setup.

---

## 7. Photo slideshow

**Why not Google/Apple Photos APIs:** Google's Photos API can no longer read a user's existing library for an automatic slideshow (post-March-2025 changes — apps only see what they upload, and the picker requires manual selection). Apple has **no official iCloud Photos API** at all.

**Chosen source: iCloud Shared Album (public website link).**
- A family member creates a Shared Album in the Photos app and enables **"Public Website"**, which yields a public `icloud.com` link. Everyone adds photos natively from their iPhones; the family can all contribute.
- Backend fetches the album's photo stream on a schedule and caches images locally for the slideshow.
- **This uses an *unofficial* endpoint** — isolate it entirely behind the `PhotoSource` interface so a future Apple change (or a swap to a private source) touches nothing else.
- **Privacy caveat to surface in the README:** a "Public Website" album link is obscure but not access-controlled — treat its contents as potentially discoverable. Fine for typical family photos; if that ever bothers the user, swap in the private alternative below.

**Pluggable design (required):** define a `PhotoSource` base interface (e.g. `list_photos()` / `fetch(photo_id)`), implement `ICloudSharedAlbumSource` first. Leave a stub for `SyncthingFolderSource` (a folder synced from phones/Mac to the Pi over the LAN — fully private, nothing leaves the network). Switching sources should be a config change, not a refactor.

**Idle behaviour:** a `useIdle` hook detects inactivity, fades in the slideshow as a full-screen overlay; any touch dismisses it and returns to the calendar. Make the idle timeout configurable.

---

## 8. Kiosk on the Pi (Debian 13 trixie / labwc)

Target: Chromium launches full-screen on boot pointing at the local app, with screen-blanking disabled.

Plan (validate on the real board in Phase 0 — confirm exact binary name and compositor):
- Launch via labwc autostart: `chromium-browser` (or `chromium` — confirm the binary name on trixie) with flags like
  `--kiosk --noerrdialogs --disable-infobars --incognito --disable-session-crashed-bubble http://localhost:<PORT>`.
- Suppress the "restore pages?" bubble (clear the exit-state / use the flags above).
- **Disable screen blanking** — on Wayland, `xset` does NOT work. Use `raspi-config` → Display Options → Screen Blanking → off, and/or the compositor config. Verify on device.
- Touch input works as pointer events automatically; no extra config expected.
- Put the launch script and autostart snippet under `deploy/kiosk/` and document the install in `deploy/README-deploy.md`.

Keep the kiosk on the **host**; only the app runs in Docker.

---

## 9. Secrets & git hygiene (important)

This project holds secrets — they must **never** be committed:
- Google OAuth client credentials (`credentials.json`) and stored token (`token.json`)
- iCloud Shared Album URL
- (Phase 2) Anthropic API key, IMAP mailbox credentials

**Before any GitHub push exists**, create a `.gitignore` covering at least:
```
.env
*.env
credentials.json
token.json
backend/app/data/
__pycache__/
node_modules/
dist/
```
Provide a committed **`.env.example`** documenting every variable with placeholder values. Order of operations: scaffold with `.gitignore` in place **first**, then it's safe to push to GitHub.

### Suggested env vars (`.env.example`)
```
TZ=Australia/Brisbane
FRONTEND_PORT=8080
BACKEND_PORT=8000

# Google Calendar
GOOGLE_CREDENTIALS_PATH=/app/secrets/credentials.json
GOOGLE_TOKEN_PATH=/app/secrets/token.json

# Photos
ICLOUD_SHARED_ALBUM_URL=
SLIDESHOW_IDLE_SECONDS=120
SLIDESHOW_INTERVAL_SECONDS=8

# Phase 2 (leave blank until then)
ANTHROPIC_API_KEY=
IMAP_HOST=
IMAP_USER=
IMAP_PASSWORD=
```

---

## 10. Conventions & guardrails

- Build images for **`linux/arm64`**. Don't introduce an x86-only dependency without flagging it.
- **Docker on the Pi:** install Docker Engine + Compose plugin from Docker's official apt repo using the **`trixie`** channel (`...download.docker.com/linux/debian trixie stable`); `arm64` is supported. Avoid Debian's older `docker.io` package. Add the user to the `docker` group so `sudo` isn't needed each time.
- Keep modules **swappable behind interfaces** (photo sources especially).
- Never write to the user's real calendar without an explicit confirmation step (Phase 2).
- Prefer simple, debuggable solutions — this is a long-lived home appliance, not a demo.
- The Pi's default swap is small (~200MB); if the slideshow is memory-hungry, note it rather than silently assuming headroom.
- Surface setup steps the human must do (OAuth publishing, creating per-person calendars, enabling the iCloud album, flashing 64-bit OS) in the README rather than burying them.

---

## 11. First task for Claude Code

Start **Phase 0**: scaffold the repo in §4, create a minimal FastAPI backend + minimal Vite/React frontend that renders "Family Calendar", wire up `docker-compose.yml` for local `docker compose up`, and create `.gitignore` + `.env.example`. Do **not** start calendar/photo features yet — get the skeleton and the local run working first. The Pi will be reflashed to 64-bit before we test the kiosk step on-device.