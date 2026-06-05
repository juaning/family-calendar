import asyncio
import pytest
from pathlib import Path
from app.services.photo_sources.base import PhotoSource, RemotePhotoRef


class _WorkingSource(PhotoSource):
    def is_configured(self): return True
    async def fetch_remote_refs(self): return [RemotePhotoRef(id="abc")]
    async def download(self, ref, dest): dest.write_bytes(b"fake-image-data")


def test_remote_photo_ref_has_id():
    ref = RemotePhotoRef(id="guid-123")
    assert ref.id == "guid-123"


def test_concrete_source_fetch_refs():
    src = _WorkingSource()
    refs = asyncio.run(src.fetch_remote_refs())
    assert refs == [RemotePhotoRef(id="abc")]


def test_concrete_source_download(tmp_path):
    src = _WorkingSource()
    dest = tmp_path / "out.jpg"
    asyncio.run(src.download(RemotePhotoRef(id="abc"), dest))
    assert dest.read_bytes() == b"fake-image-data"


def test_abstract_source_cannot_be_instantiated():
    with pytest.raises(TypeError):
        PhotoSource()
