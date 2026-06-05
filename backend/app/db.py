import sqlite3
import contextlib
from pathlib import Path
import app.config as config

SCHEMA = """
CREATE TABLE IF NOT EXISTS calendars (
    id               TEXT PRIMARY KEY,
    summary          TEXT NOT NULL,
    background_color TEXT NOT NULL,
    foreground_color TEXT NOT NULL,
    synced_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id          TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    title       TEXT NOT NULL,
    start       TEXT NOT NULL,
    end         TEXT NOT NULL,
    all_day     INTEGER NOT NULL DEFAULT 0,
    synced_at   TEXT NOT NULL,
    PRIMARY KEY (id, calendar_id)
);

CREATE TABLE IF NOT EXISTS calendar_prefs (
    calendar_id TEXT PRIMARY KEY,
    enabled     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS chores (
    id                   TEXT PRIMARY KEY,
    title                TEXT NOT NULL,
    assignee_calendar_id TEXT,
    done                 INTEGER NOT NULL DEFAULT 0,
    position             INTEGER NOT NULL DEFAULT 0,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    local_path  TEXT NOT NULL,
    cached_at   TEXT NOT NULL
);
"""


def init_db() -> None:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(SCHEMA)


@contextlib.contextmanager
def get_conn():
    conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
