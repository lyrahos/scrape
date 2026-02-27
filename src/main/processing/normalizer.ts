// ============================================================================
// Normalization Engine — Extracts structured pricing from heterogeneous formats
// ============================================================================
import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import pdfParse from 'pdf-parse';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { PricingRecord, PriceType, BillingCodeType, FileType } from '../../shared/types';
import { BILLING_CODE_PATTERNS } from '../../shared/constants';
import { generateId } from '../storage/database';

export interface NormalizationResult {
  records: PricingRecord[];
  errors: string[];
  rawRowCount: number;
  validRowCount: number;
}

// Column name mappings — handles non-standard headers
const COLUMN_ALIASES: Record<string, string[]> = {
  billing_code: [
    'billing_code', 'code', 'cpt', 'cpt_code', 'hcpcs', 'hcpcs_code',
    'procedure_code', 'proc_code', 'drg', 'drg_code', 'ms_drg',
    'charge_code', 'item_code', 'revenue_code', 'billing code',
  ],
  description: [
    'description', 'service_description', 'procedure_description',
    'charge_description', 'item_description', 'service', 'procedure',
    'procedure_name', 'charge description', 'service name',
  ],
  gross_charge: [
    'gross_charge', 'gross_charges', 'gross charge', 'charge', 'charges',
    'standard_charge', 'standard charge', 'price', 'amount', 'charge_amount',
    'gross_charge|gross', 'standard_charge|gross',
  ],
  discounted_cash: [
    'discounted_cash_price', 'cash_price', 'cash_discount', 'self_pay',
    'discounted cash price', 'cash price', 'self pay', 'self-pay',
    'standard_charge|discounted_cash', 'cash_rate',
  ],
  min_negotiated: [
    'de_identified_minimum', 'min_negotiated', 'minimum', 'min',
    'standard_charge|min', 'minimum_negotiated_charge', 'min negotiated',
  ],
  max_negotiated: [
    'de_identified_maximum', 'max_negotiated', 'maximum', 'max',
    'standard_charge|max', 'maximum_negotiated_charge', 'max negotiated',
  ],
  payer: [
    'payer', 'payer_name', 'insurance', 'insurer', 'carrier',
    'plan_name', 'insurance_company', 'payer name',
  ],
  plan: [
    'plan', 'plan_name', 'plan_type', 'product', 'insurance_plan',
  ],
};

/**
 * Main normalization entry point — routes to correct parser by file type
 */
export function normalizeFile(
  filePath: string,
  fileType: FileType,
  hospitalId: string,
  fileId: string,
): NormalizationResult {
  switch (fileType) {
    case 'csv':
      return normalizeCSV(filePath, hospitalId, fileId);
    case 'json':
      return normalizeJSON(filePath, hospitalId, fileId);
    case 'xml':
      return normalizeXML(filePath, hospitalId, fileId);
    case 'xls':
    case 'xlsx':
      return normalizeExcel(filePath, hospitalId, fileId);
    case 'pdf':
      return normalizePDF(filePath, hospitalId, fileId);
    case 'gzip':
      return normalizeGzip(filePath, hospitalId, fileId);
    default:
      return { records: [], errors: [`Unsupported file type: ${fileType}`], rawRowCount: 0, validRowCount: 0 };
  }
}

// ============================================================================
// CSV Parser
// ============================================================================
function normalizeCSV(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');

  // Detect delimiter
  const delimiter = detectDelimiter(content);

  let rows: Record<string, string>[];
  try {
    rows = csvParse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      delimiter,
    });
  } catch (err) {
    return { records: [], errors: [`CSV parse error: ${err}`], rawRowCount: 0, validRowCount: 0 };
  }

  const records = extractRecords(rows, hospitalId, fileId, errors);
  return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
}

// ============================================================================
// JSON Parser — Handles CMS MRF format and various structures
// ============================================================================
function normalizeJSON(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    return { records: [], errors: [`JSON parse error: ${err}`], rawRowCount: 0, validRowCount: 0 };
  }

  // Handle different JSON structures
  let rows: Record<string, unknown>[];

  if (Array.isArray(data)) {
    rows = data as Record<string, unknown>[];
  } else if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    // CMS MRF format
    if (obj.standard_charge_information && Array.isArray(obj.standard_charge_information)) {
      rows = flattenCMSFormat(obj.standard_charge_information as unknown[]);
    } else {
      // Try to find the first array property
      const arrayProp = Object.values(obj).find(Array.isArray);
      rows = (arrayProp as Record<string, unknown>[]) ?? [];
    }
  } else {
    return { records: [], errors: ['Unrecognized JSON structure'], rawRowCount: 0, validRowCount: 0 };
  }

  const stringRows = rows.map((r) => {
    const sr: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      sr[k] = String(v ?? '');
    }
    return sr;
  });

  const records = extractRecords(stringRows, hospitalId, fileId, errors);
  return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
}

