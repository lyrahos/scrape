// ============================================================================
// Database Abstraction Layer — SQLite (local) + PostgreSQL (optional)
// ============================================================================
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { v4 as uuid } from 'crypto';

export interface DatabaseAdapter {
  run(sql: string, params?: unknown[]): void;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | undefined;
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const userDataPath = app?.getPath('userData') ?? process.cwd();
    const fullPath = dbPath ?? path.join(userDataPath, 'hospital_transparency.db');

    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(fullPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
  }

  run(sql: string, params: unknown[] = []): void {
    this.db.prepare(sql).run(...params);
  }

  get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

export function generateId(): string {
  // Generate UUID v4 without external dependency
  const bytes = new Uint8Array(16);
  if (!globalThis.crypto?.getRandomValues?.(bytes)) {
    bytes.forEach((_, i, arr) => (arr[i] = Math.floor(Math.random() * 256)));
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let dbInstance: DatabaseAdapter | null = null;

export function getDatabase(dbPath?: string): DatabaseAdapter {
  if (!dbInstance) {
    dbInstance = new SQLiteAdapter(dbPath);
  }
  return dbInstance;
}

export function initializeDatabase(dbPath?: string): void {
  const db = getDatabase(dbPath);
  const migrationPath = path.join(__dirname, '../../database/migrations/001_initial_schema_sqlite.sql');

  let sql: string;
  if (fs.existsSync(migrationPath)) {
    sql = fs.readFileSync(migrationPath, 'utf-8');
  } else {
    // Fallback: inline schema for packaged app
    sql = getInlineSchema();
  }

  db.exec(sql);
}

function getInlineSchema(): string {
  return `
    CREATE TABLE IF NOT EXISTS hospitals (
      hospital_id TEXT PRIMARY KEY, cms_certification_num TEXT UNIQUE,
      name TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL,
      state TEXT NOT NULL, zip TEXT NOT NULL, county TEXT, area_code TEXT,
      latitude REAL, longitude REAL, hospital_type TEXT, ownership_type TEXT,
      website_url TEXT, transparency_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hospitals_state ON hospitals(state);
    CREATE INDEX IF NOT EXISTS idx_hospitals_zip ON hospitals(zip);
    CREATE INDEX IF NOT EXISTS idx_hospitals_name ON hospitals(name);

    CREATE TABLE IF NOT EXISTS transparency_files (
      file_id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
      file_url TEXT NOT NULL, file_type TEXT NOT NULL DEFAULT 'unknown',
      file_hash TEXT, file_size INTEGER,
      discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked_at TEXT, last_modified_header TEXT,
      is_active INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'discovered',
      error_message TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tf_hospital ON transparency_files(hospital_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tf_url_hospital ON transparency_files(hospital_id, file_url);

    CREATE TABLE IF NOT EXISTS pricing_data_current (
      record_id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
      billing_code TEXT NOT NULL, billing_code_type TEXT NOT NULL DEFAULT 'OTHER',
      service_description TEXT NOT NULL, payer TEXT, plan TEXT,
      price_type TEXT NOT NULL, price REAL NOT NULL,
      effective_date TEXT, file_id TEXT REFERENCES transparency_files(file_id),
      row_hash TEXT NOT NULL, inserted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pdc_dedup ON pricing_data_current(
      hospital_id, billing_code, COALESCE(payer,''), price_type, COALESCE(effective_date,'1900-01-01')
    );
    CREATE INDEX IF NOT EXISTS idx_pdc_billing ON pricing_data_current(billing_code);
    CREATE INDEX IF NOT EXISTS idx_pdc_hospital ON pricing_data_current(hospital_id);

    CREATE TABLE IF NOT EXISTS pricing_data_history (
      version_id TEXT PRIMARY KEY, record_id TEXT NOT NULL,
      hospital_id TEXT NOT NULL REFERENCES hospitals(hospital_id),
      billing_code TEXT NOT NULL, billing_code_type TEXT NOT NULL DEFAULT 'OTHER',
      service_description TEXT NOT NULL, payer TEXT, plan TEXT,
      price_type TEXT NOT NULL, price REAL NOT NULL,
      effective_date TEXT, file_id TEXT REFERENCES transparency_files(file_id),
      row_hash TEXT NOT NULL, inserted_at TEXT NOT NULL DEFAULT (datetime('now')),
      superseded_at TEXT, is_current INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_pdh_record ON pricing_data_history(record_id);
    CREATE INDEX IF NOT EXISTS idx_pdh_hospital ON pricing_data_history(hospital_id);
    CREATE INDEX IF NOT EXISTS idx_pdh_billing ON pricing_data_history(billing_code);

    CREATE TABLE IF NOT EXISTS update_log (
      log_id TEXT PRIMARY KEY, hospital_id TEXT NOT NULL REFERENCES hospitals(hospital_id),
      file_id TEXT REFERENCES transparency_files(file_id),
      update_attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      result TEXT NOT NULL, rows_added INTEGER NOT NULL DEFAULT 0,
      rows_changed INTEGER NOT NULL DEFAULT 0, rows_removed INTEGER NOT NULL DEFAULT 0,
      file_hash_before TEXT, file_hash_after TEXT, error_message TEXT, duration_ms INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_ul_hospital ON update_log(hospital_id);
  `;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
