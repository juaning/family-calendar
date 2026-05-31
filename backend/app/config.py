import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_PORT = int(os.getenv("BACKEND_PORT", "8000"))
TZ = os.getenv("TZ", "UTC")
