-- ============================================================================
-- Migration 002: HTTP Status History — Track every check of file URLs
-- ============================================================================

CREATE TABLE IF NOT EXISTS http_status_history (
    check_id            TEXT PRIMARY KEY,
    file_id             TEXT NOT NULL REFERENCES transparency_files(file_id) ON DELETE CASCADE,
    hospital_id         TEXT NOT NULL REFERENCES hospitals(hospital_id),
    checked_at          TEXT NOT NULL DEFAULT (datetime('now')),
    http_status         INTEGER,
    response_time_ms    INTEGER,
    content_length      INTEGER,
    etag                TEXT,
    last_modified       TEXT,
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_hsh_file ON http_status_history(file_id);
CREATE INDEX IF NOT EXISTS idx_hsh_hospital ON http_status_history(hospital_id);
CREATE INDEX IF NOT EXISTS idx_hsh_checked ON http_status_history(checked_at);
