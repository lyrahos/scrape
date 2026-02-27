// ============================================================================
// Hospital Price Transparency Intelligence Platform — Shared Types
// ============================================================================

// --- Hospitals ---
export interface Hospital {
  hospital_id: string;
  cms_certification_num?: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county?: string;
  area_code?: string;
  latitude?: number;
  longitude?: number;
  hospital_type?: string;
  ownership_type?: string;
  website_url?: string;
  transparency_url?: string;
  created_at: string;
  updated_at: string;
}

// --- Transparency Files ---
export type FileType = 'csv' | 'json' | 'xml' | 'xls' | 'xlsx' | 'pdf' | 'gzip' | 'unknown';
export type FileStatus = 'discovered' | 'downloading' | 'downloaded' | 'processing' | 'processed' | 'error' | 'stale';

export interface TransparencyFile {
  file_id: string;
  hospital_id: string;
  file_url: string;
  file_type: FileType;
  file_hash?: string;
  file_size?: number;
  discovered_at: string;
  last_checked_at?: string;
  last_modified_header?: string;
  is_active: boolean;
  status: FileStatus;
  error_message?: string;
}

// --- Pricing Data ---
export type PriceType =
  | 'gross_charge'
  | 'discounted_cash'
  | 'min_negotiated'
  | 'max_negotiated'
  | 'payer_specific'
  | 'de_identified_min'
  | 'de_identified_max';

export type BillingCodeType = 'CPT' | 'HCPCS' | 'DRG' | 'MS-DRG' | 'APR-DRG' | 'ICD-10' | 'NDC' | 'OTHER';

export interface PricingRecord {
  record_id?: string;
  version_id?: string;
  hospital_id: string;
  billing_code: string;
  billing_code_type: BillingCodeType;
  service_description: string;
  payer?: string;
  plan?: string;
  price_type: PriceType;
  price: number;
  effective_date?: string;
  file_id: string;
  row_hash: string;
  inserted_at?: string;
}

// --- Update Log ---
export type UpdateResult = 'success' | 'no_change' | 'error' | 'file_missing' | 'rediscovery';

export interface UpdateLogEntry {
  log_id?: string;
  hospital_id: string;
  file_id?: string;
  update_attempted_at: string;
  result: UpdateResult;
  rows_added: number;
  rows_changed: number;
  rows_removed: number;
  file_hash_before?: string;
  file_hash_after?: string;
  error_message?: string;
  duration_ms?: number;
}

// --- Analytics ---
export interface StateAverage {
  state: string;
  avg_price: number;
  median_price: number;
  hospital_count: number;
  record_count: number;
}

export interface PriceTrend {
  period: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  record_count: number;
}

export interface VariabilityMetric {
  billing_code: string;
  billing_code_type: BillingCodeType;
  description: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  std_dev: number;
  spread: number;
  hospital_count: number;
}

export interface ComparisonResult {
  period: string;
  local_avg: number;
  regional_avg: number;
  state_avg: number;
  national_avg: number;
  pct_change: number;
}

// --- Semantic Query ---
export interface SemanticQuery {
  raw_text: string;
  extracted_cpt?: string;
  extracted_description?: string;
  extracted_area_code?: string;
  extracted_state?: string;
  extracted_date_range?: { start: string; end: string };
  generated_sql?: string;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  chart_data?: ChartData;
  summary?: string;
}

export interface ChartData {
  type: 'line' | 'bar' | 'scatter' | 'map';
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  color?: string;
}

// --- App State ---
export interface AppSettings {
  db_host: string;
  db_port: number;
  db_name: string;
  db_user: string;
  db_password: string;
  use_local_sqlite: boolean;
  scrape_concurrency: number;
  scrape_delay_ms: number;
  max_retries: number;
  update_interval_days: number;
  auto_update_enabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

export const DEFAULT_SETTINGS: AppSettings = {
  db_host: 'localhost',
  db_port: 5432,
  db_name: 'hospital_transparency',
  db_user: 'postgres',
  db_password: '',
  use_local_sqlite: true,
  scrape_concurrency: 5,
  scrape_delay_ms: 1000,
  max_retries: 3,
  update_interval_days: 30,
  auto_update_enabled: false,
  theme: 'system',
};

// --- IPC Channels ---
export const IPC_CHANNELS = {
  // Hospital
  HOSPITAL_SEARCH: 'hospital:search',
  HOSPITAL_GET: 'hospital:get',
  HOSPITAL_LIST_BY_STATE: 'hospital:listByState',
  HOSPITAL_GET_STATS: 'hospital:getStats',

  // Ingestion
  INGESTION_DISCOVER: 'ingestion:discover',
  INGESTION_SCRAPE_FILE: 'ingestion:scrapeFile',
  INGESTION_STATUS: 'ingestion:status',
  INGESTION_CANCEL: 'ingestion:cancel',

  // Processing
  PROCESSING_NORMALIZE: 'processing:normalize',
  PROCESSING_STATUS: 'processing:status',

  // Update
  UPDATE_CHECK: 'update:check',
  UPDATE_RUN: 'update:run',
  UPDATE_STATUS: 'update:status',
  UPDATE_LOG: 'update:log',

  // Analytics
  ANALYTICS_STATE_MAP: 'analytics:stateMap',
  ANALYTICS_TRENDS: 'analytics:trends',
  ANALYTICS_TRENDS_COMPARISON: 'analytics:trendsComparison',
  ANALYTICS_VARIABILITY: 'analytics:variability',
  ANALYTICS_COMPARISON: 'analytics:comparison',

  // Semantic
  SEMANTIC_QUERY: 'semantic:query',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // DB
  DB_STATUS: 'db:status',
  DB_MIGRATE: 'db:migrate',
} as const;
