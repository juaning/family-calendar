import sqlite3
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
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


class ChoreUpdate(BaseModel):
    done: bool | None = None
    title: str | None = None
    assignee_calendar_id: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("title must not be blank")
        return v.strip() if v is not None else v


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


@router.patch("/chores/{chore_id}")
def update_chore(
    chore_id: str,
    payload: ChoreUpdate,
    db: sqlite3.Connection = Depends(get_db),
):
    if not db.execute("SELECT 1 FROM chores WHERE id = ?", (chore_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Chore not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=422, detail="No fields to update")

    set_clauses = []
    params = []
    if "done" in updates:
        set_clauses.append("done = ?")
        params.append(int(updates["done"]))
    if "title" in updates:
        set_clauses.append("title = ?")
        params.append(updates["title"])
    if "assignee_calendar_id" in updates:
        set_clauses.append("assignee_calendar_id = ?")
        params.append(updates["assignee_calendar_id"])  # None → SQL NULL

    set_clauses.append("updated_at = ?")
    params.append(_now())
    params.append(chore_id)

    db.execute(
        f"UPDATE chores SET {', '.join(set_clauses)} WHERE id = ?",
        params,
    )
    row = db.execute("SELECT * FROM chores WHERE id = ?", (chore_id,)).fetchone()
    return _row_to_dict(row)


@router.delete("/chores/{chore_id}", status_code=204)
def delete_chore(chore_id: str, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM chores WHERE id = ?", (chore_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Chore not found")
    db.execute("DELETE FROM chores WHERE id = ?", (chore_id,))
