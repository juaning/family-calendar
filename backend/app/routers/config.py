from fastapi import APIRouter
import app.config as config

router = APIRouter()

@router.get("/api/config")
def get_config():
    return {
        "slideshow_idle_seconds": config.SLIDESHOW_IDLE_SECONDS,
        "slideshow_interval_seconds": config.SLIDESHOW_INTERVAL_SECONDS,
    }
