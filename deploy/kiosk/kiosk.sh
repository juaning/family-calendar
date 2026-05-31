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
