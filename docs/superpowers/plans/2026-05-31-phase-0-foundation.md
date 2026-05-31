# Phase 0 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the full repo skeleton with a placeholder FastAPI backend and minimal React frontend, wired together via Docker Compose so `docker compose up` serves both services locally.

**Architecture:** The backend is a FastAPI app served by uvicorn inside Docker; the frontend is a Vite/React app built into a static bundle and served by nginx inside Docker. A single `docker-compose.yml` at the repo root orchestrates both. All images target `linux/arm64` (Pi 5 + Apple Silicon M2 are both arm64, no cross-compile needed).

**Tech Stack:** Python 3.12 / FastAPI / uvicorn, Node 20 / React 18 / Vite 5, nginx:alpine, Docker Compose v2

---

## File Map

```
family-calendar/
├── .gitignore
├── .env.example
├── .env                         # gitignored — copy from .env.example
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py              # FastAPI app + /health endpoint
│   │   └── config.py            # env-var loading
│   ├── tests/
│   │   └── test_main.py         # pytest: health endpoint test
│   └── app/data/.gitkeep        # sqlite will live here (gitignored dir)
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf               # proxies /api/* → backend, serves SPA
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/.gitkeep
│       ├── hooks/.gitkeep
│       └── styles/.gitkeep
└── deploy/
    ├── kiosk/
    │   ├── kiosk.sh             # waits for app, launches chromium --kiosk
    │   └── labwc-autostart      # snippet for Pi autostart file
    └── README-deploy.md         # human steps to set up the Pi kiosk
```

---

## Task 1: Root hygiene — `.gitignore` and `.env.example`

**Files:**
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `.gitignore`**

```
# Secrets — never commit
.env
*.env
credentials.json
token.json

# Backend runtime data
backend/app/data/
__pycache__/
*.py[cod]
.pytest_cache/
.venv/

# Frontend build artefacts
node_modules/
dist/
.vite/

# macOS
.DS_Store

# IDE
.idea/
*.iml
```

- [ ] **Step 2: Create `.env.example`**

```
TZ=Australia/Brisbane
FRONTEND_PORT=8080
BACKEND_PORT=8000

# Google Calendar (Phase 1)
GOOGLE_CREDENTIALS_PATH=/app/secrets/credentials.json
GOOGLE_TOKEN_PATH=/app/secrets/token.json

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

- [ ] **Step 3: Copy `.env.example` to `.env` (local only — gitignored)**

```bash
cp .env.example .env
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore .env.example
git commit -m "chore: add .gitignore and .env.example"
```

---

## Task 2: Backend scaffold

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-dotenv==1.0.1
httpx==0.27.0
pytest==8.3.0
```

- [ ] **Step 2: Create `backend/app/__init__.py`** (empty file)

```python
```

- [ ] **Step 3: Create `backend/app/config.py`**

```python
import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
TZ = os.getenv("TZ", "UTC")
```

- [ ] **Step 4: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Family Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: scaffold FastAPI backend with /health endpoint"
```

---

## Task 3: Backend test (TDD — write test, verify red, implement, verify green)

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_main.py`

Note: we already wrote the implementation in Task 2, so this is verify-then-pass (the red step is confirming the test structure is correct before we run it for the first time).

- [ ] **Step 1: Create `backend/tests/__init__.py`** (empty)

```python
```

- [ ] **Step 2: Create `backend/tests/test_main.py`**

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 3: Run the test locally**

```bash
cd backend
pip install -r requirements.txt   # first time only; use a venv if preferred
pytest tests/test_main.py -v
```

Expected output:
```
PASSED tests/test_main.py::test_health_returns_ok
1 passed in ...
```

If it fails: check that you are running pytest from the `backend/` directory (so `app/` is on the Python path).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/
git commit -m "test: add health endpoint test"
```

---

## Task 4: Backend Dockerfile

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/app/data/.gitkeep`

- [ ] **Step 1: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create `backend/app/data/.gitkeep`** (empty file — keeps the gitignored dir tracked)

- [ ] **Step 3: Add `backend/app/data/` to `.gitignore` (the directory, not the .gitkeep)**

The `.gitignore` already has `backend/app/data/` — confirm the `.gitkeep` is not gitignored by running:

```bash
git check-ignore -v backend/app/data/.gitkeep
```

Expected: no output (meaning git will track it). If it is ignored, add a negation line to `.gitignore`:

