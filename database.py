"""SQLite database for hospital pricing data."""

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB = "hospital_pricing.db"


def connect(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")  # 64MB cache
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


def create_schema(conn: sqlite3.Connection):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS facilities (
            id            TEXT PRIMARY KEY,
            name          TEXT NOT NULL,
            address       TEXT,
            city          TEXT,
            state         TEXT,
            zip           TEXT,
            phone         TEXT,
            beds          INTEGER,
            lat           REAL,
            long          REAL,
            ccn           TEXT,
            url           TEXT
        );

        CREATE TABLE IF NOT EXISTS files (
            fileid        TEXT PRIMARY KEY,
            facility_id   TEXT NOT NULL REFERENCES facilities(id),
            filename      TEXT,
            filesuffix    TEXT,
            filetype      TEXT,
            retrieved     TEXT,
            size          INTEGER,
            source_url    TEXT,
            pageurl       TEXT,
            converted     INTEGER DEFAULT 0,
            storage       TEXT,
            project       TEXT,
            downloaded    INTEGER DEFAULT 0,
            local_path    TEXT
        );

        CREATE TABLE IF NOT EXISTS pricing (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            facility_id     TEXT NOT NULL REFERENCES facilities(id),
            fileid          TEXT NOT NULL REFERENCES files(fileid),
            hospital_name   TEXT,
            description     TEXT,
            code            TEXT,
            code_type       TEXT,
            payer           TEXT,
            plan            TEXT,
            gross_charge          REAL,
            discounted_cash       REAL,
            negotiated_rate       REAL,
            min_negotiated        REAL,
            max_negotiated        REAL,
            additional_generic_notes TEXT,
            raw_columns     TEXT
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at  TEXT NOT NULL,
            finished_at TEXT,
            new_files   INTEGER DEFAULT 0,
            updated_files INTEGER DEFAULT 0,
            new_pricing_rows INTEGER DEFAULT 0,
            status      TEXT DEFAULT 'running'
        );

        CREATE INDEX IF NOT EXISTS idx_facilities_state ON facilities(state);
        CREATE INDEX IF NOT EXISTS idx_files_facility ON files(facility_id);
        CREATE INDEX IF NOT EXISTS idx_files_downloaded ON files(downloaded);
        CREATE INDEX IF NOT EXISTS idx_pricing_facility ON pricing(facility_id);
        CREATE INDEX IF NOT EXISTS idx_pricing_code ON pricing(code);
        CREATE INDEX IF NOT EXISTS idx_pricing_payer ON pricing(payer);
    """)
    conn.commit()


def upsert_facility(conn: sqlite3.Connection, facility: dict):
    conn.execute("""
        INSERT INTO facilities (id, name, address, city, state, zip, phone, beds, lat, long, ccn, url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            name=excluded.name, address=excluded.address, city=excluded.city,
            state=excluded.state, zip=excluded.zip, phone=excluded.phone,
            beds=excluded.beds, lat=excluded.lat, long=excluded.long,
            ccn=excluded.ccn, url=excluded.url
    """, (
        facility["id"], facility["name"], facility.get("address"),
        facility.get("city"), facility.get("state"), facility.get("zip"),
        facility.get("phone"), _int(facility.get("beds")),
        _float(facility.get("lat")), _float(facility.get("long")),
        facility.get("ccn"), facility.get("url"),
    ))


def upsert_file(conn: sqlite3.Connection, facility_id: str, file_info: dict) -> str:
    """Insert or update a file record. Returns 'new', 'updated', or 'unchanged'."""
    fileid = file_info["fileid"]
    new_retrieved = file_info.get("retrieved")
    new_project = file_info.get("project")

    # Check if file already exists and if its data has changed
    existing = conn.execute(
        "SELECT retrieved, project, downloaded FROM files WHERE fileid=?",
        (fileid,),
    ).fetchone()

    if existing:
        old_retrieved, old_project, was_downloaded = existing
        data_changed = (new_retrieved != old_retrieved) or (new_project != old_project)

        if data_changed and was_downloaded:
            # File was updated on the source — reset download state and purge old pricing
            conn.execute("UPDATE files SET downloaded=0, local_path=NULL WHERE fileid=?", (fileid,))
            conn.execute("DELETE FROM pricing WHERE fileid=?", (fileid,))
            # Delete old local file if it exists
            row = conn.execute("SELECT local_path FROM files WHERE fileid=?", (fileid,)).fetchone()
            if row and row[0]:
                p = Path(row[0])
                if p.exists():
                    p.unlink()

    conn.execute("""
        INSERT INTO files (fileid, facility_id, filename, filesuffix, filetype,
                           retrieved, size, source_url, pageurl, converted, storage, project)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(fileid) DO UPDATE SET
            filename=excluded.filename, filesuffix=excluded.filesuffix,
            filetype=excluded.filetype, retrieved=excluded.retrieved,
            size=excluded.size, source_url=excluded.source_url,
            pageurl=excluded.pageurl, converted=excluded.converted,
            storage=excluded.storage, project=excluded.project
    """, (
        fileid, facility_id, file_info.get("filename"),
        file_info.get("filesuffix"), file_info.get("filetype"),
        new_retrieved, _int(file_info.get("size")),
        file_info.get("url"), file_info.get("pageurl"),
        1 if file_info.get("converted") else 0,
        file_info.get("storage"), new_project,
    ))

    if not existing:
        return "new"
    if existing and (new_retrieved != existing[0] or new_project != existing[1]):
        return "updated"
    return "unchanged"


def mark_file_downloaded(conn: sqlite3.Connection, fileid: str, local_path: str):
    conn.execute(
        "UPDATE files SET downloaded=1, local_path=? WHERE fileid=?",
        (local_path, fileid),
    )
    conn.commit()


def get_pending_files(conn: sqlite3.Connection, states: list[str] | None = None) -> list[dict]:
    """Return files not yet downloaded, optionally filtered by state."""
    query = """
        SELECT f.fileid, f.facility_id, f.filename, f.filesuffix, f.storage,
               f.size, f.source_url, f.project,
               fac.name, fac.state
        FROM files f
        JOIN facilities fac ON f.facility_id = fac.id
        WHERE f.downloaded = 0 AND f.filesuffix = 'csv'
    """
    params = []
    if states:
        placeholders = ",".join("?" for _ in states)
        query += f" AND fac.state IN ({placeholders})"
        params.extend(states)
    query += " ORDER BY f.size ASC"
    cur = conn.execute(query, params)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def get_loaded_files(conn: sqlite3.Connection) -> set[str]:
    """Return set of fileids that already have pricing rows loaded."""
    cur = conn.execute("SELECT DISTINCT fileid FROM pricing")
    return {row[0] for row in cur.fetchall()}


def insert_pricing_batch(conn: sqlite3.Connection, rows: list[tuple]):
    conn.executemany("""
        INSERT INTO pricing (facility_id, fileid, hospital_name, description,
                             code, code_type, payer, plan,
                             gross_charge, discounted_cash, negotiated_rate,
                             min_negotiated, max_negotiated,
                             additional_generic_notes, raw_columns)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, rows)


def start_sync_log(conn: sqlite3.Connection) -> int:
    """Create a new sync log entry. Returns the log ID."""
    now = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        "INSERT INTO sync_log (started_at) VALUES (?)", (now,)
    )
    conn.commit()
    return cur.lastrowid


