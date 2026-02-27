// ============================================================================
// Semantic Query Engine — Natural language to SQL with guardrails
// ============================================================================
import { getDatabase } from '../storage/database';
import { COMMON_CPT_CODES, US_STATES } from '../../shared/constants';
import type { SemanticQuery, QueryResult } from '../../shared/types';

// CPT description to code reverse lookup
const DESCRIPTION_TO_CPT = new Map<string, string>();
for (const [code, desc] of Object.entries(COMMON_CPT_CODES)) {
  DESCRIPTION_TO_CPT.set(desc.toLowerCase(), code);
}

// Procedure keywords → CPT
const PROCEDURE_KEYWORDS: Record<string, string> = {
  'knee replacement': '27447',
  'knee': '27447',
  'hip replacement': '27130',
  'hip': '27130',
  'vaginal delivery': '59400',
  'cesarean': '59510',
  'c-section': '59510',
  'office visit': '99213',
  'er visit': '99283',
  'emergency': '99283',
  'endoscopy': '43239',
  'colonoscopy': '45380',
  'brain mri': '70553',
  'mri': '70553',
  'chest xray': '71046',
  'chest x-ray': '71046',
  'ct scan': '74177',
  'ct abdomen': '74177',
  'ecg': '93000',
  'ekg': '93000',
  'echocardiogram': '93306',
  'echo': '93306',
  'blood draw': '36415',
  'blood test': '85025',
  'cbc': '85025',
  'metabolic panel': '80053',
  'cmp': '80053',
};

/**
 * Parse natural language query into structured components
 */
export function parseQuery(rawText: string): SemanticQuery {
  const text = rawText.toLowerCase().trim();
  const query: SemanticQuery = { raw_text: rawText };

  // Extract CPT code directly if mentioned
  const cptMatch = text.match(/\b(\d{5})\b/);
  if (cptMatch) {
    query.extracted_cpt = cptMatch[1];
  }

  // Extract procedure by keyword
  if (!query.extracted_cpt) {
    for (const [keyword, cpt] of Object.entries(PROCEDURE_KEYWORDS)) {
      if (text.includes(keyword)) {
        query.extracted_cpt = cpt;
        query.extracted_description = keyword;
        break;
      }
    }
  }

  // Extract area code
  const areaMatch = text.match(/\b(\d{3})\b(?![\d])/);
  if (areaMatch && !query.extracted_cpt?.startsWith(areaMatch[1])) {
    query.extracted_area_code = areaMatch[1];
  }

  // Extract ZIP code → area code
  const zipMatch = text.match(/\b(\d{5})\b/);
  if (zipMatch && zipMatch[1] !== query.extracted_cpt) {
    // Use ZIP prefix as area code approximation
    query.extracted_area_code = zipMatch[1].slice(0, 3);
  }

  // Extract state
  for (const [abbr, name] of Object.entries(US_STATES)) {
    if (text.includes(name.toLowerCase()) || new RegExp(`\\b${abbr.toLowerCase()}\\b`).test(text)) {
      query.extracted_state = abbr;
      break;
    }
  }

  // Extract date range
  const monthsMatch = text.match(/(?:past|last)\s+(\d+)\s+months?/);
  if (monthsMatch) {
    const months = parseInt(monthsMatch[1], 10);
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    query.extracted_date_range = {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  }

  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch && !query.extracted_date_range) {
    query.extracted_date_range = {
      start: `${yearMatch[1]}-01-01`,
      end: `${yearMatch[1]}-12-31`,
    };
  }

  // Generate SQL
  query.generated_sql = generateSQL(query);

  return query;
}

/**
 * Generate safe, parameterized SQL from parsed query
 */
