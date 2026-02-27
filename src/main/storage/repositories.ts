// ============================================================================
// Data Repositories — CRUD operations for all entities
// ============================================================================
import { getDatabase, generateId } from './database';
import type {
  Hospital, TransparencyFile, PricingRecord, UpdateLogEntry,
  StateAverage, PriceTrend, VariabilityMetric,
} from '../../shared/types';

// ============================================================================
// Hospital Repository
// ============================================================================
export const HospitalRepo = {
  upsert(hospital: Omit<Hospital, 'created_at' | 'updated_at'>): void {
    const db = getDatabase();
    const id = hospital.hospital_id || generateId();
    db.run(
      `INSERT INTO hospitals (hospital_id, cms_certification_num, name, address, city, state, zip, county, area_code, latitude, longitude, hospital_type, ownership_type, website_url, transparency_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hospital_id) DO UPDATE SET
         name=excluded.name, address=excluded.address, city=excluded.city,
         state=excluded.state, zip=excluded.zip, county=excluded.county,
         area_code=excluded.area_code, latitude=excluded.latitude, longitude=excluded.longitude,
         hospital_type=excluded.hospital_type, ownership_type=excluded.ownership_type,
         website_url=excluded.website_url, transparency_url=excluded.transparency_url,
         updated_at=datetime('now')`,
      [id, hospital.cms_certification_num ?? null, hospital.name, hospital.address,
       hospital.city, hospital.state, hospital.zip, hospital.county ?? null,
       hospital.area_code ?? null, hospital.latitude ?? null, hospital.longitude ?? null,
       hospital.hospital_type ?? null, hospital.ownership_type ?? null,
       hospital.website_url ?? null, hospital.transparency_url ?? null]
    );
  },

  upsertBatch(hospitals: Omit<Hospital, 'created_at' | 'updated_at'>[]): number {
    const db = getDatabase();
    let count = 0;
    db.transaction(() => {
      for (const h of hospitals) {
        HospitalRepo.upsert(h);
        count++;
      }
    });
    return count;
  },

  getById(id: string): Hospital | undefined {
    return getDatabase().get<Hospital>('SELECT * FROM hospitals WHERE hospital_id = ?', [id]);
  },

  search(query: string, limit = 50): Hospital[] {
    const db = getDatabase();
    const pattern = `%${query}%`;
    return db.all<Hospital>(
      `SELECT * FROM hospitals
       WHERE name LIKE ? OR city LIKE ? OR zip LIKE ? OR state LIKE ?
       ORDER BY name LIMIT ?`,
      [pattern, pattern, pattern, query.toUpperCase(), limit]
    );
  },

  listByState(state: string): Hospital[] {
    return getDatabase().all<Hospital>(
      'SELECT * FROM hospitals WHERE state = ? ORDER BY name', [state.toUpperCase()]
    );
  },

  getStaleHospitals(daysSinceUpdate: number): Hospital[] {
    return getDatabase().all<Hospital>(
      `SELECT h.* FROM hospitals h
       LEFT JOIN update_log ul ON h.hospital_id = ul.hospital_id
         AND ul.update_attempted_at > datetime('now', '-' || ? || ' days')
       WHERE ul.log_id IS NULL
       ORDER BY h.name`,
      [daysSinceUpdate]
    );
  },

  count(): number {
    const row = getDatabase().get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM hospitals');
    return row?.cnt ?? 0;
  },

  getStats(): { total: number; byState: { state: string; count: number }[] } {
    const db = getDatabase();
    const total = HospitalRepo.count();
    const byState = db.all<{ state: string; count: number }>(
      'SELECT state, COUNT(*) as count FROM hospitals GROUP BY state ORDER BY count DESC'
    );
    return { total, byState };
  },
};

// ============================================================================
// Transparency File Repository
// ============================================================================
export const FileRepo = {
  upsert(file: Omit<TransparencyFile, 'discovered_at'>): string {
    const db = getDatabase();
    const id = file.file_id || generateId();
    db.run(
      `INSERT INTO transparency_files (file_id, hospital_id, file_url, file_type, file_hash, file_size, status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hospital_id, file_url) DO UPDATE SET
         file_type=excluded.file_type, file_hash=excluded.file_hash,
         file_size=excluded.file_size, status=excluded.status,
         last_checked_at=datetime('now'), is_active=excluded.is_active`,
      [id, file.hospital_id, file.file_url, file.file_type,
       file.file_hash ?? null, file.file_size ?? null,
       file.status, file.is_active ? 1 : 0]
    );
    return id;
  },

  getByHospital(hospitalId: string): TransparencyFile[] {
    return getDatabase().all<TransparencyFile>(
      'SELECT * FROM transparency_files WHERE hospital_id = ? AND is_active = 1',
      [hospitalId]
    );
  },

  getById(fileId: string): TransparencyFile | undefined {
    return getDatabase().get<TransparencyFile>(
      'SELECT * FROM transparency_files WHERE file_id = ?', [fileId]
    );
  },

  updateStatus(fileId: string, status: string, errorMessage?: string): void {
    getDatabase().run(
      `UPDATE transparency_files SET status = ?, error_message = ?, last_checked_at = datetime('now') WHERE file_id = ?`,
      [status, errorMessage ?? null, fileId]
    );
  },

  updateHash(fileId: string, hash: string, size?: number): void {
    getDatabase().run(
      `UPDATE transparency_files SET file_hash = ?, file_size = ?, last_checked_at = datetime('now') WHERE file_id = ?`,
      [hash, size ?? null, fileId]
    );
  },
};

