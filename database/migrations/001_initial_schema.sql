-- ============================================================================
-- Hospital Price Transparency Intelligence Platform
-- Migration 001: Initial Schema
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- HOSPITALS
-- ============================================================================
CREATE TABLE hospitals (
    hospital_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cms_certification_num VARCHAR(10) UNIQUE,
    name              TEXT NOT NULL,
    address           TEXT NOT NULL,
    city              TEXT NOT NULL,
    state             VARCHAR(2) NOT NULL,
    zip               VARCHAR(10) NOT NULL,
    county            TEXT,
    area_code         VARCHAR(3),
    latitude          DOUBLE PRECISION,
    longitude         DOUBLE PRECISION,
    geom              GEOMETRY(Point, 4326),
    hospital_type     TEXT,
    ownership_type    TEXT,
    website_url       TEXT,
    transparency_url  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hospitals_state ON hospitals(state);
CREATE INDEX idx_hospitals_zip ON hospitals(zip);
CREATE INDEX idx_hospitals_area_code ON hospitals(area_code);
CREATE INDEX idx_hospitals_name_trgm ON hospitals USING gin(name gin_trgm_ops);
CREATE INDEX idx_hospitals_city ON hospitals(city);
CREATE INDEX idx_hospitals_geom ON hospitals USING gist(geom);

-- Trigger to auto-update geom from lat/lng
CREATE OR REPLACE FUNCTION update_hospital_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hospital_geom
    BEFORE INSERT OR UPDATE ON hospitals
    FOR EACH ROW EXECUTE FUNCTION update_hospital_geom();

-- ============================================================================
-- TRANSPARENCY FILES
-- ============================================================================
CREATE TABLE transparency_files (
    file_id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id         UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    file_url            TEXT NOT NULL,
    file_type           VARCHAR(10) NOT NULL DEFAULT 'unknown',
    file_hash           VARCHAR(64),
    file_size           BIGINT,
    discovered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_checked_at     TIMESTAMPTZ,
    last_modified_header TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    status              VARCHAR(20) NOT NULL DEFAULT 'discovered',
    error_message       TEXT,

    CONSTRAINT chk_file_type CHECK (file_type IN ('csv','json','xml','xls','xlsx','pdf','gzip','unknown')),
    CONSTRAINT chk_status CHECK (status IN ('discovered','downloading','downloaded','processing','processed','error','stale'))
);

CREATE INDEX idx_tf_hospital ON transparency_files(hospital_id);
CREATE INDEX idx_tf_status ON transparency_files(status);
CREATE INDEX idx_tf_active ON transparency_files(is_active) WHERE is_active = TRUE;
CREATE UNIQUE INDEX idx_tf_url_hospital ON transparency_files(hospital_id, file_url);

-- ============================================================================
-- PRICING DATA — CURRENT (Snapshot for fast queries)
-- ============================================================================
CREATE TABLE pricing_data_current (
    record_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id         UUID NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    billing_code        VARCHAR(20) NOT NULL,
    billing_code_type   VARCHAR(10) NOT NULL DEFAULT 'OTHER',
    service_description TEXT NOT NULL,
    payer               TEXT,
    plan                TEXT,
    price_type          VARCHAR(30) NOT NULL,
    price               NUMERIC(12,2) NOT NULL,
    effective_date      DATE,
    file_id             UUID REFERENCES transparency_files(file_id),
    row_hash            VARCHAR(64) NOT NULL,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_billing_type CHECK (billing_code_type IN ('CPT','HCPCS','DRG','MS-DRG','APR-DRG','ICD-10','NDC','OTHER')),
    CONSTRAINT chk_price_type CHECK (price_type IN ('gross_charge','discounted_cash','min_negotiated','max_negotiated','payer_specific','de_identified_min','de_identified_max'))
);

-- Composite index for deduplication key
CREATE UNIQUE INDEX idx_pdc_dedup ON pricing_data_current(hospital_id, billing_code, payer, price_type, COALESCE(effective_date, '1900-01-01'));
CREATE INDEX idx_pdc_billing ON pricing_data_current(billing_code);
CREATE INDEX idx_pdc_billing_type ON pricing_data_current(billing_code_type);
CREATE INDEX idx_pdc_hospital ON pricing_data_current(hospital_id);
CREATE INDEX idx_pdc_payer ON pricing_data_current(payer);
CREATE INDEX idx_pdc_price_type ON pricing_data_current(price_type);
CREATE INDEX idx_pdc_price ON pricing_data_current(price);

-- ============================================================================
-- PRICING DATA — HISTORY (Immutable, append-only, never overwrite)
-- ============================================================================
CREATE TABLE pricing_data_history (
    version_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    record_id           UUID NOT NULL,
    hospital_id         UUID NOT NULL REFERENCES hospitals(hospital_id),
    billing_code        VARCHAR(20) NOT NULL,
    billing_code_type   VARCHAR(10) NOT NULL DEFAULT 'OTHER',
    service_description TEXT NOT NULL,
    payer               TEXT,
    plan                TEXT,
    price_type          VARCHAR(30) NOT NULL,
    price               NUMERIC(12,2) NOT NULL,
    effective_date      DATE,
    file_id             UUID REFERENCES transparency_files(file_id),
    row_hash            VARCHAR(64) NOT NULL,
    inserted_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    superseded_at       TIMESTAMPTZ,
    is_current          BOOLEAN NOT NULL DEFAULT TRUE
) PARTITION BY RANGE (inserted_at);

-- Create yearly partitions
CREATE TABLE pricing_data_history_2024 PARTITION OF pricing_data_history
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
CREATE TABLE pricing_data_history_2025 PARTITION OF pricing_data_history
    FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');
CREATE TABLE pricing_data_history_2026 PARTITION OF pricing_data_history
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE pricing_data_history_2027 PARTITION OF pricing_data_history
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

CREATE INDEX idx_pdh_record ON pricing_data_history(record_id);
CREATE INDEX idx_pdh_hospital ON pricing_data_history(hospital_id);
CREATE INDEX idx_pdh_billing ON pricing_data_history(billing_code);
CREATE INDEX idx_pdh_inserted ON pricing_data_history(inserted_at);
CREATE INDEX idx_pdh_current ON pricing_data_history(is_current) WHERE is_current = TRUE;

-- ============================================================================
-- UPDATE LOG
-- ============================================================================
CREATE TABLE update_log (
    log_id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hospital_id         UUID NOT NULL REFERENCES hospitals(hospital_id),
    file_id             UUID REFERENCES transparency_files(file_id),
    update_attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result              VARCHAR(20) NOT NULL,
    rows_added          INTEGER NOT NULL DEFAULT 0,
    rows_changed        INTEGER NOT NULL DEFAULT 0,
    rows_removed        INTEGER NOT NULL DEFAULT 0,
    file_hash_before    VARCHAR(64),
    file_hash_after     VARCHAR(64),
    error_message       TEXT,
    duration_ms         INTEGER,

    CONSTRAINT chk_result CHECK (result IN ('success','no_change','error','file_missing','rediscovery'))
);

CREATE INDEX idx_ul_hospital ON update_log(hospital_id);
CREATE INDEX idx_ul_attempted ON update_log(update_attempted_at);
CREATE INDEX idx_ul_result ON update_log(result);

-- ============================================================================
-- MATERIALIZED VIEW: State pricing summary for heat map
-- ============================================================================
CREATE MATERIALIZED VIEW mv_state_pricing_summary AS
SELECT
    h.state,
    pdc.billing_code,
    pdc.billing_code_type,
    pdc.price_type,
    COUNT(DISTINCT h.hospital_id) AS hospital_count,
    COUNT(*) AS record_count,
    AVG(pdc.price) AS avg_price,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pdc.price) AS median_price,
    MIN(pdc.price) AS min_price,
    MAX(pdc.price) AS max_price,
    STDDEV(pdc.price) AS std_dev
