"""API client for hospitalpricingfiles.org"""

import time
import httpx

API_BASE = "https://pts.patientrightsadvocatefiles.org"
STORAGE_BASE = "https://storage.patientrightsadvocatefiles.org"
SESSION_ID = "5087494111016062868872034"

STATES = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC", "PR",
]


class APIClient:
    def __init__(self):
        self.http = httpx.Client(timeout=30, follow_redirects=True)
        self.session_token = None
        self.token_expires_at = 0

    def _ensure_session(self):
        if self.session_token and time.time() < self.token_expires_at:
            return
        resp = self.http.post(
            f"{API_BASE}/validate",
            headers={"Content-Type": "application/json"},
            content="{}",
        )
        resp.raise_for_status()
        data = resp.json()
        self.session_token = data["sessionToken"]
        # Token expires in `expires` seconds; refresh a bit early
        self.token_expires_at = time.time() + data.get("expires", 60) - 5

    def _headers(self):
        self._ensure_session()
        return {
            "sessionid": SESSION_ID,
            "ptsessionid": self.session_token,
        }

    def search_facilities(self, state: str, search: str = "") -> list[dict]:
        """Search facilities by state. Returns list of facility dicts."""
        resp = self.http.get(
            f"{API_BASE}/facility/search",
            params={"search": search, "searchstate": state},
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list):
            return data
        return data.get("matches", [])

    def get_facility(self, facility_id: str) -> dict | None:
        """Get a single facility by ID."""
        resp = self.http.get(
            f"{API_BASE}/facility/id/{facility_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and len(data) > 0:
            return data[0]
        return None

    def get_file_link(self, file_id: str) -> str | None:
        """Get a download URL for a file stored as 'cfu'."""
        resp = self.http.get(
            f"{API_BASE}/file/link/{file_id}",
            headers=self._headers(),
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, dict):
            return data.get("url")
        return None

    def get_download_url(self, file_info: dict) -> str | None:
        """Resolve the full download URL for a file.

        For 'cfu' storage files with a project, fetches the relative path
        from /file/link and constructs the full storage URL.
        Falls back to the file's original source URL.
        """
        project = file_info.get("project")
        storage = file_info.get("storage")

        if storage == "cfu" and project:
            rel_path = self.get_file_link(file_info["fileid"])
            if rel_path:
                return f"{STORAGE_BASE}/{project}/{rel_path}"

        # Fallback: try to get a direct link
        rel_path = self.get_file_link(file_info["fileid"])
        if rel_path:
            if rel_path.startswith("http"):
                return rel_path
            if project:
                return f"{STORAGE_BASE}/{project}/{rel_path}"

        return None

    def fetch_all_facilities(self, states: list[str] | None = None, progress_cb=None):
        """Iterate over states and yield every facility dict."""
        target_states = states or STATES
        for state in target_states:
            facilities = self.search_facilities(state)
            for f in facilities:
                yield f
            if progress_cb:
                progress_cb(state, len(facilities))

    def close(self):
        self.http.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
