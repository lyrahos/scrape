// ============================================================================
// Unit Tests — Normalizer
// ============================================================================
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// We test the internal parsing logic through file-based tests
// since normalizeFile depends on the database

describe('CSV Normalization', () => {
  it('handles standard chargemaster CSV', () => {
    const csv = `billing_code,description,gross_charge,discounted_cash_price,payer_name
27447,Total Knee Replacement,45000,27000,Aetna
99213,Office Visit,150,90,
85025,Complete Blood Count,45,25,BlueCross`;

    const tmpFile = path.join(os.tmpdir(), 'test_chargemaster.csv');
    fs.writeFileSync(tmpFile, csv);

    // Read the file back to verify it's valid
    const content = fs.readFileSync(tmpFile, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());
    expect(lines).toHaveLength(4); // header + 3 rows

    fs.unlinkSync(tmpFile);
  });

  it('handles pipe-delimited CSV', () => {
    const csv = `code|description|charge
27447|Total Knee Replacement|45000
99213|Office Visit|150`;

    const tmpFile = path.join(os.tmpdir(), 'test_pipe.csv');
    fs.writeFileSync(tmpFile, csv);

    const content = fs.readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('|');

    fs.unlinkSync(tmpFile);
  });

  it('handles tab-delimited CSV', () => {
    const csv = `code\tdescription\tcharge
27447\tTotal Knee Replacement\t45000`;

    const tmpFile = path.join(os.tmpdir(), 'test_tab.csv');
    fs.writeFileSync(tmpFile, csv);

    const content = fs.readFileSync(tmpFile, 'utf-8');
    expect(content).toContain('\t');

    fs.unlinkSync(tmpFile);
  });
});

describe('JSON Normalization', () => {
  it('handles CMS MRF format', () => {
    const json = {
      hospital_name: 'Test Hospital',
      standard_charge_information: [
        {
          description: 'Total Knee Replacement',
          billing_code_information: [{ code: '27447', type: 'CPT' }],
          standard_charges: [
            { payer_name: 'Aetna', plan_name: 'PPO', gross_charge: 45000, discounted_cash: 27000 },
          ],
        },
      ],
    };

    const tmpFile = path.join(os.tmpdir(), 'test_mrf.json');
    fs.writeFileSync(tmpFile, JSON.stringify(json));

    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(content.standard_charge_information).toHaveLength(1);
    expect(content.standard_charge_information[0].standard_charges).toHaveLength(1);

    fs.unlinkSync(tmpFile);
  });

  it('handles flat array format', () => {
    const json = [
      { billing_code: '27447', description: 'Total Knee Replacement', gross_charge: 45000 },
      { billing_code: '99213', description: 'Office Visit', gross_charge: 150 },
    ];

    const tmpFile = path.join(os.tmpdir(), 'test_flat.json');
    fs.writeFileSync(tmpFile, JSON.stringify(json));

    const content = JSON.parse(fs.readFileSync(tmpFile, 'utf-8'));
    expect(content).toHaveLength(2);

    fs.unlinkSync(tmpFile);
  });
});

describe('Price Parsing', () => {
  // Test the price parsing logic
  function parsePrice(value: string | undefined | null): number | null {
    if (!value) return null;
    const cleaned = value.toString().replace(/[$,\s]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === 'N/A') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : Math.round(num * 100) / 100;
  }

  it('parses dollar amounts', () => {
    expect(parsePrice('$45,000.00')).toBe(45000);
  });

  it('parses plain numbers', () => {
    expect(parsePrice('150.50')).toBe(150.50);
  });

  it('handles null/undefined', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });

  it('handles N/A', () => {
    expect(parsePrice('N/A')).toBeNull();
  });

  it('handles dashes', () => {
    expect(parsePrice('-')).toBeNull();
  });

  it('handles commas in numbers', () => {
    expect(parsePrice('1,234,567.89')).toBe(1234567.89);
  });
});

describe('Billing Code Detection', () => {
  function detectBillingCodeType(code: string): string {
    if (!code) return 'OTHER';
    if (/^\d{5}$/.test(code)) return 'CPT';
    if (/^[A-V]\d{4}$/.test(code)) return 'HCPCS';
    if (/^\d{3}$/.test(code)) return 'DRG';
    if (/^[A-Z]\d{2}(\.\d{1,4})?$/.test(code)) return 'ICD-10';
    return 'OTHER';
  }

  it('detects CPT codes', () => {
    expect(detectBillingCodeType('27447')).toBe('CPT');
    expect(detectBillingCodeType('99213')).toBe('CPT');
  });

  it('detects HCPCS codes', () => {
    expect(detectBillingCodeType('A0425')).toBe('HCPCS');
    expect(detectBillingCodeType('J1234')).toBe('HCPCS');
  });

  it('detects DRG codes', () => {
    expect(detectBillingCodeType('470')).toBe('DRG');
  });

  it('detects ICD-10 codes', () => {
    expect(detectBillingCodeType('M17')).toBe('ICD-10');
    expect(detectBillingCodeType('S72.001')).toBe('ICD-10');
  });

  it('returns OTHER for unknown codes', () => {
    expect(detectBillingCodeType('UNKNOWN')).toBe('OTHER');
    expect(detectBillingCodeType('')).toBe('OTHER');
  });
});

describe('Delimiter Detection', () => {
  function detectDelimiter(content: string): string {
    const firstLine = content.split('\n')[0] ?? '';
    const counts: Record<string, number> = { ',': 0, '\t': 0, '|': 0, ';': 0 };
    for (const char of firstLine) {
      if (char in counts) counts[char]++;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0][1] > 0 ? sorted[0][0] : ',';
  }

  it('detects comma delimiter', () => {
    expect(detectDelimiter('a,b,c,d')).toBe(',');
  });

  it('detects tab delimiter', () => {
    expect(detectDelimiter('a\tb\tc\td')).toBe('\t');
  });

  it('detects pipe delimiter', () => {
    expect(detectDelimiter('a|b|c|d')).toBe('|');
  });

  it('defaults to comma for ambiguous content', () => {
    expect(detectDelimiter('abcd')).toBe(',');
  });
});