function flattenCMSFormat(items: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];

  for (const item of items) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;

    const code = entry.billing_code_information;
    const charges = entry.standard_charges;

    if (!Array.isArray(charges)) continue;

    for (const charge of charges as Record<string, unknown>[]) {
      const row: Record<string, unknown> = {
        billing_code: Array.isArray(code) ? (code[0] as Record<string, unknown>)?.code : '',
        billing_code_type: Array.isArray(code) ? (code[0] as Record<string, unknown>)?.type : '',
        description: entry.description ?? '',
        payer: charge.payer_name ?? '',
        plan: charge.plan_name ?? '',
        gross_charge: charge.gross_charge ?? '',
        discounted_cash: charge.discounted_cash ?? '',
        min_negotiated: charge.minimum ?? charge['de_identified_minimum'] ?? '',
        max_negotiated: charge.maximum ?? charge['de_identified_maximum'] ?? '',
      };
      rows.push(row);
    }
  }

  return rows;
}

// ============================================================================
// XML Parser
// ============================================================================
function normalizeXML(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  let data: unknown;
  try {
    data = parser.parse(content);
  } catch (err) {
    return { records: [], errors: [`XML parse error: ${err}`], rawRowCount: 0, validRowCount: 0 };
  }

  // Flatten XML into rows
  const rows = flattenXMLToRows(data as Record<string, unknown>);
  const stringRows = rows.map((r) => {
    const sr: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      sr[k] = String(v ?? '');
    }
    return sr;
  });

  const records = extractRecords(stringRows, hospitalId, fileId, errors);
  return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
}

function flattenXMLToRows(obj: Record<string, unknown>, prefix = ''): Record<string, string>[] {
  const rows: Record<string, string>[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          rows.push(...flattenXMLToRows(item as Record<string, unknown>, key));
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      rows.push(...flattenXMLToRows(value as Record<string, unknown>, key));
    }
  }

  // If this level has leaf values, it might be a data row
  const leafValues: Record<string, string> = {};
  let hasLeaf = false;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== 'object' || value === null) {
      leafValues[key] = String(value);
      hasLeaf = true;
    }
  }
  if (hasLeaf && Object.keys(leafValues).length >= 2) {
    rows.push(leafValues);
  }

  return rows;
}

// ============================================================================
// Excel Parser
// ============================================================================
function normalizeExcel(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];
  const buffer = fs.readFileSync(filePath);

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return { records: [], errors: [`Excel parse error: ${err}`], rawRowCount: 0, validRowCount: 0 };
  }

  const allRecords: PricingRecord[] = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    totalRows += rows.length;

    const sheetRecords = extractRecords(rows, hospitalId, fileId, errors);
    allRecords.push(...sheetRecords);
  }

  return { records: allRecords, errors, rawRowCount: totalRows, validRowCount: allRecords.length };
}

// ============================================================================
// PDF Parser — Extract tabular pricing data from PDFs
// ============================================================================
function normalizePDF(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];
  const buffer = fs.readFileSync(filePath);

  // pdf-parse is async but we need sync — use a workaround
  let textContent = '';
  try {
    // Synchronous extraction attempt using pdf-parse
    const pdfData = pdfParse(buffer);
    // pdfParse returns a promise; we handle this in the async wrapper
    // For now, extract what we can from the buffer directly
    textContent = extractTextFromPDFBuffer(buffer);
  } catch (err) {
    errors.push(`PDF parse error: ${err}. Consider converting to CSV for better results.`);
  }

  if (!textContent) {
    return {
      records: [],
      errors: ['PDF text extraction yielded no content. Use normalizePDFAsync() for OCR fallback on scanned documents.'],
      rawRowCount: 0,
      validRowCount: 0,
    };
  }

  // Parse extracted text into rows
  const rows = parsePDFText(textContent);
  const records = extractRecords(rows, hospitalId, fileId, errors);
  return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
}

/**
 * Extract text from PDF buffer by scanning for text stream operators.
 * This is a basic fallback; pdf-parse handles the full extraction asynchronously.
 */
function extractTextFromPDFBuffer(buffer: Buffer): string {
  const text = buffer.toString('latin1');
  const textBlocks: string[] = [];

  // Extract text between BT (begin text) and ET (end text) PDF operators
  const btEtPattern = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtPattern.exec(text)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjPattern.exec(block)) !== null) {
      textBlocks.push(tjMatch[1]);
    }
  }

  return textBlocks.join('\n');
}

/**
 * Parse extracted PDF text into structured rows.
 * Handles common chargemaster PDF layouts.
 */
