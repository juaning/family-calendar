from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path

router = APIRouter()

# Phase B stub: serve static placeholder images.
# Replaced in Task 11 with real PhotoService-backed routes.
_PLACEHOLDER_DIR = Path(__file__).parent.parent / "static" / "placeholder"
_PLACEHOLDERS = [
    {"id": "img1", "url": "/api/photos/img1"},
    {"id": "img2", "url": "/api/photos/img2"},
    {"id": "img3", "url": "/api/photos/img3"},
]
_PLACEHOLDER_FILES = {
    "img1": _PLACEHOLDER_DIR / "img1.png",
    "img2": _PLACEHOLDER_DIR / "img2.png",
    "img3": _PLACEHOLDER_DIR / "img3.png",
}


@router.get("/api/photos")
def list_photos():
    return _PLACEHOLDERS


@router.get("/api/photos/{photo_id}")
def get_photo(photo_id: str):
    path = _PLACEHOLDER_FILES.get(photo_id)
    if path is None or not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path)
