from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RemotePhotoRef:
    id: str  # stable GUID from source — NO signed URL (short-lived)


class PhotoSource(ABC):
    @abstractmethod
    def is_configured(self) -> bool: ...

    @abstractmethod
    async def fetch_remote_refs(self) -> list[RemotePhotoRef]:
        """Return current set of stable photo IDs from the remote source."""
        ...

    @abstractmethod
    async def download(self, ref: RemotePhotoRef, dest: Path) -> None:
        """Download ref to dest. Re-resolve signed URLs immediately before
        streaming bytes. Prefer smallest JPEG >= 1920px wide; skip HEIC."""
        ...
