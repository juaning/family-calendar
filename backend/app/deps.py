from app.db import get_conn


def get_db():
    """FastAPI dependency: yields an open, committed SQLite connection."""
    with get_conn() as conn:
        yield conn


from fastapi import Request
from app.services.photo_service import PhotoService


def get_photo_service(request: Request) -> PhotoService:
    return request.app.state.photo_service