function parsePDFText(text: string): Record<string, string>[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const rows: Record<string, string>[] = [];

  for (const line of lines) {
    // Try to detect lines with billing codes and prices
    // Common pattern: CODE DESCRIPTION $PRICE
    const codeMatch = line.match(/^(\d{5}|[A-V]\d{4})\s+(.+?)\s+\$?([\d,]+\.?\d*)\s*$/);
    if (codeMatch) {
      rows.push({
        billing_code: codeMatch[1],
        description: codeMatch[2].trim(),
        charge: codeMatch[3].replace(/,/g, ''),
      });
      continue;
    }

    // Pattern: CODE | DESCRIPTION | PRICE (pipe-delimited)
    const parts = line.split(/[|,\t]+/).map((p) => p.trim());
    if (parts.length >= 3) {
      const possibleCode = parts[0];
      const possiblePrice = parts[parts.length - 1].replace(/[$,]/g, '');
      if (/^\d{3,5}$/.test(possibleCode) && !isNaN(parseFloat(possiblePrice))) {
        rows.push({
          billing_code: possibleCode,
          description: parts.slice(1, -1).join(' '),
          charge: possiblePrice,
        });
      }
    }
  }

  return rows;
}

// ============================================================================
// GZIP Archive Extractor — Decompress and delegate to appropriate parser
// ============================================================================
function normalizeGzip(filePath: string, hospitalId: string, fileId: string): NormalizationResult {
  const errors: string[] = [];

  try {
    const compressed = fs.readFileSync(filePath);
    const decompressed = zlib.gunzipSync(compressed);

    // Write decompressed to temp file and detect inner format
    const tempPath = filePath + '.decompressed';
    fs.writeFileSync(tempPath, decompressed);

    // Detect inner file type from content
    const innerType = detectInnerFileType(decompressed, filePath);

    const result = normalizeFile(tempPath, innerType, hospitalId, fileId);

    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch { /* ignore */ }

    return result;
  } catch (err) {
    errors.push(`GZIP extraction error: ${err}`);
    return { records: [], errors, rawRowCount: 0, validRowCount: 0 };
  }
}

/**
 * Detect the file type of decompressed content
 */
function detectInnerFileType(buffer: Buffer, originalPath: string): FileType {
  const header = buffer.slice(0, 100).toString('utf-8').trim();

  // Check original filename for hints (e.g., .csv.gz, .json.gz)
  const baseName = originalPath.replace(/\.gz(ip)?$/i, '');
  const ext = path.extname(baseName).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.json') return 'json';
  if (ext === '.xml') return 'xml';

  // Content-based detection
  if (header.startsWith('{') || header.startsWith('[')) return 'json';
  if (header.startsWith('<?xml') || header.startsWith('<')) return 'xml';

  // Default to CSV for text content
  return 'csv';
}

// ============================================================================
// Async PDF normalization (for use with the update engine)
// ============================================================================
export async function normalizePDFAsync(
  filePath: string,
  hospitalId: string,
  fileId: string,
): Promise<NormalizationResult> {
  const errors: string[] = [];
  const buffer = fs.readFileSync(filePath);

  try {
    const data = await pdfParse(buffer);
    const text = data.text;

    if (!text || text.trim().length === 0) {
      // Attempt OCR fallback for scanned documents
      return attemptOCRFallback(filePath, hospitalId, fileId);
    }

    const rows = parsePDFText(text);
    const records = extractRecords(rows, hospitalId, fileId, errors);

    // If text extraction yielded no records, try OCR as well
    if (records.length === 0) {
      const ocrResult = await attemptOCRFallback(filePath, hospitalId, fileId);
      if (ocrResult.records.length > 0) return ocrResult;
    }

    return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
  } catch (err) {
    // On parse failure, try OCR as last resort
    try {
      return await attemptOCRFallback(filePath, hospitalId, fileId);
    } catch {
      return {
        records: [],
        errors: [`PDF async parse error: ${err}`],
        rawRowCount: 0,
        validRowCount: 0,
      };
    }
  }
}

/**
 * OCR fallback — extracts text from scanned PDF using Tesseract
 */
async function attemptOCRFallback(
  filePath: string,
  hospitalId: string,
  fileId: string,
): Promise<NormalizationResult> {
  const errors: string[] = [];
  try {
    const { isTesseractAvailable, extractTextWithOCR, parseOCRText } = await import('./ocr-fallback');

    const available = await isTesseractAvailable();
    if (!available) {
      return {
        records: [],
        errors: ['PDF contains no extractable text and Tesseract OCR is not installed for fallback.'],
        rawRowCount: 0,
        validRowCount: 0,
      };
    }

    const ocrText = await extractTextWithOCR(filePath);
    if (!ocrText || ocrText.trim().length === 0) {
      return {
        records: [],
        errors: ['OCR produced no text from scanned PDF.'],
        rawRowCount: 0,
        validRowCount: 0,
      };
    }

    const rows = parseOCRText(ocrText);
    const records = extractRecords(rows, hospitalId, fileId, errors);
    if (records.length > 0) {
      errors.unshift('Records extracted via OCR fallback (Tesseract).');
    }
    return { records, errors, rawRowCount: rows.length, validRowCount: records.length };
  } catch (err) {
    return {
      records: [],
      errors: [`OCR fallback failed: ${err}. Consider converting the PDF to CSV manually.`],
      rawRowCount: 0,
      validRowCount: 0,
    };
  }
}

