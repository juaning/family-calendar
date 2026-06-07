import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.services.sync import sync_loop
from app.services.photo_service import make_photo_service, photo_refresh_loop
import app.config as config
from app.routers.calendar import router as calendar_router
from app.routers.chores import router as chores_router
from app.routers.config import router as config_router
from app.routers.photos import router as photos_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    photo_service = make_photo_service()
    app.state.photo_service = photo_service
    if not os.getenv("TESTING"):
        sync_task  = asyncio.create_task(sync_loop())
        photo_task = asyncio.create_task(
            photo_refresh_loop(photo_service,
                               startup_delay=config.PHOTO_STARTUP_DELAY_SECONDS)
        )
    else:
        sync_task = photo_task = None
    yield
    if sync_task:
        sync_task.cancel()
    if photo_task:
        photo_task.cancel()


app = FastAPI(title="Family Calendar API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calendar_router)
app.include_router(chores_router)
app.include_router(config_router)
app.include_router(photos_router)


@app.get("/health")
def health():
    return {"status": "ok"}
