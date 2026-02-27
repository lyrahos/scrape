-- ============================================================================
-- Hospital Price Transparency Intelligence Platform
-- Migration 001: SQLite Schema (Local Mode)
-- ============================================================================

-- ============================================================================
-- HOSPITALS
-- ============================================================================
CREATE TABLE IF NOT EXISTS hospitals (
    hospital_id       TEXT PRIMARY KEY,
    cms_certification_num TEXT UNIQUE,
    name              TEXT NOT NULL,
    address           TEXT NOT NULL,
    city              TEXT NOT NULL,
    state             TEXT NOT NULL,
    zip               TEXT NOT NULL,
    county            TEXT,
    area_code         TEXT,
    latitude          REAL,
    longitude         REAL,
    hospital_type     TEXT,
    ownership_type    TEXT,
    website_url       TEXT,
    transparency_url  TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hospitals_state ON hospitals(state);
CREATE INDEX IF NOT EXISTS idx_hospitals_zip ON hospitals(zip);
CREATE INDEX IF NOT EXISTS idx_hospitals_area_code ON hospitals(area_code);
CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals(city);
CREATE INDEX IF NOT EXISTS idx_hospitals_name ON hospitals(name);

-- ============================================================================
-- TRANSPARENCY FILES
-- ============================================================================
CREATE TABLE IF NOT EXISTS transparency_files (
    file_id             TEXT PRIMARY KEY,
    hospital_id         TEXT NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    file_url            TEXT NOT NULL,
    file_type           TEXT NOT NULL DEFAULT 'unknown',
    file_hash           TEXT,
    file_size           INTEGER,
    discovered_at       TEXT NOT NULL DEFAULT (datetime('now')),
    last_checked_at     TEXT,
    last_modified_header TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'discovered',
    error_message       TEXT
);

CREATE INDEX IF NOT EXISTS idx_tf_hospital ON transparency_files(hospital_id);
CREATE INDEX IF NOT EXISTS idx_tf_status ON transparency_files(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_url_hospital ON transparency_files(hospital_id, file_url);

-- ============================================================================
-- PRICING DATA — CURRENT
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_data_current (
    record_id           TEXT PRIMARY KEY,
    hospital_id         TEXT NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    billing_code        TEXT NOT NULL,
    billing_code_type   TEXT NOT NULL DEFAULT 'OTHER',
    service_description TEXT NOT NULL,
    payer               TEXT,
    plan                TEXT,
    price_type          TEXT NOT NULL,
    price               REAL NOT NULL,
    effective_date      TEXT,
    file_id             TEXT REFERENCES transparency_files(file_id),
    row_hash            TEXT NOT NULL,
    inserted_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pdc_dedup ON pricing_data_current(
    hospital_id, billing_code, COALESCE(payer, ''), price_type, COALESCE(effective_date, '1900-01-01')
);
CREATE INDEX IF NOT EXISTS idx_pdc_billing ON pricing_data_current(billing_code);
CREATE INDEX IF NOT EXISTS idx_pdc_billing_type ON pricing_data_current(billing_code_type);
CREATE INDEX IF NOT EXISTS idx_pdc_hospital ON pricing_data_current(hospital_id);
CREATE INDEX IF NOT EXISTS idx_pdc_payer ON pricing_data_current(payer);
CREATE INDEX IF NOT EXISTS idx_pdc_price_type ON pricing_data_current(price_type);

-- ============================================================================
-- PRICING DATA — HISTORY (append-only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_data_history (
    version_id          TEXT PRIMARY KEY,
    record_id           TEXT NOT NULL,
    hospital_id         TEXT NOT NULL REFERENCES hospitals(hospital_id),
    billing_code        TEXT NOT NULL,
    billing_code_type   TEXT NOT NULL DEFAULT 'OTHER',
    service_description TEXT NOT NULL,
    payer               TEXT,
    plan                TEXT,
    price_type          TEXT NOT NULL,
    price               REAL NOT NULL,
    effective_date      TEXT,
    file_id             TEXT REFERENCES transparency_files(file_id),
    row_hash            TEXT NOT NULL,
    inserted_at         TEXT NOT NULL DEFAULT (datetime('now')),
    superseded_at       TEXT,
    is_current          INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_pdh_record ON pricing_data_history(record_id);
CREATE INDEX IF NOT EXISTS idx_pdh_hospital ON pricing_data_history(hospital_id);
CREATE INDEX IF NOT EXISTS idx_pdh_billing ON pricing_data_history(billing_code);
CREATE INDEX IF NOT EXISTS idx_pdh_inserted ON pricing_data_history(inserted_at);
CREATE INDEX IF NOT EXISTS idx_pdh_current ON pricing_data_history(is_current);

-- ============================================================================
-- UPDATE LOG
-- ============================================================================
CREATE TABLE IF NOT EXISTS update_log (
    log_id              TEXT PRIMARY KEY,
    hospital_id         TEXT NOT NULL REFERENCES hospitals(hospital_id),
    file_id             TEXT REFERENCES transparency_files(file_id),
    update_attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
    result              TEXT NOT NULL,
    rows_added          INTEGER NOT NULL DEFAULT 0,
    rows_changed        INTEGER NOT NULL DEFAULT 0,
    rows_removed        INTEGER NOT NULL DEFAULT 0,
    file_hash_before    TEXT,
    file_hash_after     TEXT,
    error_message       TEXT,
    duration_ms         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ul_hospital ON update_log(hospital_id);
CREATE INDEX IF NOT EXISTS idx_ul_attempted ON update_log(update_attempted_at);
CREATE INDEX IF NOT EXISTS idx_ul_result ON update_log(result);
