import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path

import app.config as config
from app.db import get_conn
from app.services.photo_sources.base import PhotoSource

logger = logging.getLogger(__name__)


class PhotoService:
    def __init__(self, source: PhotoSource, cache_dir: Path,
                 download_delay: float = 0.5):
        self._source = source
        self._cache_dir = cache_dir
        self._download_delay = download_delay

    def list_photos(self) -> list[dict]:
        try:
            with get_conn() as conn:
                rows = conn.execute(
                    "SELECT id FROM photos ORDER BY cached_at ASC"
                ).fetchall()
            return [{"id": r["id"], "url": f"/api/photos/{r['id']}"} for r in rows]
        except Exception:
            logger.exception("list_photos failed")
            return []

    async def refresh(self) -> None:
        if not self._source.is_configured():
            return

        logger.info("photo refresh started")

        try:
            remote_refs = await self._source.fetch_remote_refs()
        except Exception:
            logger.exception("fetch_remote_refs failed")
            return

        remote_ids = {r.id for r in remote_refs}

        with get_conn() as conn:
            rows = conn.execute("SELECT id, local_path FROM photos").fetchall()
        cached = {r["id"]: r["local_path"] for r in rows}
        cached_ids = set(cached)

        new_refs = [r for r in remote_refs if r.id not in cached_ids]
        logger.info("photo refresh: %d new photo(s) to fetch, %d already cached",
                    len(new_refs), len(cached_ids))

        # Download new photos one at a time with a throttle delay
        for ref in new_refs:
            dest = self._cache_dir / f"{ref.id}.jpg"
            try:
                await self._source.download(ref, dest)
                now = datetime.now(timezone.utc).isoformat()
                with get_conn() as conn:
                    conn.execute(
                        "INSERT OR IGNORE INTO photos (id, local_path, cached_at) VALUES (?,?,?)",
                        (ref.id, str(dest), now),
                    )
                logger.info("cached photo %s", ref.id)
            except Exception:
                logger.exception("download failed for %s", ref.id)
            await asyncio.sleep(self._download_delay)

        # Prune stale photos
        for photo_id, local_path in cached.items():
            if photo_id in remote_ids:
                continue
            try:
                Path(local_path).unlink(missing_ok=True)  # file first
                with get_conn() as conn:
                    conn.execute("DELETE FROM photos WHERE id=?", (photo_id,))
                logger.info("pruned photo %s", photo_id)
            except Exception:
                logger.exception("failed to prune photo %s", photo_id)

        logger.info("photo refresh complete")


def _make_source(source_name: str, album_url: str) -> PhotoSource:
    if source_name == "syncthing":
        from app.services.photo_sources.syncthing_folder import SyncthingFolderSource
        return SyncthingFolderSource()
    from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource
    return ICloudSharedAlbumSource(album_url)


def make_photo_service() -> "PhotoService":
    source = _make_source(config.PHOTO_SOURCE, config.ICLOUD_SHARED_ALBUM_URL)
    return PhotoService(
        source,
        Path(config.PHOTO_CACHE_DIR),
        download_delay=config.PHOTO_DOWNLOAD_DELAY_SECONDS,
    )


async def photo_refresh_loop(service: "PhotoService",
                             startup_delay: float = 30.0) -> None:
    logger.info("photo refresh loop starting; first refresh in %ds", int(startup_delay))
    await asyncio.sleep(startup_delay)
    while True:
        try:
            await service.refresh()
        except Exception:
            logger.exception("photo_refresh_loop error")
        await asyncio.sleep(config.SLIDESHOW_REFRESH_SECONDS)
