# Deploying to the Raspberry Pi

## Prerequisites

1. **Flash 64-bit OS** — the Pi MUST run Raspberry Pi OS (64-bit) Desktop, Debian 13 "trixie".
   Verify: `dpkg --print-architecture` should return `arm64`.
   If it returns `armhf`, reflash before proceeding.

2. **Install Docker** on the Pi (official apt-repo method for Debian trixie):
   ```bash
   sudo apt update && sudo apt install -y ca-certificates curl
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
     https://download.docker.com/linux/debian trixie stable" \
     | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt update
   sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo usermod -aG docker $USER
   # log out and back in
   ```

3. **Set up SSH access for the private repo** (skip if cloning over HTTPS):
   ```bash
   ssh-keygen -t ed25519 -C "pi@family-calendar"
   cat ~/.ssh/id_ed25519.pub
   ```
   Add the printed public key to GitHub → Settings → SSH and GPG keys → New SSH key.
   Alternatively, clone over HTTPS with a personal access token instead of the SSH URL.

4. **Clone the repo**:
   ```bash
   git clone git@github.com:juaning/family-calendar.git ~/family-calendar
   cd ~/family-calendar
   cp .env.example .env
   # Edit .env — set TZ, ports, etc.
   ```

5. **Create secrets directory** (for Google credentials — Phase 1):
   ```bash
   mkdir -p ~/family-calendar/secrets
   ```
   This directory is gitignored. Place `credentials.json` here in Phase 1.
6. **Copy secrets to py** 
# From your Mac — copy both files into it:
scp secrets/credentials.json kitchen-cal.local:~/family-calendar/secrets/
scp secrets/token.json kitchen-cal.local:~/family-calendar/secrets/

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
