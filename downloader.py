"""Download CSV files from hospital pricing API."""

import os
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
from tqdm import tqdm

from api_client import APIClient
from database import mark_file_downloaded

DOWNLOAD_DIR = "downloads"
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds


def download_file(url: str, dest: Path, timeout: int = 300) -> bool:
    """Download a single file with resume support. Returns True on success."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")

    headers = {}
    start_byte = 0
    if tmp.exists():
        start_byte = tmp.stat().st_size
        headers["Range"] = f"bytes={start_byte}-"

    for attempt in range(MAX_RETRIES):
        try:
            with httpx.stream("GET", url, headers=headers, timeout=timeout, follow_redirects=True) as resp:
                if resp.status_code == 416:
                    # Range not satisfiable — file already complete
                    if tmp.exists():
                        tmp.rename(dest)
                    return True
                resp.raise_for_status()
                mode = "ab" if start_byte > 0 and resp.status_code == 206 else "wb"
                with open(tmp, mode) as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
            tmp.rename(dest)
            return True
        except (httpx.HTTPError, OSError) as e:
            wait = RETRY_BACKOFF * (2 ** attempt)
            print(f"  Retry {attempt+1}/{MAX_RETRIES} for {dest.name}: {e} (waiting {wait}s)")
            time.sleep(wait)
    return False


def download_pending(conn, client: APIClient, states=None, workers: int = 4):
    """Download all pending CSV files."""
    from database import get_pending_files

    pending = get_pending_files(conn, states)
    if not pending:
        print("No pending CSV downloads.")
        return

    total_bytes = sum(f.get("size") or 0 for f in pending)
    print(f"Downloading {len(pending)} CSVs ({total_bytes / 1e9:.1f} GB total)")

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    # Pre-resolve all URLs from the main thread to avoid API rate limiting
    # from too many threads
    print("Resolving download URLs...")
    url_map = {}
    for file_rec in tqdm(pending, desc="Resolving URLs", unit="file"):
        url_map[file_rec["fileid"]] = client.get_download_url(file_rec)

    def _do_download(file_rec):
        fid = file_rec["fileid"]
        fname = file_rec["filename"]
        state = file_rec["state"]
        dest = Path(DOWNLOAD_DIR) / state / fname

        if dest.exists():
            return fid, fname, str(dest), True, "already exists"

        url = url_map.get(fid)
        if not url:
            return fid, fname, None, False, "no URL"

        ok = download_file(url, dest)
        return fid, fname, str(dest) if ok else None, ok, "ok" if ok else "failed"

    success = 0
    failed = 0
    # Collect results and update DB from the main thread
    results = []
    with tqdm(total=len(pending), desc="Downloading", unit="file") as pbar:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_do_download, f): f for f in pending}
            for future in as_completed(futures):
                fid, fname, local_path, ok, msg = future.result()
                results.append((fid, local_path, ok))
                if ok:
                    success += 1
                else:
                    failed += 1
                    tqdm.write(f"  FAILED: {fname} ({msg})")
                pbar.update(1)

    # Update database from main thread
    for fid, local_path, ok in results:
        if ok and local_path:
            mark_file_downloaded(conn, fid, local_path)

    print(f"Done: {success} downloaded, {failed} failed")
