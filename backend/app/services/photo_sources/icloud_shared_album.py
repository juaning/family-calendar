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
        # Populated by fetch_remote_refs(); maps photoGuid → derivatives dict
        # from the webstream response. Used in download() to pick the best
        # derivative checksum key before querying webasseturls.
        self._photo_derivatives: dict[str, dict] = {}

    def is_configured(self) -> bool:
        return bool(self._album_url)

    async def _webstream(self, _depth: int = 0) -> dict:
        if _depth > 3:
            raise ValueError("too many iCloud host redirects")
        url = f"https://{self._stream_host}/{self._token}/sharedstreams/webstream"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json={"streamCtag": None})
            # Parse body before raise_for_status: Apple returns 330 with the
            # redirect host in the body, so the redirect check must come first.
            data = resp.json()

        # Follow partition redirect (Apple uses HTTP 330 for this)
        new_host = data.get("X-Apple-MMe-Host") or resp.headers.get("X-Apple-MMe-Host")
        if new_host and new_host != self._stream_host:
            logger.debug("iCloud host redirect: %s → %s", self._stream_host, new_host)
            self._stream_host = new_host
            return await self._webstream(_depth + 1)

        resp.raise_for_status()
        return data

    async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
        data = await self._webstream()
        refs = []
        for p in data.get("photos", []):
            guid = p["photoGuid"]
            self._photo_derivatives[guid] = p.get("derivatives", {})
            refs.append(RemotePhotoRef(id=guid))
        return refs

    def _select_derivative(self, derivatives: dict) -> dict | None:
        """Smallest JPEG derivative value >= 1920px wide; fallback to largest JPEG.

        Used by tests. Returns the derivative dict value (not the key).
        Assumes each value has 'width' and 'mediaAssetType' fields.
        """
        jpeg = []
        for d in derivatives.values():
            asset_type = str(d.get("mediaAssetType", "")).upper()
            if "HEIC" in asset_type or "HEIF" in asset_type:
                continue
            width = int(d.get("width", 0))  # Apple returns width as string in some responses
            jpeg.append((width, d))

        if not jpeg:
            return None

        meets = [(w, d) for w, d in jpeg if w >= 1920]
        if meets:
            return min(meets, key=lambda x: x[0])[1]
        return max(jpeg, key=lambda x: x[0])[1]

    def _select_derivative_key(self, derivatives: dict) -> str | None:
        """Pick the checksum key of the best JPEG derivative from webstream data.

        The real webstream response keys derivatives by their checksum string.
        Returns None if no JPEG derivative is available (e.g. only HEIC).
        """
        jpeg = []
        for key, d in derivatives.items():
            asset_type = str(d.get("mediaAssetType", "")).upper()
            if "HEIC" in asset_type or "HEIF" in asset_type:
                continue
            width = int(d.get("width", 0))  # Apple returns width as string in some responses
            jpeg.append((width, key))

        if not jpeg:
            return None

        meets = [(w, k) for w, k in jpeg if w >= 1920]
        if meets:
            return min(meets, key=lambda x: x[0])[1]
        return max(jpeg, key=lambda x: x[0])[1]

    async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
        # Pick the best derivative checksum from webstream data cached during
        # fetch_remote_refs(). Raises if only HEIC derivatives are available.
        derivatives = self._photo_derivatives.get(ref.id, {})
        preferred_key = self._select_derivative_key(derivatives)
        if derivatives and preferred_key is None:
            raise ValueError(f"no renderable JPEG derivative for {ref.id}")

        # Re-resolve signed URLs immediately before downloading (they expire)
        url = f"https://{self._stream_host}/{self._token}/sharedstreams/webasseturls"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json={"photoGuids": [ref.id]})
            resp.raise_for_status()
            data = resp.json()

        # Real webasseturls response: items keyed by derivative checksum,
        # each item has url_location + url_path; locations maps host → scheme.
        items = data.get("items", {})
        locations = data.get("locations", {})

        # Use preferred key if present; fall back to first available item.
        item = items.get(preferred_key) if preferred_key else None
        if item is None:
            if not items:
                raise ValueError(f"webasseturls returned no items for {ref.id}")
            item = next(iter(items.values()))

        # Construct signed URL from location info
        url_location = item.get("url_location", "")
        url_path = item.get("url_path", "")
        location_info = locations.get(url_location, {})
        scheme = location_info.get("scheme", "https")
        signed_url = f"{scheme}://{url_location}{url_path}"

        if not signed_url.startswith("https://"):
            raise ValueError(
                f"signed URL has unexpected scheme for {ref.id}: {signed_url[:30]}"
            )

        dest.parent.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            async with client.stream("GET", signed_url) as stream:
                stream.raise_for_status()
                with open(dest, "wb") as f:
                    async for chunk in stream.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