FROM pricing_data_current pdc
JOIN hospitals h ON h.hospital_id = pdc.hospital_id
GROUP BY h.state, pdc.billing_code, pdc.billing_code_type, pdc.price_type;

CREATE UNIQUE INDEX idx_mv_state_summary
    ON mv_state_pricing_summary(state, billing_code, price_type);

-- ============================================================================
-- MATERIALIZED VIEW: Monthly trends
-- ============================================================================
CREATE MATERIALIZED VIEW mv_monthly_trends AS
SELECT
    date_trunc('month', pdh.inserted_at) AS period,
    h.state,
    h.area_code,
    pdh.billing_code,
    pdh.billing_code_type,
    pdh.price_type,
    AVG(pdh.price) AS avg_price,
    MIN(pdh.price) AS min_price,
    MAX(pdh.price) AS max_price,
    COUNT(*) AS record_count
FROM pricing_data_history pdh
JOIN hospitals h ON h.hospital_id = pdh.hospital_id
GROUP BY
    date_trunc('month', pdh.inserted_at),
    h.state, h.area_code,
    pdh.billing_code, pdh.billing_code_type, pdh.price_type;

CREATE INDEX idx_mv_trends_period ON mv_monthly_trends(period);
CREATE INDEX idx_mv_trends_billing ON mv_monthly_trends(billing_code);

-- ============================================================================
-- FUNCTION: Refresh materialized views
-- ============================================================================
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_state_pricing_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_trends;
END;
$$ LANGUAGE plpgsql;