def finish_sync_log(conn: sqlite3.Connection, log_id: int,
                    new_files: int, updated_files: int, new_pricing_rows: int):
    now = datetime.now(timezone.utc).isoformat()
    conn.execute("""
        UPDATE sync_log SET finished_at=?, new_files=?, updated_files=?,
               new_pricing_rows=?, status='done'
        WHERE id=?
    """, (now, new_files, updated_files, new_pricing_rows, log_id))
    conn.commit()


def get_last_sync(conn: sqlite3.Connection) -> dict | None:
    cur = conn.execute(
        "SELECT started_at, finished_at, new_files, updated_files, new_pricing_rows, status "
        "FROM sync_log ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return None
    return dict(zip(
        ["started_at", "finished_at", "new_files", "updated_files", "new_pricing_rows", "status"],
        row,
    ))


def get_stats(conn: sqlite3.Connection) -> dict:
    stats = {}
    stats["facilities"] = conn.execute("SELECT COUNT(*) FROM facilities").fetchone()[0]
    stats["files"] = conn.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    stats["csv_files"] = conn.execute(
        "SELECT COUNT(*) FROM files WHERE filesuffix='csv'"
    ).fetchone()[0]
    stats["downloaded"] = conn.execute(
        "SELECT COUNT(*) FROM files WHERE downloaded=1"
    ).fetchone()[0]
    stats["pricing_rows"] = conn.execute("SELECT COUNT(*) FROM pricing").fetchone()[0]
    stats["total_size_gb"] = round(
        (conn.execute("SELECT COALESCE(SUM(size),0) FROM files WHERE filesuffix='csv'")
         .fetchone()[0] or 0) / 1e9, 2
    )
    return stats


def _int(val):
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
