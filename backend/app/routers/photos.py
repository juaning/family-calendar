from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

from app.deps import get_photo_service
from app.db import get_conn
from app.services.photo_service import PhotoService

router = APIRouter()


@router.get("/api/photos")
def list_photos(service: PhotoService = Depends(get_photo_service)):
    return service.list_photos()


@router.get("/api/photos/{photo_id}")
def get_photo(photo_id: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT local_path FROM photos WHERE id=?", (photo_id,)
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404)
    path = Path(row["local_path"])
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path)
