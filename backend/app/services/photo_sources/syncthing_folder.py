from pathlib import Path
from .base import PhotoSource, RemotePhotoRef


class SyncthingFolderSource(PhotoSource):
    """Stub for a future private-LAN photo source via a Syncthing-synced folder.

    Switch to this source by setting PHOTO_SOURCE=syncthing in .env.
    """

    def is_configured(self) -> bool:
        return False

    async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
        raise NotImplementedError("SyncthingFolderSource not yet implemented")

    async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
        raise NotImplementedError("SyncthingFolderSource not yet implemented")
