import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.deps import get_db
import app.config as config

router = APIRouter(prefix="/api")


@router.get("/calendars")
def get_calendars(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        """
        SELECT c.id, c.summary, c.background_color, c.foreground_color,
               COALESCE(cp.enabled, 1) AS enabled
        FROM   calendars c
        LEFT   JOIN calendar_prefs cp ON c.id = cp.calendar_id
        """
    ).fetchall()
    return [
        {
            "id": r["id"],
            "summary": r["summary"],
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
            "enabled": bool(r["enabled"]),
        }
        for r in rows
    ]


@router.get("/events")
def get_events(
    start: str = Query(..., description="ISO 8601 datetime — inclusive lower bound"),
    end: str = Query(..., description="ISO 8601 datetime — exclusive upper bound"),
    db: sqlite3.Connection = Depends(get_db),
):
    cal_count = db.execute("SELECT COUNT(*) FROM calendars").fetchone()[0]
    if cal_count == 0 and not Path(config.GOOGLE_TOKEN_PATH).exists():
        raise HTTPException(
            status_code=503,
            detail={"error": "auth_required", "message": "Run: python -m app.auth"},
        )

    rows = db.execute(
        """
        SELECT e.id, e.calendar_id, e.title, e.start, e.end, e.all_day,
               c.background_color, c.foreground_color
        FROM   events e
        JOIN   calendars c ON e.calendar_id = c.id
        LEFT   JOIN calendar_prefs cp ON e.calendar_id = cp.calendar_id
        WHERE  e.start >= ? AND e.start < ?
          AND  COALESCE(cp.enabled, 1) = 1
        ORDER  BY e.start
        """,
        (start, end),
    ).fetchall()

    return [
        {
            "id": r["id"],
            "calendarId": r["calendar_id"],
            "title": r["title"],
            "start": r["start"],
            "end": r["end"],
            "allDay": bool(r["all_day"]),
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
        }
        for r in rows
    ]


class CalendarToggle(BaseModel):
    id: str
    enabled: bool


@router.patch("/calendars/enabled")
def toggle_calendar_enabled(
    payload: CalendarToggle,
    db: sqlite3.Connection = Depends(get_db),
):
    cal = db.execute(
        "SELECT id, summary, background_color, foreground_color FROM calendars WHERE id = ?",
        (payload.id,),
    ).fetchone()
    if cal is None:
        raise HTTPException(status_code=404, detail="Calendar not found")

    db.execute(
        "INSERT INTO calendar_prefs (calendar_id, enabled) VALUES (?, ?)"
        " ON CONFLICT(calendar_id) DO UPDATE SET enabled = excluded.enabled",
        (payload.id, int(payload.enabled)),
    )

    return {
        "id": cal["id"],
        "summary": cal["summary"],
        "backgroundColor": cal["background_color"],
        "foregroundColor": cal["foreground_color"],
        "enabled": payload.enabled,
    }
