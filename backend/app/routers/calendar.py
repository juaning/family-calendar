import sqlite3
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query
from app.deps import get_db
import app.config as config

router = APIRouter(prefix="/api")


@router.get("/calendars")
def get_calendars(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT id, summary, background_color, foreground_color FROM calendars"
    ).fetchall()
    return [
        {
            "id": r["id"],
            "summary": r["summary"],
            "backgroundColor": r["background_color"],
            "foregroundColor": r["foreground_color"],
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
        WHERE  e.start >= ? AND e.start < ?
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
