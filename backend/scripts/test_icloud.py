"""
Standalone smoke-test for ICloudSharedAlbumSource.
Run with a real ICLOUD_SHARED_ALBUM_URL set in your environment.

Usage:
    cd backend
    ICLOUD_SHARED_ALBUM_URL="https://www.icloud.com/photos/..." \\
        python scripts/test_icloud.py
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.photo_sources.icloud_shared_album import ICloudSharedAlbumSource


async def main():
    url = os.environ.get("ICLOUD_SHARED_ALBUM_URL", "")
    if not url:
        print("ERROR: Set ICLOUD_SHARED_ALBUM_URL in your environment.")
        sys.exit(1)

    src = ICloudSharedAlbumSource(url)
    print(f"Token: {src._token}")
    print(f"Fetching photo refs from {src._stream_host} ...")
    refs = await src.fetch_remote_refs()
    print(f"Found {len(refs)} photos")
    if not refs:
        print("Album is empty or URL is wrong.")
        return

    # Inspect the first photo's derivatives to verify key names
    print(f"\nFirst ref: {refs[0].id}")
    print("Downloading first photo to /tmp/test_photo.jpg ...")
    dest = Path("/tmp/test_photo.jpg")
    try:
        await src.download(refs[0], dest)
        print(f"Downloaded {dest.stat().st_size} bytes to {dest}")
        print("SUCCESS — open /tmp/test_photo.jpg to confirm it renders correctly.")
    except Exception as e:
        print(f"DOWNLOAD FAILED: {e}")
        print("\nHint: inspect the webasseturls response structure by adding a print(data)")
        print("to ICloudSharedAlbumSource.download() and re-running.")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
