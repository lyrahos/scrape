// ============================================================================
// State Hospital Registries — Additional data sources beyond CMS
// ============================================================================
import axios from 'axios';
import { parse as csvParse } from 'csv-parse/sync';
import type { Hospital } from '../../shared/types';
import { generateId } from '../storage/database';
import { HospitalRepo } from '../storage/repositories';

const USER_AGENT = 'HospitalTransparencyBot/1.0';
const TIMEOUT = 60000;

/**
 * State-level hospital registry endpoints.
 * Many states publish their own hospital directories with additional detail
 * not available from CMS (e.g., license numbers, bed counts, transparency URLs).
 */
const STATE_REGISTRIES: { state: string; name: string; url: string; parser: RegistryParser }[] = [
  {
    state: 'CA',
    name: 'California OSHPD',
    url: 'https://data.ca.gov/dataset/licensed-and-certified-healthcare-facility-bed-types-and-counts',
    parser: parseGenericCSV,
  },
  {
    state: 'NY',
    name: 'New York Health Profiles',
    url: 'https://health.data.ny.gov/api/views/mc6r-d6g8/rows.csv?accessType=DOWNLOAD',
    parser: parseGenericCSV,
  },
  {
    state: 'TX',
    name: 'Texas DSHS',
    url: 'https://www.dshs.texas.gov/thcic/hospitals/HospitalList.shtm',
    parser: parseGenericCSV,
  },
  {
    state: 'FL',
    name: 'Florida AHCA',
    url: 'https://bi.ahca.myflorida.com/t/ABIDOMAP/views/HospitalFacilities/Hospital',
    parser: parseGenericCSV,
  },
  {
    state: 'PA',
    name: 'Pennsylvania Health Care Cost Containment Council',
    url: 'https://www.phc4.org/reports/utilization/',
    parser: parseGenericCSV,
  },
];

type RegistryParser = (data: string, state: string) => Omit<Hospital, 'created_at' | 'updated_at'>[];

/**
 * Discover hospitals from state registries
 */
export async function discoverFromStateRegistries(
  states?: string[],
  onProgress?: (msg: string) => void,
): Promise<number> {
  const registries = states
    ? STATE_REGISTRIES.filter((r) => states.includes(r.state))
    : STATE_REGISTRIES;

  let total = 0;

  for (const registry of registries) {
    onProgress?.(`Checking ${registry.name} (${registry.state})...`);

    try {
      const response = await axios.get(registry.url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': USER_AGENT },
        responseType: 'text',
        validateStatus: (s) => s < 400,
      });

      const hospitals = registry.parser(response.data, registry.state);
      if (hospitals.length > 0) {
        const count = HospitalRepo.upsertBatch(hospitals);
        total += count;
        onProgress?.(`Found ${count} hospitals from ${registry.name}`);
      }
    } catch (err) {
      onProgress?.(`Failed to fetch ${registry.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return total;
}

/**
 * Generic CSV parser for state registry data.
 * Attempts to map common column patterns.
 */
function parseGenericCSV(data: string, state: string): Omit<Hospital, 'created_at' | 'updated_at'>[] {
  try {
    const rows = csvParse(data, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
    });

    const hospitals: Omit<Hospital, 'created_at' | 'updated_at'>[] = [];

    for (const row of rows) {
      const name = findField(row, ['facility_name', 'hospital_name', 'name', 'facility', 'provider_name']);
      const address = findField(row, ['address', 'street', 'street_address', 'location_address']);
      const city = findField(row, ['city', 'municipality']);
      const zip = findField(row, ['zip', 'zip_code', 'zipcode', 'postal_code']);

      if (!name || !city) continue;

      hospitals.push({
        hospital_id: generateId(),
        name,
        address: address || '',
        city,
        state,
        zip: zip || '',
        county: findField(row, ['county', 'county_name']),
        hospital_type: findField(row, ['type', 'hospital_type', 'facility_type']),
        ownership_type: findField(row, ['ownership', 'ownership_type']),
        website_url: findField(row, ['website', 'url', 'web_address']),
      });
    }

    return hospitals;
  } catch {
    return [];
  }
}

/**
 * Find a field value from a row using multiple possible column names
 */
function findField(row: Record<string, string>, candidates: string[]): string | undefined {
  const normalizedKeys = Object.keys(row).map((k) => ({
    original: k,
    normalized: k.toLowerCase().trim().replace(/[^a-z0-9]/g, '_'),
  }));

  for (const candidate of candidates) {
    const match = normalizedKeys.find((k) => k.normalized === candidate || k.normalized.includes(candidate));
    if (match && row[match.original]?.trim()) {
      return row[match.original].trim();
    }
  }
  return undefined;
}

/**
 * Search-based fallback: attempt to find hospital transparency page via web search pattern
 */
export function buildSearchUrl(hospitalName: string): string {
  const query = encodeURIComponent(`${hospitalName} price transparency standard charges`);
  return `https://www.google.com/search?q=${query}`;
}
