from app.db import get_conn


def get_db():
    """FastAPI dependency: yields an open, committed SQLite connection."""
    with get_conn() as conn:
        yield conn
