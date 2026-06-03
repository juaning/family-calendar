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
        # Seed calendar_prefs for calendars we haven't seen before.
        # Primary and holiday calendars default to disabled; all others default to enabled.
        # Existing rows (user choices) are never overwritten.
        for c in calendars:
            existing = conn.execute(
                "SELECT 1 FROM calendar_prefs WHERE calendar_id = ?", (c["id"],)
            ).fetchone()
            if existing is None:
                is_holiday = "#holiday@group.v.calendar.google.com" in c["id"]
                enabled = 0 if (c.get("primary") or is_holiday) else 1
                conn.execute(
                    "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?, ?)",
                    (c["id"], enabled),
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
