#!/usr/bin/env bash
# Launched by labwc autostart on the Pi.
# Waits until the app is reachable, then opens Chromium in kiosk mode.
# Relaunches Chromium if it ever exits, so the display self-heals.

APP_URL="http://localhost:8080"

# Use whichever Chromium binary this OS actually provides.
CHROMIUM="$(command -v chromium-browser || command -v chromium)"
if [ -z "$CHROMIUM" ]; then
  echo "No chromium binary found. Install: sudo apt install -y chromium" >&2
  exit 1
fi

echo "Waiting for $APP_URL..."
until curl -sf "$APP_URL" > /dev/null 2>&1; do
  sleep 2
done

# Wipe stale exit-state that can trigger the "restore pages?" bubble
rm -rf ~/.config/chromium/Default/Crash\ Reports 2>/dev/null
rm -f  ~/.config/chromium/Default/Last\ Session 2>/dev/null

# Relaunch on crash so a black screen never persists
while true; do
  "$CHROMIUM" \
    --kiosk \
    --noerrdialogs \
    --disable-infobars \
    --incognito \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --disable-pinch \
    --overscroll-history-navigation=0 \
    --check-for-update-interval=31536000 \
    "$APP_URL"
  echo "Chromium exited; relaunching in 3s..." >&2
  sleep 3
done