// ============================================================================
// Deduplication Engine — Composite key + fuzzy matching + hash-based detection
// ============================================================================
import Fuse from 'fuse.js';
import crypto from 'crypto';
import type { PricingRecord } from '../../shared/types';

/**
 * Composite deduplication key:
 * hospital_id + billing_code + payer + price_type + effective_date
 */
export function compositeKey(record: PricingRecord): string {
  return [
    record.hospital_id,
    record.billing_code,
    record.payer ?? '',
    record.price_type,
    record.effective_date ?? '',
  ].join('|');
}

/**
 * Row-level hash for change detection
 */
export function recordHash(record: PricingRecord): string {
  const input = [
    record.hospital_id,
    record.billing_code,
    record.billing_code_type,
    record.service_description,
    record.payer ?? '',
    record.plan ?? '',
    record.price_type,
    record.price.toString(),
    record.effective_date ?? '',
  ].join('|');
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Deduplicate records within a single file's output.
 * Keeps the record with the most complete data for each composite key.
 */
export function deduplicateRecords(records: PricingRecord[]): PricingRecord[] {
  const keyMap = new Map<string, PricingRecord>();

  for (const record of records) {
    const key = compositeKey(record);
    const existing = keyMap.get(key);

    if (!existing) {
      keyMap.set(key, record);
    } else {
      // Keep the record with more data completeness
      const existingScore = completenessScore(existing);
      const newScore = completenessScore(record);
      if (newScore > existingScore) {
        keyMap.set(key, record);
      }
    }
  }

  return Array.from(keyMap.values());
}

function completenessScore(record: PricingRecord): number {
  let score = 0;
  if (record.billing_code && record.billing_code !== 'UNKNOWN') score += 2;
  if (record.service_description && record.service_description !== 'Unknown Service') score += 2;
  if (record.payer) score += 1;
  if (record.plan) score += 1;
  if (record.effective_date) score += 1;
  if (record.price > 0) score += 2;
  return score;
}

/**
 * Fuzzy match service descriptions to normalize similar entries.
 * Uses Fuse.js for approximate string matching.
 */
export function fuzzyGroupDescriptions(
  records: PricingRecord[],
  threshold = 0.3,
): Map<string, string> {
  const uniqueDescriptions = [...new Set(records.map((r) => r.service_description))];
  const mapping = new Map<string, string>();

  if (uniqueDescriptions.length === 0) return mapping;

  const fuse = new Fuse(uniqueDescriptions.map((d) => ({ text: d })), {
    keys: ['text'],
    threshold,
    includeScore: true,
  });

  const canonical = new Map<string, string>();

  for (const desc of uniqueDescriptions) {
    if (canonical.has(desc)) continue;

    const results = fuse.search(desc);
    const matches = results
      .filter((r) => r.score !== undefined && r.score <= threshold)
      .map((r) => r.item.text);

    // Canonical = longest description (most descriptive)
    const canonicalDesc = matches.reduce(
      (longest, current) => (current.length > longest.length ? current : longest),
      desc,
    );

    for (const match of matches) {
      canonical.set(match, canonicalDesc);
      mapping.set(match, canonicalDesc);
    }
  }

  return mapping;
}

/**
 * Apply fuzzy description normalization to records
 */
export function normalizeDescriptions(records: PricingRecord[]): PricingRecord[] {
  const mapping = fuzzyGroupDescriptions(records);

  return records.map((r) => ({
    ...r,
    service_description: mapping.get(r.service_description) ?? r.service_description,
    row_hash: recordHash({
      ...r,
      service_description: mapping.get(r.service_description) ?? r.service_description,
    }),
  }));
}

/**
 * Diff two sets of records to detect changes
 */
export interface DiffResult {
  added: PricingRecord[];
  changed: { old: PricingRecord; new: PricingRecord }[];
  removed: PricingRecord[];
  unchanged: number;
}

export function diffRecords(
  oldRecords: PricingRecord[],
  newRecords: PricingRecord[],
): DiffResult {
  const oldMap = new Map(oldRecords.map((r) => [compositeKey(r), r]));
  const newMap = new Map(newRecords.map((r) => [compositeKey(r), r]));

  const added: PricingRecord[] = [];
  const changed: { old: PricingRecord; new: PricingRecord }[] = [];
  const removed: PricingRecord[] = [];
  let unchanged = 0;

  // Find added and changed
  for (const [key, newRecord] of newMap) {
    const oldRecord = oldMap.get(key);
    if (!oldRecord) {
      added.push(newRecord);
    } else if (oldRecord.row_hash !== newRecord.row_hash) {
      changed.push({ old: oldRecord, new: newRecord });
    } else {
      unchanged++;
    }
  }

  // Find removed
  for (const [key, oldRecord] of oldMap) {
    if (!newMap.has(key)) {
      removed.push(oldRecord);
    }
  }

  return { added, changed, removed, unchanged };
}
