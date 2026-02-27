// ============================================================================
// Semantic Query Page — Natural language pricing questions
// ============================================================================
import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface QueryResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  summary?: string;
  chart_data?: {
    type: string;
    labels: string[];
    datasets: { label: string; data: number[]; color?: string }[];
  };
}

const EXAMPLE_QUERIES = [
  'Show me knee replacement prices in Pennsylvania',
  'What does a colonoscopy cost near 19107?',
  'Compare MRI prices across states',
  'Emergency room visit costs over the past 6 months',
  'Average hip replacement cost in California',
  'Cheapest chest x-ray near 10001',
];

export function QueryPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<QueryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await window.electronAPI?.semanticQuery?.(query);
      setResult(res as QueryResponse);
    } catch (err) {
      setResult({ columns: [], rows: [], summary: `Error: ${err}` });
    } finally {
      setLoading(false);
    }
  }

  function handleExampleClick(example: string) {
    setQuery(example);
  }

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'number') {
      if (val >= 100) return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      return val.toString();
    }
    return String(val);
  };

  const exportCSV = () => {
    if (!result || result.rows.length === 0) return;
    const headers = result.columns.join(',');
    const rows = result.rows.map((r) => result.columns.map((c) => `"${r[c] ?? ''}"`).join(','));
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pricing_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Ask a Pricing Question
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-md)' }}>
        Type a question in plain English about hospital pricing.
      </p>

      {/* Query Input */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g., Show me knee replacement prices near 19107 over the past 6 months..."
            style={{
              flex: 1,
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-md)',
              fontFamily: 'var(--font-family)',
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
          />
          <Button onClick={handleSubmit} loading={loading} size="lg">
            Ask
          </Button>
        </div>

        {/* Example queries */}
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => handleExampleClick(q)}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-surface)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-family)',
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-light)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
            >
              {q}
            </button>
          ))}
        </div>
      </Card>

      {/* Results */}
      {result && (
        <div className="animate-fade-in">
          {/* Summary */}
          {result.summary && (
            <Card style={{ marginBottom: 'var(--space-4)', background: 'var(--color-accent-light)', border: 'none' }}>
              <p style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-accent)', fontWeight: 500 }}>
                {result.summary}
              </p>
            </Card>
          )}

          {/* Chart */}
          {result.chart_data && result.chart_data.labels.length > 0 && (
            <Card style={{ marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
                {result.chart_data.datasets[0]?.label ?? 'Results'}
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-1)', height: 200 }}>
                {result.chart_data.labels.map((label, i) => {
                  const value = result.chart_data!.datasets[0]?.data[i] ?? 0;
                  const maxVal = Math.max(...(result.chart_data!.datasets[0]?.data ?? [1]));
                  return (
                    <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                        ${Math.round(value).toLocaleString()}
                      </span>
                      <div style={{
                        width: '100%', maxWidth: 32,
                        height: `${(value / maxVal) * 160}px`,
                        background: 'var(--color-accent)',
                        borderRadius: '4px 4px 0 0',
                        opacity: 0.8,
                      }} />
                      <span style={{
                        fontSize: '8px', color: 'var(--color-text-tertiary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 60, textAlign: 'center',
                      }}>
                        {label.length > 10 ? label.slice(0, 10) + '...' : label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Data Table */}
          {result.rows.length > 0 && (
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  {result.rows.length} results
                </span>
                <Button onClick={exportCSV} variant="ghost" size="sm">
                  Export CSV
                </Button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      {result.columns.map((col) => (
                        <th key={col} style={{
                          textAlign: 'left', padding: 'var(--space-2)',
                          color: 'var(--color-text-tertiary)', fontWeight: 500,
                          fontSize: 'var(--font-size-xs)', whiteSpace: 'nowrap',
                        }}>
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.slice(0, 100).map((row, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        {result.columns.map((col) => (
                          <td key={col} style={{
                            padding: 'var(--space-2)',
                            whiteSpace: 'nowrap',
                            maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {formatValue(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {result.rows.length > 100 && (
                <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                  Showing 100 of {result.rows.length} results. Export CSV for full data.
                </p>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
