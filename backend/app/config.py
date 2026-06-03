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
