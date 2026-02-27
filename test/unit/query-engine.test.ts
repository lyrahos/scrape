// ============================================================================
// Unit Tests — Semantic Query Engine
// ============================================================================
import { describe, it, expect } from 'vitest';
import { parseQuery } from '../../src/main/semantic/query-engine';

describe('parseQuery', () => {
  it('extracts CPT code from query', () => {
    const result = parseQuery('Show me prices for CPT 27447');
    expect(result.extracted_cpt).toBe('27447');
  });

  it('extracts procedure keyword', () => {
    const result = parseQuery('knee replacement prices');
    expect(result.extracted_cpt).toBe('27447');
    expect(result.extracted_description).toBe('knee replacement');
  });

  it('extracts state from query', () => {
    const result = parseQuery('knee replacement in Pennsylvania');
    expect(result.extracted_state).toBe('PA');
  });

  it('extracts date range from "past N months"', () => {
    const result = parseQuery('prices over the past 6 months');
    expect(result.extracted_date_range).toBeDefined();
    expect(result.extracted_date_range?.start).toBeDefined();
    expect(result.extracted_date_range?.end).toBeDefined();
  });

  it('extracts year as date range', () => {
    const result = parseQuery('knee replacement prices in 2025');
    expect(result.extracted_date_range?.start).toBe('2025-01-01');
    expect(result.extracted_date_range?.end).toBe('2025-12-31');
  });

  it('maps common procedures', () => {
    expect(parseQuery('hip replacement').extracted_cpt).toBe('27130');
    expect(parseQuery('colonoscopy').extracted_cpt).toBe('45380');
    expect(parseQuery('brain mri').extracted_cpt).toBe('70553');
    expect(parseQuery('chest xray').extracted_cpt).toBe('71046');
    expect(parseQuery('emergency visit').extracted_cpt).toBe('99283');
    expect(parseQuery('blood draw').extracted_cpt).toBe('36415');
    expect(parseQuery('cbc test').extracted_cpt).toBe('85025');
    expect(parseQuery('echocardiogram').extracted_cpt).toBe('93306');
  });

  it('generates SQL for simple query', () => {
    const result = parseQuery('knee replacement prices in PA');
    expect(result.generated_sql).toBeDefined();
    expect(result.generated_sql).toContain('SELECT');
    expect(result.generated_sql).toContain('27447');
    expect(result.generated_sql).toContain('PA');
  });

  it('uses history table when date range is present', () => {
    const result = parseQuery('knee replacement over the past 6 months');
    expect(result.generated_sql).toContain('pricing_data_history');
  });

  it('uses current table when no date range', () => {
    const result = parseQuery('knee replacement prices');
    expect(result.generated_sql).toContain('pricing_data_current');
  });

  it('sanitizes input in SQL', () => {
    const result = parseQuery("knee replacement'; DROP TABLE hospitals; --");
    expect(result.generated_sql).not.toContain('DROP');
    expect(result.generated_sql).not.toContain(';');
  });

  it('preserves raw text', () => {
    const raw = 'Show me knee replacement prices near 19107';
    const result = parseQuery(raw);
    expect(result.raw_text).toBe(raw);
  });
});
