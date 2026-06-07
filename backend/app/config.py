import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
TZ = os.getenv("TZ", "UTC")

GOOGLE_CREDENTIALS_PATH = os.getenv("GOOGLE_CREDENTIALS_PATH", "/app/secrets/credentials.json")
GOOGLE_TOKEN_PATH = os.getenv("GOOGLE_TOKEN_PATH", "/app/secrets/token.json")
GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar"]

DB_PATH = os.getenv("DB_PATH", "app/data/calendar.db")
CALENDAR_SYNC_INTERVAL = int(os.getenv("CALENDAR_SYNC_INTERVAL_SECONDS", "300"))

ICLOUD_SHARED_ALBUM_URL       = os.getenv("ICLOUD_SHARED_ALBUM_URL", "")
SLIDESHOW_IDLE_SECONDS        = int(os.getenv("SLIDESHOW_IDLE_SECONDS", "120"))
SLIDESHOW_INTERVAL_SECONDS    = int(os.getenv("SLIDESHOW_INTERVAL_SECONDS", "8"))
SLIDESHOW_REFRESH_SECONDS     = int(os.getenv("SLIDESHOW_REFRESH_SECONDS", "3600"))
PHOTO_CACHE_DIR               = os.getenv("PHOTO_CACHE_DIR", "/app/data/photos")
PHOTO_SOURCE                  = os.getenv("PHOTO_SOURCE", "icloud")
PHOTO_STARTUP_DELAY_SECONDS   = int(os.getenv("PHOTO_STARTUP_DELAY_SECONDS", "30"))
PHOTO_DOWNLOAD_DELAY_SECONDS  = float(os.getenv("PHOTO_DOWNLOAD_DELAY_SECONDS", "0.5"))