// ============================================================================
// Shared Record Extraction Logic
// ============================================================================
function extractRecords(
  rows: Record<string, string>[],
  hospitalId: string,
  fileId: string,
  errors: string[],
): PricingRecord[] {
  if (rows.length === 0) return [];

  // Map columns to standard names
  const colMap = mapColumns(Object.keys(rows[0]));
  const records: PricingRecord[] = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];
      const billingCode = getField(row, colMap, 'billing_code');
      const description = getField(row, colMap, 'description');

      if (!billingCode && !description) continue;

      const payer = getField(row, colMap, 'payer') || undefined;
      const plan = getField(row, colMap, 'plan') || undefined;
      const codeType = detectBillingCodeType(billingCode);

      // Extract prices from multiple columns
      const priceFields: { type: PriceType; key: string }[] = [
        { type: 'gross_charge', key: 'gross_charge' },
        { type: 'discounted_cash', key: 'discounted_cash' },
        { type: 'min_negotiated', key: 'min_negotiated' },
        { type: 'max_negotiated', key: 'max_negotiated' },
      ];

      for (const pf of priceFields) {
        const priceStr = getField(row, colMap, pf.key);
        const price = parsePrice(priceStr);
        if (price !== null && price > 0) {
          const record: PricingRecord = {
            record_id: generateId(),
            hospital_id: hospitalId,
            billing_code: billingCode || 'UNKNOWN',
            billing_code_type: codeType,
            service_description: description || 'Unknown Service',
            payer: payer ?? null as unknown as string,
            plan: plan ?? null as unknown as string,
            price_type: pf.type,
            price,
            file_id: fileId,
            row_hash: hashRecord(hospitalId, billingCode, pf.type, payer, price),
          };
          records.push(record);
        }
      }

      // If no standard price columns found, check for generic price/amount
      if (!priceFields.some((pf) => getField(row, colMap, pf.key))) {
        const genericPrice = parsePrice(row['price'] || row['amount'] || row['charge']);
        if (genericPrice !== null && genericPrice > 0) {
          records.push({
            record_id: generateId(),
            hospital_id: hospitalId,
            billing_code: billingCode || 'UNKNOWN',
            billing_code_type: codeType,
            service_description: description || 'Unknown Service',
            payer: payer ?? null as unknown as string,
            plan: plan ?? null as unknown as string,
            price_type: 'gross_charge',
            price: genericPrice,
            file_id: fileId,
            row_hash: hashRecord(hospitalId, billingCode, 'gross_charge', payer, genericPrice),
          });
        }
      }
    } catch (err) {
      errors.push(`Row ${i + 1}: ${err}`);
    }
  }

  return records;
}

function mapColumns(headers: string[]): Record<string, string> {
  const colMap: Record<string, string> = {};
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));

  for (const [standardName, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (let i = 0; i < normalized.length; i++) {
      if (aliases.includes(normalized[i]) || aliases.some((a) => normalized[i].includes(a.replace(/[^a-z0-9]/g, '_')))) {
        colMap[standardName] = headers[i];
        break;
      }
    }
  }

  return colMap;
}

function getField(row: Record<string, string>, colMap: Record<string, string>, field: string): string {
  const colName = colMap[field];
  if (!colName) return '';
  return (row[colName] ?? '').toString().trim();
}

function parsePrice(value: string | undefined | null): number | null {
  if (!value) return null;
  const cleaned = value.toString().replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === 'N/A') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

function detectBillingCodeType(code: string): BillingCodeType {
  if (!code) return 'OTHER';
  for (const [type, pattern] of Object.entries(BILLING_CODE_PATTERNS)) {
    if (pattern.test(code)) return type as BillingCodeType;
  }
  return 'OTHER';
}

function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0] ?? '';
  const counts: Record<string, number> = { ',': 0, '\t': 0, '|': 0, ';': 0 };
  for (const char of firstLine) {
    if (char in counts) counts[char]++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : ',';
}

function hashRecord(
  hospitalId: string,
  billingCode: string,
  priceType: string,
  payer: string | undefined | null,
  price: number,
): string {
  const input = `${hospitalId}|${billingCode}|${priceType}|${payer ?? ''}|${price}`;
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}
