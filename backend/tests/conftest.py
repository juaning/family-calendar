import os
import pytest
import app.config as config
from app.db import init_db

# Prevent the sync background task from starting when TestClient runs the lifespan.
# Must be set before any app imports.
os.environ.setdefault("TESTING", "1")


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    return db_file


@pytest.fixture
def no_token(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "GOOGLE_TOKEN_PATH", str(tmp_path / "no_token.json"))


@pytest.fixture
def client(tmp_db, no_token):
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as c:
        yield c
