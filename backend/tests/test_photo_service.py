import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
import app.config as config
from app.db import init_db, get_conn
from app.services.photo_sources.base import PhotoSource, RemotePhotoRef
from app.services.photo_service import PhotoService


class _FakeSource(PhotoSource):
    def __init__(self, refs, configured=True):
        self._refs = refs
        self._configured = configured
        self._downloads: dict[str, bytes] = {}

    def is_configured(self): return self._configured

    async def fetch_remote_refs(self): return self._refs

    async def download(self, ref, dest):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(b"fake-jpeg-data")
        self._downloads[ref.id] = dest


@pytest.fixture
def svc(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"
    return PhotoService(_FakeSource([]), cache_dir)


def test_list_photos_empty(svc):
    assert svc.list_photos() == []


def test_refresh_downloads_new_photos(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"
    refs = [RemotePhotoRef(id="aaa"), RemotePhotoRef(id="bbb")]
    src = _FakeSource(refs)
    svc = PhotoService(src, cache_dir)

    asyncio.run(svc.refresh())

    photos = svc.list_photos()
    assert {p["id"] for p in photos} == {"aaa", "bbb"}
    assert (cache_dir / "aaa.jpg").exists()
    assert (cache_dir / "bbb.jpg").exists()


def test_refresh_skips_already_cached(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"
    refs = [RemotePhotoRef(id="aaa")]
    src = _FakeSource(refs)
    svc = PhotoService(src, cache_dir)

    asyncio.run(svc.refresh())
    asyncio.run(svc.refresh())  # second refresh — aaa already cached

    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) FROM photos WHERE id='aaa'").fetchone()[0]
    assert count == 1  # not duplicated


def test_refresh_prunes_stale_photos(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"

    # First refresh: 2 photos
    src = _FakeSource([RemotePhotoRef(id="aaa"), RemotePhotoRef(id="bbb")])
    svc = PhotoService(src, cache_dir)
    asyncio.run(svc.refresh())
    assert (cache_dir / "aaa.jpg").exists()

    # Second refresh: only bbb remains remotely
    src._refs = [RemotePhotoRef(id="bbb")]
    asyncio.run(svc.refresh())

    assert not (cache_dir / "aaa.jpg").exists()  # file deleted
    assert (cache_dir / "bbb.jpg").exists()       # file kept
    ids = {p["id"] for p in svc.list_photos()}
    assert ids == {"bbb"}


def test_refresh_continues_on_download_error(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"

    class ErrorSource(_FakeSource):
        async def download(self, ref, dest):
            if ref.id == "bad":
                raise RuntimeError("network error")
            await super().download(ref, dest)

    refs = [RemotePhotoRef(id="bad"), RemotePhotoRef(id="good")]
    svc = PhotoService(ErrorSource(refs), cache_dir)
    asyncio.run(svc.refresh())

    ids = {p["id"] for p in svc.list_photos()}
    assert "good" in ids   # good downloaded
    assert "bad" not in ids  # bad skipped, no crash


def test_list_photos_returns_url_shape(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"
    src = _FakeSource([RemotePhotoRef(id="xyz")])
    svc = PhotoService(src, cache_dir)
    asyncio.run(svc.refresh())

    photos = svc.list_photos()
    assert photos == [{"id": "xyz", "url": "/api/photos/xyz"}]


def test_refresh_does_nothing_when_source_not_configured(tmp_path, monkeypatch):
    db_file = str(tmp_path / "test.db")
    monkeypatch.setattr(config, "DB_PATH", db_file)
    init_db()
    cache_dir = tmp_path / "photos"
    src = _FakeSource(refs=[], configured=False)
    svc = PhotoService(src, cache_dir)
    asyncio.run(svc.refresh())  # should not crash, should not download anything
    assert svc.list_photos() == []
