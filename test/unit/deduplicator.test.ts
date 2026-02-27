// ============================================================================
// Unit Tests — Deduplicator
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  compositeKey,
  recordHash,
  deduplicateRecords,
  diffRecords,
  fuzzyGroupDescriptions,
} from '../../src/main/processing/deduplicator';
import type { PricingRecord } from '../../src/shared/types';

function makeRecord(overrides: Partial<PricingRecord> = {}): PricingRecord {
  return {
    record_id: 'rec-1',
    hospital_id: 'hosp-1',
    billing_code: '27447',
    billing_code_type: 'CPT',
    service_description: 'Total Knee Replacement',
    payer: 'Aetna',
    plan: 'PPO',
    price_type: 'gross_charge',
    price: 30000,
    file_id: 'file-1',
    row_hash: 'abc123',
    ...overrides,
  };
}

describe('compositeKey', () => {
  it('generates correct composite key', () => {
    const record = makeRecord();
    const key = compositeKey(record);
    expect(key).toBe('hosp-1|27447|Aetna|gross_charge|');
  });

  it('handles null payer', () => {
    const record = makeRecord({ payer: undefined });
    const key = compositeKey(record);
    expect(key).toBe('hosp-1|27447||gross_charge|');
  });

  it('includes effective date', () => {
    const record = makeRecord({ effective_date: '2024-01-01' });
    const key = compositeKey(record);
    expect(key).toBe('hosp-1|27447|Aetna|gross_charge|2024-01-01');
  });
});

describe('recordHash', () => {
  it('generates consistent hashes', () => {
    const record = makeRecord();
    const hash1 = recordHash(record);
    const hash2 = recordHash(record);
    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different prices', () => {
    const r1 = makeRecord({ price: 30000 });
    const r2 = makeRecord({ price: 35000 });
    expect(recordHash(r1)).not.toBe(recordHash(r2));
  });

  it('generates different hashes for different payers', () => {
    const r1 = makeRecord({ payer: 'Aetna' });
    const r2 = makeRecord({ payer: 'Cigna' });
    expect(recordHash(r1)).not.toBe(recordHash(r2));
  });
});

describe('deduplicateRecords', () => {
  it('removes duplicates by composite key', () => {
    const records = [
      makeRecord({ record_id: 'r1', price: 30000 }),
      makeRecord({ record_id: 'r2', price: 31000 }),
    ];
    const result = deduplicateRecords(records);
    expect(result).toHaveLength(1);
  });

  it('keeps record with more complete data', () => {
    const records = [
      makeRecord({ record_id: 'r1', service_description: 'Unknown Service', plan: undefined }),
      makeRecord({ record_id: 'r2', service_description: 'Total Knee Replacement', plan: 'PPO' }),
    ];
    const result = deduplicateRecords(records);
    expect(result).toHaveLength(1);
    expect(result[0].plan).toBe('PPO');
  });

  it('preserves records with different composite keys', () => {
    const records = [
      makeRecord({ billing_code: '27447' }),
      makeRecord({ billing_code: '27130' }),
    ];
    const result = deduplicateRecords(records);
    expect(result).toHaveLength(2);
  });
});

describe('diffRecords', () => {
  it('detects added records', () => {
    const oldRecords: PricingRecord[] = [];
    const newRecords = [makeRecord()];
    const diff = diffRecords(oldRecords, newRecords);
    expect(diff.added).toHaveLength(1);
    expect(diff.changed).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
  });

  it('detects removed records', () => {
    const oldRecords = [makeRecord()];
    const newRecords: PricingRecord[] = [];
    const diff = diffRecords(oldRecords, newRecords);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(1);
  });

  it('detects changed records', () => {
    const oldRecords = [makeRecord({ row_hash: 'old-hash' })];
    const newRecords = [makeRecord({ row_hash: 'new-hash', price: 35000 })];
    const diff = diffRecords(oldRecords, newRecords);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0].old.price).toBe(30000);
    expect(diff.changed[0].new.price).toBe(35000);
  });

  it('detects unchanged records', () => {
    const record = makeRecord();
    const diff = diffRecords([record], [record]);
    expect(diff.unchanged).toBe(1);
  });
});

describe('fuzzyGroupDescriptions', () => {
  it('groups similar descriptions', () => {
    const records = [
      makeRecord({ service_description: 'Total Knee Replacement' }),
      makeRecord({ service_description: 'Total Knee Replacement Surgery' }),
    ];
    const mapping = fuzzyGroupDescriptions(records, 0.4);
    expect(mapping.size).toBeGreaterThan(0);
  });
});
