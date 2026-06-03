import asyncio
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db import init_db
from app.services.sync import sync_loop
from app.routers.calendar import router as calendar_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not os.getenv("TESTING"):
        task = asyncio.create_task(sync_loop())
    else:
        task = None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Family Calendar API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(calendar_router)


@app.get("/health")
def health():
    return {"status": "ok"}
