from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Family Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],  # tighten to explicit origin before adding credentials
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}
