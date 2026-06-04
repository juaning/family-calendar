import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from app.deps import get_db

router = APIRouter(prefix="/api")


class ChoreCreate(BaseModel):
    title: str
    assignee_calendar_id: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("title must not be blank")
        return v.strip()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "assignee_calendar_id": row["assignee_calendar_id"],
        "done": bool(row["done"]),
        "position": row["position"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


@router.get("/chores")
def list_chores(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute(
        "SELECT * FROM chores ORDER BY position ASC, created_at ASC"
    ).fetchall()
    return [_row_to_dict(r) for r in rows]


@router.post("/chores", status_code=201)
def create_chore(payload: ChoreCreate, db: sqlite3.Connection = Depends(get_db)):
    next_pos = db.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM chores"
    ).fetchone()[0]
    chore_id = str(uuid.uuid4())
    now = _now()
    db.execute(
        """
        INSERT INTO chores (id, title, assignee_calendar_id, done, position, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?, ?)
        """,
        (chore_id, payload.title, payload.assignee_calendar_id, next_pos, now, now),
    )
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _row_to_dict(row)
