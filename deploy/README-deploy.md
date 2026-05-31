# Deploying to the Raspberry Pi

## Prerequisites

1. **Flash 64-bit OS** — the Pi MUST run Raspberry Pi OS (64-bit) Desktop, Bookworm.
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
- **Chromium binary name** — on Bookworm it may be `chromium-browser` or `chromium`;
  check with `which chromium-browser chromium` and edit kiosk.sh if needed.
