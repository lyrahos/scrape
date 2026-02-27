// ============================================================================
// Utility formatters for the UI layer
// ============================================================================

/**
 * Format price as USD with dollar sign and commas
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format large numbers with abbreviations (e.g., 1.2K, 3.4M)
 */
export function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

/**
 * Format date string for display
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format relative time (e.g., "3 days ago")
 */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

/**
 * Format percentage change with + or - prefix
 */
export function formatPctChange(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '\u2026';
}

/**
 * Convert billing code type to readable label
 */
export function formatBillingCodeType(type: string): string {
  const labels: Record<string, string> = {
    CPT: 'CPT',
    HCPCS: 'HCPCS',
    DRG: 'DRG',
    'MS-DRG': 'MS-DRG',
    'APR-DRG': 'APR-DRG',
    'ICD-10': 'ICD-10',
    NDC: 'NDC',
    OTHER: 'Other',
  };
  return labels[type] ?? type;
}

/**
 * Convert price type to readable label
 */
export function formatPriceType(type: string): string {
  const labels: Record<string, string> = {
    gross_charge: 'Gross Charge',
    discounted_cash: 'Cash Price',
    min_negotiated: 'Min Negotiated',
    max_negotiated: 'Max Negotiated',
    payer_specific: 'Payer Rate',
    de_identified_min: 'De-ID Min',
    de_identified_max: 'De-ID Max',
  };
  return labels[type] ?? type;
}
