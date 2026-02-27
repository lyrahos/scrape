// ============================================================================
// Hospital Discovery — CMS datasets, state registries, intelligent crawling
// ============================================================================
import axios from 'axios';
import { parse as csvParse } from 'csv-parse/sync';
import type { Hospital } from '../../shared/types';
import { generateId } from '../storage/database';
import { HospitalRepo } from '../storage/repositories';

const CMS_CSV_URL =
  'https://data.cms.gov/provider-data/sites/default/files/resources/092b30de4bdf1bb4a5aa76b3c3c65826/Hospital_General_Information.csv';

interface CMSHospitalRow {
  'Facility ID': string;
  'Facility Name': string;
  Address: string;
  City: string;
  State: string;
  'ZIP Code': string;
  'County Name': string;
  'Phone Number': string;
  'Hospital Type': string;
  'Hospital Ownership': string;
  [key: string]: string;
}

export interface DiscoveryProgress {
  phase: string;
  current: number;
  total: number;
  message: string;
}

type ProgressCallback = (progress: DiscoveryProgress) => void;

export async function discoverHospitalsFromCMS(
  onProgress?: ProgressCallback
): Promise<number> {
  onProgress?.({ phase: 'download', current: 0, total: 1, message: 'Downloading CMS hospital data...' });

  const response = await axios.get(CMS_CSV_URL, {
    timeout: 120000,
    responseType: 'text',
    headers: { 'Accept': 'text/csv' },
  });

  onProgress?.({ phase: 'parse', current: 0, total: 1, message: 'Parsing hospital records...' });

  const rows: CMSHospitalRow[] = csvParse(response.data, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });

  const hospitals: Omit<Hospital, 'created_at' | 'updated_at'>[] = [];
  const total = rows.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row['Facility Name'] || !row['State']) continue;

    const phone = row['Phone Number']?.replace(/\D/g, '') ?? '';
    const areaCode = phone.length >= 10 ? phone.slice(0, 3) : undefined;

    hospitals.push({
      hospital_id: generateId(),
      cms_certification_num: row['Facility ID'] || undefined,
      name: row['Facility Name'],
      address: row['Address'] || '',
      city: row['City'] || '',
      state: row['State'] || '',
      zip: row['ZIP Code'] || '',
      county: row['County Name'] || undefined,
      area_code: areaCode,
      hospital_type: row['Hospital Type'] || undefined,
      ownership_type: row['Hospital Ownership'] || undefined,
    });

    if (i % 500 === 0) {
      onProgress?.({ phase: 'parse', current: i, total, message: `Parsed ${i} of ${total} hospitals` });
    }
  }

  onProgress?.({ phase: 'store', current: 0, total: hospitals.length, message: 'Storing hospitals in database...' });

  // Batch insert in chunks
  const chunkSize = 500;
  let stored = 0;
  for (let i = 0; i < hospitals.length; i += chunkSize) {
    const chunk = hospitals.slice(i, i + chunkSize);
    HospitalRepo.upsertBatch(chunk);
    stored += chunk.length;
    onProgress?.({ phase: 'store', current: stored, total: hospitals.length, message: `Stored ${stored} of ${hospitals.length}` });
  }

  onProgress?.({ phase: 'complete', current: stored, total: stored, message: `Discovered ${stored} hospitals` });
  return stored;
}

/**
 * Extracts area code from a ZIP code by mapping to known area codes.
 * This is a simplified approach — production would use a ZIP-to-area-code database.
 */
export function zipToAreaCode(zip: string): string | undefined {
  // Major area codes by ZIP prefix — abbreviated mapping
  const zipPrefixToArea: Record<string, string> = {
    '100': '212', '101': '212', '110': '516', '112': '718',
    '191': '215', '192': '215', '200': '202', '212': '301',
    '300': '404', '331': '312', '606': '606', '700': '504',
    '750': '214', '770': '713', '800': '303', '900': '213',
    '941': '415', '981': '206',
  };
  if (zip && zip.length >= 3) {
    return zipPrefixToArea[zip.slice(0, 3)];
  }
  return undefined;
}