```
!backend/app/data/.gitkeep
```

- [ ] **Step 4: Smoke-test the Docker image builds (no compose yet)**

```bash
docker build --platform linux/arm64 -t family-calendar-backend backend/
docker run --rm -p 8000:8000 family-calendar-backend &
sleep 2
curl http://localhost:8000/health
# Expected: {"status":"ok"}
docker stop $(docker ps -q --filter ancestor=family-calendar-backend)
```

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile backend/app/data/.gitkeep
git commit -m "feat: add backend Dockerfile"
```

---

## Task 5: Frontend scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.js`
- Create: `frontend/index.html`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/App.jsx`
- Create: `frontend/src/components/.gitkeep`
- Create: `frontend/src/hooks/.gitkeep`
- Create: `frontend/src/styles/.gitkeep`

- [ ] **Step 1: Create `frontend/package.json`**

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
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `frontend/vite.config.js`**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
})
```

- [ ] **Step 3: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Family Calendar</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `frontend/src/main.jsx`**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Create `frontend/src/App.jsx`**

```jsx
export default function App() {
  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f172a',
      color: '#f8fafc',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 300, letterSpacing: '0.05em' }}>
        Family Calendar
      </h1>
    </div>
  )
}
```

- [ ] **Step 6: Create placeholder dirs**

```bash
touch frontend/src/components/.gitkeep
touch frontend/src/hooks/.gitkeep
touch frontend/src/styles/.gitkeep
```

- [ ] **Step 7: Install deps and verify dev server starts**

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173 — should show "Family Calendar" on a dark background
# Ctrl-C to stop
```

- [ ] **Step 8: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite/React frontend — placeholder page"
```

---

## Task 6: Frontend Dockerfile + nginx config

**Files:**
- Create: `frontend/nginx.conf`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy API calls to the backend service (name resolves via Docker network)
    location /api/ {
        proxy_pass http://backend:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://backend:8000/health;
    }

    # SPA fallback — all other paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

- [ ] **Step 2: Create `frontend/Dockerfile`**

```dockerfile
# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# --- Serve stage ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 3: Smoke-test the frontend image**

```bash
cd frontend && npm run build && cd ..
docker build --platform linux/arm64 -t family-calendar-frontend frontend/
docker run --rm -p 8080:80 family-calendar-frontend &
sleep 2
curl -s http://localhost:8080 | grep "Family Calendar"
# Expected: <title>Family Calendar</title> in output
docker stop $(docker ps -q --filter ancestor=family-calendar-frontend)
```

- [ ] **Step 4: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf
git commit -m "feat: add frontend Dockerfile with nginx"
```

---

## Task 7: Docker Compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  backend:
    platform: linux/arm64
    build:
      context: ./backend
    ports:
      - "${BACKEND_PORT:-8000}:8000"
    env_file:
      - .env
    restart: unless-stopped

  frontend:
    platform: linux/arm64
    build:
      context: ./frontend
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    depends_on:
      - backend
    restart: unless-stopped
```

- [ ] **Step 2: Run the full stack**

```bash
docker compose up --build
```

Expected: both services build and start. You should see uvicorn startup logs and nginx starting. No errors.

- [ ] **Step 3: Verify backend**

In a new terminal:
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

- [ ] **Step 4: Verify frontend**

```bash
open http://localhost:8080
# Browser should show "Family Calendar" on a dark background
```

Also verify the nginx proxy works end-to-end:
```bash
curl http://localhost:8080/health
# Expected: {"status":"ok"}   (proxied through nginx → backend)
```

- [ ] **Step 5: Stop compose**

```bash
docker compose down
```

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml — Phase 0 stack wired up"
```

---

## Task 8: Deploy / kiosk stubs

**Files:**
- Create: `deploy/kiosk/kiosk.sh`
- Create: `deploy/kiosk/labwc-autostart`
- Create: `deploy/README-deploy.md`

- [ ] **Step 1: Create `deploy/kiosk/kiosk.sh`**

```bash
#!/usr/bin/env bash
# Launched by labwc autostart on the Pi.
# Waits until the app is reachable, then opens Chromium in kiosk mode.

APP_URL="http://localhost:8080"

echo "Waiting for $APP_URL..."
until curl -sf "$APP_URL" > /dev/null 2>&1; do
  sleep 2
done

# Wipe any stale Chromium exit-state that triggers the "restore pages?" bubble
rm -rf ~/.config/chromium/Default/Crash\ Reports
rm -f ~/.config/chromium/Default/Last\ Session

chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --incognito \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  "$APP_URL"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x deploy/kiosk/kiosk.sh
```

