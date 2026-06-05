import logging
from pathlib import Path
from urllib.parse import urlparse

import httpx

from .base import PhotoSource, RemotePhotoRef

logger = logging.getLogger(__name__)
_DEFAULT_HOST = "p06-sharedstreams.icloud.com"


class ICloudSharedAlbumSource(PhotoSource):
    def __init__(self, album_url: str):
        self._album_url = album_url
        self._token = urlparse(album_url).fragment
        self._stream_host: str = _DEFAULT_HOST

    def is_configured(self) -> bool:
        return bool(self._album_url)

    async def _webstream(self, _depth: int = 0) -> dict:
        if _depth > 3:
            raise ValueError("too many iCloud host redirects")
        url = f"https://{self._stream_host}/{self._token}/sharedstreams/webstream"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={"streamCtag": None})
            resp.raise_for_status()
            data = resp.json()

        # Follow partition redirect if present in the response body or headers
        new_host = data.get("X-Apple-MMe-Host") or resp.headers.get("X-Apple-MMe-Host")
        if new_host and new_host != self._stream_host:
            logger.debug("iCloud host redirect: %s → %s", self._stream_host, new_host)
            self._stream_host = new_host
            return await self._webstream(_depth + 1)

        return data

    async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
        data = await self._webstream()
        return [
            RemotePhotoRef(id=p["photoGuid"])
            for p in data.get("photos", [])
        ]

    def _select_derivative(self, derivatives: dict) -> dict | None:
        """
        Smallest JPEG derivative >= 1920px wide; fallback to largest JPEG.

        NOTE: derivative key names and exact field structure are from the unofficial
        iCloud webstream API and must be verified against real album output in Phase D.
        Assumes each derivative value has 'width', 'mediaAssetType', and 'url' fields.
        """
        jpeg = []
        for d in derivatives.values():
            asset_type = str(d.get("mediaAssetType", "")).upper()
            if "HEIC" in asset_type or "HEIF" in asset_type:
                continue
            width = d.get("width", 0)
            jpeg.append((width, d))

        if not jpeg:
            return None

        meets = [(w, d) for w, d in jpeg if w >= 1920]
        if meets:
            return min(meets, key=lambda x: x[0])[1]
        return max(jpeg, key=lambda x: x[0])[1]

    async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
        # Re-resolve the signed URL immediately before downloading
        url = f"https://{self._stream_host}/{self._token}/sharedstreams/webasseturls"
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={"photoGuids": [ref.id]})
            resp.raise_for_status()
            data = resp.json()

        # NOTE: actual webasseturls response structure must be verified
        # against real album output. The structure below matches common
        # observations of the unofficial API but may differ on your album.
        items = data.get("items", {})
        photo_data = items.get(ref.id)
        if not photo_data:
            raise ValueError(f"webasseturls returned no data for {ref.id}")

        derivatives = photo_data.get("derivatives", {})
        chosen = self._select_derivative(derivatives)
        if chosen is None:
            raise ValueError(f"no renderable JPEG derivative for {ref.id}")

        signed_url = chosen.get("url")
        if not signed_url:
            raise ValueError(f"chosen derivative has no url for {ref.id}")
        if not signed_url.startswith("https://"):
            raise ValueError(f"signed URL has unexpected scheme for {ref.id}: {signed_url[:30]}")

        dest.parent.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(follow_redirects=True) as client:
            async with client.stream("GET", signed_url) as stream:
                stream.raise_for_status()
                with open(dest, "wb") as f:
                    async for chunk in stream.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
