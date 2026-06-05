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


import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource

ALBUM_URL = "https://www.icloud.com/photos/fake#MYTOKEN"

def _make_http_mock(webstream_body):
    """Return a context-manager mock for httpx.AsyncClient."""
    resp_ws = MagicMock()
    resp_ws.raise_for_status = MagicMock()
    resp_ws.json.return_value = webstream_body
    resp_ws.headers = {}

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=resp_ws)
    return mock_client


def test_is_configured_true():
    assert ICloudSharedAlbumSource(ALBUM_URL).is_configured() is True


def test_is_configured_false_when_empty():
    assert ICloudSharedAlbumSource("").is_configured() is False


def test_token_extracted_from_fragment():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    assert src._token == "MYTOKEN"


def test_fetch_remote_refs_returns_guids():
    webstream = {
        "photos": [
            {"photoGuid": "guid-aaa", "derivatives": {}},
            {"photoGuid": "guid-bbb", "derivatives": {}},
        ]
    }
    src = ICloudSharedAlbumSource(ALBUM_URL)
    with patch("httpx.AsyncClient", return_value=_make_http_mock(webstream)):
        refs = asyncio.run(src.fetch_remote_refs())
    assert [r.id for r in refs] == ["guid-aaa", "guid-bbb"]


def test_fetch_remote_refs_empty_album():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    with patch("httpx.AsyncClient", return_value=_make_http_mock({"photos": []})):
        refs = asyncio.run(src.fetch_remote_refs())
    assert refs == []


def test_redirect_host_is_followed():
    """If webstream body contains X-Apple-MMe-Host, retry against that host."""
    call_count = {"n": 0}

    async def fake_post(url, **kwargs):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.headers = {}
        if call_count["n"] == 0:
            resp.json.return_value = {"X-Apple-MMe-Host": "p12-sharedstreams.icloud.com"}
        else:
            resp.json.return_value = {"photos": [{"photoGuid": "g1", "derivatives": {}}]}
        call_count["n"] += 1
        return resp

    src = ICloudSharedAlbumSource(ALBUM_URL)
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = fake_post
    with patch("httpx.AsyncClient", return_value=mock_client):
        refs = asyncio.run(src.fetch_remote_refs())
    assert src._stream_host == "p12-sharedstreams.icloud.com"
    assert [r.id for r in refs] == ["g1"]


def test_select_derivative_prefers_smallest_gte_1920():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    derivatives = {
        "A": {"width": 1600, "mediaAssetType": "JPEG", "url": "http://example.com/1600.jpg"},
        "B": {"width": 2048, "mediaAssetType": "JPEG", "url": "http://example.com/2048.jpg"},
        "C": {"width": 3200, "mediaAssetType": "JPEG", "url": "http://example.com/3200.jpg"},
    }
    chosen = src._select_derivative(derivatives)
    assert chosen["width"] == 2048  # smallest >= 1920


def test_select_derivative_fallback_to_largest_if_none_gte_1920():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    derivatives = {
        "A": {"width": 800,  "mediaAssetType": "JPEG", "url": "http://example.com/800.jpg"},
        "B": {"width": 1600, "mediaAssetType": "JPEG", "url": "http://example.com/1600.jpg"},
    }
    chosen = src._select_derivative(derivatives)
    assert chosen["width"] == 1600  # fallback to largest


def test_select_derivative_skips_heic():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    derivatives = {
        "A": {"width": 4032, "mediaAssetType": "HEIC", "url": "http://example.com/orig.heic"},
        "B": {"width": 2048, "mediaAssetType": "JPEG", "url": "http://example.com/2048.jpg"},
    }
    chosen = src._select_derivative(derivatives)
    assert chosen["width"] == 2048  # HEIC skipped


def test_select_derivative_returns_none_if_only_heic():
    src = ICloudSharedAlbumSource(ALBUM_URL)
    derivatives = {
        "A": {"width": 4032, "mediaAssetType": "HEIC", "url": "http://example.com/orig.heic"},
    }
    assert src._select_derivative(derivatives) is None