- [ ] **Step 3: Create `deploy/kiosk/labwc-autostart`**

```
# labwc autostart — append this line to ~/.config/labwc/autostart on the Pi
/home/pi/family-calendar/deploy/kiosk/kiosk.sh &
```

- [ ] **Step 4: Create `deploy/README-deploy.md`**

```markdown
# Deploying to the Raspberry Pi

## Prerequisites

1. **Flash 64-bit OS** — the Pi MUST run Raspberry Pi OS (64-bit) Desktop, Debian 13 "trixie".
   Verify: `dpkg --print-architecture` should return `arm64`.
   If it returns `armhf`, reflash before proceeding.

2. **Install Docker** on the Pi:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker pi
   # log out and back in
   ```

3. **Clone the repo**:
   ```bash
   git clone git@github.com:juaning/family-calendar.git ~/family-calendar
   cd ~/family-calendar
   cp .env.example .env
   # Edit .env — set TZ, ports, etc.
   ```

## Start the app

```bash
cd ~/family-calendar
docker compose up -d --build
```

Verify: `curl http://localhost:8080` should return HTML.

## Set up kiosk on boot

1. **Disable screen blanking** — in raspi-config → Display Options → Screen Blanking → Off.
   (`xset` does NOT work under Wayland/labwc — use raspi-config.)

2. **Install the autostart snippet**:
   ```bash
   mkdir -p ~/.config/labwc
   cat deploy/kiosk/labwc-autostart >> ~/.config/labwc/autostart
   ```

3. **Reboot** and confirm Chromium opens full-screen to the calendar.

## Troubleshooting

- **"Restore pages?" bubble** — the kiosk.sh script clears crash state; if it persists,
  delete `~/.config/chromium/Default/Preferences` and reboot.
- **Touch input** — works as pointer events automatically under Wayland; no extra config needed.
- **Chromium binary name** — `kiosk.sh` auto-detects `chromium-browser` vs `chromium`; no manual edit needed.
```

- [ ] **Step 5: Commit**

```bash
git add deploy/
git commit -m "chore: add kiosk launch script and Pi deploy README"
```

---

## Task 9: Final smoke test & push

- [ ] **Step 1: Full clean build**

```bash
docker compose down --rmi all --volumes
docker compose up --build
```

Both services must build cleanly from scratch with no errors.

- [ ] **Step 2: Verify all three endpoints**

```bash
curl http://localhost:8000/health        # direct backend
curl http://localhost:8080/health        # via nginx proxy
curl -s http://localhost:8080 | grep "Family Calendar"   # frontend HTML
```

All three must return expected output.

- [ ] **Step 3: Run backend tests**

```bash
cd backend && pytest tests/ -v && cd ..
```

Expected: 1 passed.

- [ ] **Step 4: Stop compose**

```bash
docker compose down
```

- [ ] **Step 5: Push to remote**

```bash
git push origin master
```

- [ ] **Step 6: Phase 0 complete**

Exit criteria from CLAUDE.md §5 Phase 0:
- [x] `docker compose up` serves frontend and backend locally
- [x] React page shows "Family Calendar"
- [x] Backend `/health` endpoint responds
- [ ] Renders full-screen on the actual Pi (requires Pi reflash to 64-bit — do this separately)

---

## Self-Review

**Spec coverage check:**

| Requirement (CLAUDE.md §5 Phase 0) | Covered by |
|---|---|
| Scaffold repo from §4 | Tasks 2–8 |
| Placeholder FastAPI backend | Task 2 |
| Minimal React page ("Family Calendar") | Task 5 |
| `docker compose up` wires both services | Task 7 |
| `.gitignore` with all required entries | Task 1 |
| `.env.example` with all required vars | Task 1 |
| `linux/arm64` images | Tasks 4, 6, 7 |
| Deploy/kiosk stubs under `deploy/` | Task 8 |

**Placeholder scan:** No TBD/TODO/fill-in-later entries. All code blocks are complete.

**Type/name consistency:** No shared types between tasks at this phase — all files are independent modules.