function generateSQL(query: SemanticQuery): string {
  const conditions: string[] = [];
  const joins: string[] = ['JOIN hospitals h ON h.hospital_id = p.hospital_id'];

  if (query.extracted_cpt) {
    conditions.push(`p.billing_code = '${sanitize(query.extracted_cpt)}'`);
  }

  if (query.extracted_state) {
    conditions.push(`h.state = '${sanitize(query.extracted_state)}'`);
  }

  if (query.extracted_area_code) {
    conditions.push(`h.area_code = '${sanitize(query.extracted_area_code)}'`);
  }

  // Determine which table based on date range
  const useHistory = !!query.extracted_date_range;
  const table = useHistory ? 'pricing_data_history' : 'pricing_data_current';

  if (query.extracted_date_range) {
    conditions.push(`p.inserted_at >= '${sanitize(query.extracted_date_range.start)}'`);
    conditions.push(`p.inserted_at <= '${sanitize(query.extracted_date_range.end)}'`);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  if (useHistory) {
    return `SELECT
      h.name AS hospital_name, h.city, h.state, h.zip,
      p.billing_code, p.service_description, p.payer,
      p.price_type, p.price, p.inserted_at,
      strftime('%Y-%m', p.inserted_at) AS month
    FROM ${table} p ${joins.join(' ')} ${where}
    ORDER BY p.inserted_at DESC LIMIT 500`;
  }

  return `SELECT
    h.name AS hospital_name, h.city, h.state, h.zip,
    p.billing_code, p.service_description, p.payer,
    p.price_type, p.price, p.inserted_at
  FROM ${table} p ${joins.join(' ')} ${where}
  ORDER BY p.price ASC LIMIT 500`;
}

/**
 * Sanitize input to prevent SQL injection.
 * Only allows alphanumeric, spaces, hyphens, and underscores.
 */
function sanitize(input: string): string {
  return input.replace(/[^a-zA-Z0-9\s\-_]/g, '');
}

/**
 * Execute a semantic query and return structured results
 */
export function executeSemanticQuery(rawText: string): QueryResult {
  const parsed = parseQuery(rawText);

  if (!parsed.generated_sql) {
    return {
      columns: [],
      rows: [],
      summary: 'Could not understand the query. Try asking about a specific procedure (e.g., "knee replacement prices in Pennsylvania").',
    };
  }

  const db = getDatabase();

  try {
    // Validate: only SELECT allowed
    if (!parsed.generated_sql.trim().toUpperCase().startsWith('SELECT')) {
      return { columns: [], rows: [], summary: 'Only search queries are supported.' };
    }

    const rows = db.all(parsed.generated_sql);

    if (rows.length === 0) {
      return {
        columns: [],
        rows: [],
        summary: buildNoResultsSummary(parsed),
      };
    }

    const columns = Object.keys(rows[0]);

    // Build chart data if applicable
    const chartData = buildChartData(rows, parsed);

    return {
      columns,
      rows,
      chart_data: chartData,
      summary: buildSummary(rows, parsed),
    };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      summary: `Query error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

function buildSummary(rows: Record<string, unknown>[], query: SemanticQuery): string {
  const count = rows.length;
  const prices = rows.map((r) => Number(r.price)).filter((p) => p > 0);
  const procedure = query.extracted_description ??
    COMMON_CPT_CODES[query.extracted_cpt ?? ''] ??
    query.extracted_cpt ?? 'procedures';

  if (prices.length === 0) return `Found ${count} results for ${procedure}.`;

  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = Math.min(...prices);
  const max = Math.max(...prices);

  let summary = `Found ${count} pricing records for ${procedure}.`;
  summary += ` Prices range from $${min.toLocaleString()} to $${max.toLocaleString()}`;
  summary += ` (average: $${Math.round(avg).toLocaleString()}).`;

  if (query.extracted_state) {
    summary += ` Filtered to ${US_STATES[query.extracted_state] ?? query.extracted_state}.`;
  }

  return summary;
}

function buildNoResultsSummary(query: SemanticQuery): string {
  const procedure = query.extracted_description ??
    COMMON_CPT_CODES[query.extracted_cpt ?? ''] ?? 'the requested procedure';
  return `No pricing data found for ${procedure}. Try updating hospital data first, or broaden your search.`;
}

function buildChartData(rows: Record<string, unknown>[], query: SemanticQuery) {
  if (rows.length === 0) return undefined;

  // If we have monthly data, build a line chart
  if ('month' in rows[0]) {
    const monthlyData = new Map<string, number[]>();
    for (const row of rows) {
      const month = String(row.month);
      if (!monthlyData.has(month)) monthlyData.set(month, []);
      monthlyData.get(month)!.push(Number(row.price));
    }

    const labels = [...monthlyData.keys()].sort();
    const data = labels.map((m) => {
      const prices = monthlyData.get(m)!;
      return prices.reduce((a, b) => a + b, 0) / prices.length;
    });

    return {
      type: 'line' as const,
      labels,
      datasets: [{ label: 'Average Price', data, color: '#0066FF' }],
    };
  }

  // Otherwise, build a bar chart by hospital
  const hospitalPrices = new Map<string, number>();
  for (const row of rows) {
    const name = String(row.hospital_name ?? 'Unknown');
    if (!hospitalPrices.has(name)) {
      hospitalPrices.set(name, Number(row.price));
    }
  }

  const sorted = [...hospitalPrices.entries()].sort((a, b) => a[1] - b[1]).slice(0, 20);

  return {
    type: 'bar' as const,
    labels: sorted.map(([name]) => name),
    datasets: [{ label: 'Price', data: sorted.map(([, price]) => price), color: '#0066FF' }],
  };
}