def test_redirect_via_response_header():
    """If X-Apple-MMe-Host is in HTTP headers (not body), it should be followed."""
    call_count = {"n": 0}

    async def fake_post(url, **kwargs):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        if call_count["n"] == 0:
            resp.json.return_value = {}  # no host in body
            resp.headers = {"X-Apple-MMe-Host": "p99-sharedstreams.icloud.com"}
        else:
            resp.json.return_value = {"photos": [{"photoGuid": "g2", "derivatives": {}}]}
            resp.headers = {}
        call_count["n"] += 1
        return resp

    src = ICloudSharedAlbumSource(ALBUM_URL)
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = fake_post
    with patch("httpx.AsyncClient", return_value=mock_client):
        refs = asyncio.run(src.fetch_remote_refs())
    assert src._stream_host == "p99-sharedstreams.icloud.com"
    assert [r.id for r in refs] == ["g2"]


def test_download_writes_file_on_success(tmp_path):
    """download() writes photo bytes to dest when webasseturls returns valid data."""
    src = ICloudSharedAlbumSource(ALBUM_URL)
    src._stream_host = "p06-sharedstreams.icloud.com"

    webasseturls_resp = {
        "items": {
            "guid-aaa": {
                "derivatives": {
                    "2048": {"width": 2048, "mediaAssetType": "JPEG", "url": "https://cdn.example.com/photo.jpg"},
                }
            }
        }
    }

    # Mock httpx.AsyncClient for both webasseturls POST and streaming GET
    post_resp = MagicMock()
    post_resp.raise_for_status = MagicMock()
    post_resp.json.return_value = webasseturls_resp

    stream_resp = AsyncMock()
    stream_resp.raise_for_status = MagicMock()
    # aiter_bytes yields chunks
    async def fake_aiter_bytes(chunk_size=65536):
        yield b"fake-jpeg-bytes"
    stream_resp.aiter_bytes = fake_aiter_bytes
    stream_resp.__aenter__ = AsyncMock(return_value=stream_resp)
    stream_resp.__aexit__ = AsyncMock(return_value=False)

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=post_resp)
    mock_client.stream = MagicMock(return_value=stream_resp)

    dest = tmp_path / "photo.jpg"
    with patch("httpx.AsyncClient", return_value=mock_client):
        asyncio.run(src.download(RemotePhotoRef(id="guid-aaa"), dest))

    assert dest.exists()
    assert dest.read_bytes() == b"fake-jpeg-bytes"


def test_download_raises_when_no_data_for_guid(tmp_path):
    """download() raises ValueError when webasseturls returns no data for the GUID."""
    src = ICloudSharedAlbumSource(ALBUM_URL)

    post_resp = MagicMock()
    post_resp.raise_for_status = MagicMock()
    post_resp.json.return_value = {"items": {}}  # no data for guid

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=post_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ValueError, match="no data for"):
            asyncio.run(src.download(RemotePhotoRef(id="missing-guid"), tmp_path / "x.jpg"))


def test_download_raises_when_no_renderable_derivative(tmp_path):
    """download() raises ValueError when only HEIC derivatives exist."""
    src = ICloudSharedAlbumSource(ALBUM_URL)

    post_resp = MagicMock()
    post_resp.raise_for_status = MagicMock()
    post_resp.json.return_value = {
        "items": {
            "heic-guid": {
                "derivatives": {
                    "orig": {"width": 4032, "mediaAssetType": "HEIC", "url": "https://cdn.example.com/orig.heic"},
                }
            }
        }
    }

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=post_resp)

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ValueError, match="no renderable"):
            asyncio.run(src.download(RemotePhotoRef(id="heic-guid"), tmp_path / "x.jpg"))


def test_webstream_raises_after_too_many_redirects():
    """_webstream() raises ValueError after more than 3 host redirects."""
    src = ICloudSharedAlbumSource(ALBUM_URL)
    call_count = {"n": 0}

    async def always_redirect(url, **kwargs):
        resp = MagicMock()
        resp.raise_for_status = MagicMock()
        resp.headers = {}
        resp.json.return_value = {"X-Apple-MMe-Host": f"p{call_count['n']:02d}-sharedstreams.icloud.com"}
        call_count["n"] += 1
        return resp

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = always_redirect

    with patch("httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(ValueError, match="too many"):
            asyncio.run(src.fetch_remote_refs())


from app.services.photo_sources.syncthing_folder import SyncthingFolderSource

def test_syncthing_source_not_configured_by_default():
    assert SyncthingFolderSource().is_configured() is False

def test_syncthing_fetch_refs_raises():
    with pytest.raises(NotImplementedError):
        asyncio.run(SyncthingFolderSource().fetch_remote_refs())
