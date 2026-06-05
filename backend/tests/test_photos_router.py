from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from app.services.photo_service import PhotoService
from app.deps import get_photo_service


def _mock_service(photos=None):
    svc = MagicMock(spec=PhotoService)
    svc.list_photos.return_value = photos if photos is not None else []
    return svc


@pytest.fixture
def photos_client(tmp_db, no_token):
    from app.main import app
    svc = _mock_service()
    app.dependency_overrides[get_photo_service] = lambda: svc
    with TestClient(app) as c:
        yield c, svc
    app.dependency_overrides.clear()


def test_list_photos_empty(photos_client):
    c, svc = photos_client
    svc.list_photos.return_value = []
    r = c.get("/api/photos")
    assert r.status_code == 200
    assert r.json() == []


def test_list_photos_returns_service_result(photos_client):
    c, svc = photos_client
    svc.list_photos.return_value = [{"id": "abc", "url": "/api/photos/abc"}]
    r = c.get("/api/photos")
    assert r.status_code == 200
    assert r.json() == [{"id": "abc", "url": "/api/photos/abc"}]


def test_get_photo_not_in_db_returns_404(photos_client):
    c, _ = photos_client
    r = c.get("/api/photos/nonexistent")
    assert r.status_code == 404


def test_get_photo_file_missing_returns_404(photos_client, tmp_path):
    c, _ = photos_client
    from app.db import get_conn
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
            ("orphan", str(tmp_path / "missing.jpg"), "2026-06-05T00:00:00+00:00"),
        )
    r = c.get("/api/photos/orphan")
    assert r.status_code == 404


def test_get_photo_serves_file(photos_client, tmp_path):
    c, _ = photos_client
    img = tmp_path / "test.jpg"
    img.write_bytes(b"fake-jpeg-data")
    from app.db import get_conn
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
            ("test-id", str(img), "2026-06-05T00:00:00+00:00"),
        )
    r = c.get("/api/photos/test-id")
    assert r.status_code == 200
    assert r.content == b"fake-jpeg-data"