// ============================================================================
// Pricing Repository
// ============================================================================
export const PricingRepo = {
  upsertCurrent(records: PricingRecord[]): { added: number; changed: number } {
    const db = getDatabase();
    let added = 0;
    let changed = 0;

    db.transaction(() => {
      for (const r of records) {
        const recordId = r.record_id || generateId();
        const existing = db.get<PricingRecord>(
          `SELECT record_id, row_hash FROM pricing_data_current
           WHERE hospital_id = ? AND billing_code = ? AND COALESCE(payer,'') = ?
             AND price_type = ? AND COALESCE(effective_date,'1900-01-01') = ?`,
          [r.hospital_id, r.billing_code, r.payer ?? '',
           r.price_type, r.effective_date ?? '1900-01-01']
        );

        if (existing) {
          if (existing.row_hash !== r.row_hash) {
            // Price changed — update current, archive old to history
            PricingRepo._archiveToHistory(existing.record_id!);
            db.run(
              `UPDATE pricing_data_current SET
                service_description=?, plan=?, price=?, file_id=?, row_hash=?, inserted_at=datetime('now')
               WHERE record_id=?`,
              [r.service_description, r.plan ?? null, r.price, r.file_id, r.row_hash, existing.record_id]
            );
            PricingRepo._insertHistory(existing.record_id!, r);
            changed++;
          }
        } else {
          db.run(
            `INSERT INTO pricing_data_current
             (record_id, hospital_id, billing_code, billing_code_type, service_description,
              payer, plan, price_type, price, effective_date, file_id, row_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [recordId, r.hospital_id, r.billing_code, r.billing_code_type,
             r.service_description, r.payer ?? null, r.plan ?? null,
             r.price_type, r.price, r.effective_date ?? null, r.file_id, r.row_hash]
          );
          PricingRepo._insertHistory(recordId, r);
          added++;
        }
      }
    });

    return { added, changed };
  },

  _archiveToHistory(recordId: string): void {
    getDatabase().run(
      `UPDATE pricing_data_history SET is_current = 0, superseded_at = datetime('now')
       WHERE record_id = ? AND is_current = 1`,
      [recordId]
    );
  },

  _insertHistory(recordId: string, r: PricingRecord): void {
    getDatabase().run(
      `INSERT INTO pricing_data_history
       (version_id, record_id, hospital_id, billing_code, billing_code_type,
        service_description, payer, plan, price_type, price, effective_date,
        file_id, row_hash, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [generateId(), recordId, r.hospital_id, r.billing_code, r.billing_code_type,
       r.service_description, r.payer ?? null, r.plan ?? null,
       r.price_type, r.price, r.effective_date ?? null, r.file_id, r.row_hash]
    );
  },

  getByHospital(hospitalId: string, limit = 100): PricingRecord[] {
    return getDatabase().all<PricingRecord>(
      'SELECT * FROM pricing_data_current WHERE hospital_id = ? LIMIT ?',
      [hospitalId, limit]
    );
  },

  searchByCode(billingCode: string, state?: string): PricingRecord[] {
    const db = getDatabase();
    if (state) {
      return db.all<PricingRecord>(
        `SELECT p.* FROM pricing_data_current p
         JOIN hospitals h ON h.hospital_id = p.hospital_id
         WHERE p.billing_code = ? AND h.state = ?
         ORDER BY p.price`, [billingCode, state]
      );
    }
    return db.all<PricingRecord>(
      'SELECT * FROM pricing_data_current WHERE billing_code = ? ORDER BY price',
      [billingCode]
    );
  },

  countRecords(): number {
    const row = getDatabase().get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM pricing_data_current');
    return row?.cnt ?? 0;
  },
};

// ============================================================================
// Update Log Repository
// ============================================================================
export const UpdateLogRepo = {
  insert(entry: Omit<UpdateLogEntry, 'log_id'>): string {
    const db = getDatabase();
    const id = generateId();
    db.run(
      `INSERT INTO update_log
       (log_id, hospital_id, file_id, result, rows_added, rows_changed, rows_removed,
        file_hash_before, file_hash_after, error_message, duration_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.hospital_id, entry.file_id ?? null, entry.result,
       entry.rows_added, entry.rows_changed, entry.rows_removed,
       entry.file_hash_before ?? null, entry.file_hash_after ?? null,
       entry.error_message ?? null, entry.duration_ms ?? null]
    );
    return id;
  },

  getByHospital(hospitalId: string, limit = 50): UpdateLogEntry[] {
    return getDatabase().all<UpdateLogEntry>(
      'SELECT * FROM update_log WHERE hospital_id = ? ORDER BY update_attempted_at DESC LIMIT ?',
      [hospitalId, limit]
    );
  },

  getRecent(limit = 100): UpdateLogEntry[] {
    return getDatabase().all<UpdateLogEntry>(
      'SELECT * FROM update_log ORDER BY update_attempted_at DESC LIMIT ?', [limit]
    );
  },
};

// ============================================================================
// Analytics Repository
// ============================================================================
export const AnalyticsRepo = {
  getStateAverages(billingCode?: string, priceType?: string): StateAverage[] {
    const db = getDatabase();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (billingCode) { conditions.push('p.billing_code = ?'); params.push(billingCode); }
    if (priceType) { conditions.push('p.price_type = ?'); params.push(priceType); }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    return db.all<StateAverage>(
      `SELECT h.state, AVG(p.price) as avg_price,
              COUNT(DISTINCT h.hospital_id) as hospital_count,
              COUNT(*) as record_count
       FROM pricing_data_current p
       JOIN hospitals h ON h.hospital_id = p.hospital_id
       ${where}
       GROUP BY h.state
       ORDER BY avg_price DESC`,
      params
    );
  },

  getTrends(billingCode: string, state?: string, areaCode?: string): PriceTrend[] {
    const db = getDatabase();
    const conditions = ['pdh.billing_code = ?'];
    const params: unknown[] = [billingCode];

    if (state) { conditions.push('h.state = ?'); params.push(state); }
    if (areaCode) { conditions.push('h.area_code = ?'); params.push(areaCode); }

    return db.all<PriceTrend>(
      `SELECT strftime('%Y-%m', pdh.inserted_at) as period,
              AVG(pdh.price) as avg_price,
              MIN(pdh.price) as min_price,
              MAX(pdh.price) as max_price,
              COUNT(*) as record_count
       FROM pricing_data_history pdh
       JOIN hospitals h ON h.hospital_id = pdh.hospital_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY strftime('%Y-%m', pdh.inserted_at)
       ORDER BY period`,
      params
    );
  },

  getVariability(limit = 10): VariabilityMetric[] {
    const db = getDatabase();
    return db.all<VariabilityMetric>(
      `SELECT billing_code, billing_code_type,
              MIN(service_description) as description,
              MIN(price) as min_price, MAX(price) as max_price,
              AVG(price) as avg_price,
              (MAX(price) - MIN(price)) as spread,
              COUNT(DISTINCT hospital_id) as hospital_count
       FROM pricing_data_current
       WHERE price > 0
       GROUP BY billing_code, billing_code_type
       HAVING COUNT(*) >= 3
       ORDER BY spread DESC
       LIMIT ?`,
      [limit]
    );
  },

  getComparison(billingCode: string, areaCode: string, startDate: string, endDate: string) {
    const db = getDatabase();
    return db.all(
      `SELECT strftime('%Y-%m', pdh.inserted_at) as period,
              AVG(CASE WHEN h.area_code = ? THEN pdh.price END) as local_avg,
              AVG(CASE WHEN h.state = (SELECT state FROM hospitals WHERE area_code = ? LIMIT 1) THEN pdh.price END) as state_avg,
              AVG(pdh.price) as national_avg
       FROM pricing_data_history pdh
       JOIN hospitals h ON h.hospital_id = pdh.hospital_id
       WHERE pdh.billing_code = ?
         AND pdh.inserted_at BETWEEN ? AND ?
       GROUP BY strftime('%Y-%m', pdh.inserted_at)
       ORDER BY period`,
      [areaCode, areaCode, billingCode, startDate, endDate]
    );
  },

  getDashboardStats() {
    const db = getDatabase();
    const hospitals = HospitalRepo.count();
    const records = PricingRepo.countRecords();
    const files = db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM transparency_files WHERE is_active = 1');
    const recentUpdates = db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM update_log WHERE update_attempted_at > datetime('now', '-7 days')`
    );
    return {
      totalHospitals: hospitals,
      totalRecords: records,
      activeFiles: files?.cnt ?? 0,
      updatesThisWeek: recentUpdates?.cnt ?? 0,
    };
  },
};
