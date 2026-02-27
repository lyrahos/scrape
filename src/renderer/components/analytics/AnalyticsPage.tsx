// ============================================================================
// Analytics Page — Heat map, trends, variability, comparison
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { COMMON_CPT_CODES, US_STATES } from '../../../shared/constants';

type Tab = 'heatmap' | 'trends' | 'variability' | 'comparison';

interface StateMapData {
  state: string;
  avg_price: number;
  hospital_count: number;
  record_count: number;
}

interface TrendData {
  period: string;
  avg_price: number;
  min_price: number;
  max_price: number;
}

interface VariabilityData {
  billing_code: string;
  description: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  spread: number;
  hospital_count: number;
}

export function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('heatmap');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'heatmap', label: 'Heat Map' },
    { id: 'trends', label: 'Trends' },
    { id: 'variability', label: 'Variability' },
    { id: 'comparison', label: 'Comparison' },
  ];

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Data & Analytics
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-md)' }}>
        Explore pricing insights, trends, and comparisons across hospitals.
      </p>

      {/* Tab Switcher */}
      <div style={{
        display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-6)',
        background: 'var(--color-surface-hover)', borderRadius: 'var(--radius-md)',
        padding: 'var(--space-1)', width: 'fit-content',
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: activeTab === tab.id ? 'var(--color-surface)' : 'transparent',
              color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontFamily: 'var(--font-family)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              boxShadow: activeTab === tab.id ? '0 1px 3px var(--color-card-shadow)' : 'none',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'heatmap' && <HeatMapView />}
      {activeTab === 'trends' && <TrendsView />}
      {activeTab === 'variability' && <VariabilityView />}
      {activeTab === 'comparison' && <ComparisonView />}
    </div>
  );
}

// ============================================================================
// Heat Map View — Average pricing by state
// ============================================================================
function HeatMapView() {
  const [data, setData] = useState<StateMapData[]>([]);
  const [cptCode, setCptCode] = useState('27447');
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const res = await window.electronAPI?.getStateMap?.(cptCode, 'gross_charge');
      setData((res as StateMapData[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [cptCode]);

  const maxPrice = Math.max(...data.map((d) => d.avg_price), 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center' }}>
        <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>CPT Code:</label>
        <select
          value={cptCode}
          onChange={(e) => setCptCode(e.target.value)}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'var(--font-family)',
            background: 'var(--color-surface)',
          }}
        >
          {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
            <option key={code} value={code}>{code} — {desc}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No pricing data available. Update hospitals first.</p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 'var(--space-2)' }}>
          {data.sort((a, b) => b.avg_price - a.avg_price).map((d) => {
            const intensity = d.avg_price / maxPrice;
            const bg = `rgba(0, 102, 255, ${0.08 + intensity * 0.35})`;
            return (
              <Card key={d.state} style={{
                padding: 'var(--space-3)', background: bg, border: 'none', textAlign: 'center',
              }}>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{d.state}</div>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-accent)' }}>
                  ${Math.round(d.avg_price).toLocaleString()}
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {d.hospital_count} hospitals
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Trends View — Price changes over time (rendered as simple bar chart)
// ============================================================================
function TrendsView() {
  const [data, setData] = useState<TrendData[]>([]);
  const [cptCode, setCptCode] = useState('27447');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const res = await window.electronAPI?.getTrends?.(cptCode, state || undefined);
      setData((res as TrendData[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [cptCode, state]);

  const maxPrice = Math.max(...data.map((d) => d.max_price), 1);

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={cptCode}
          onChange={(e) => setCptCode(e.target.value)}
          style={{
            padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
          }}
        >
          {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
            <option key={code} value={code}>{code} — {desc}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          style={{
            padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
          }}
        >
          <option value="">All States</option>
          {Object.entries(US_STATES).map(([abbr, name]) => (
            <option key={abbr} value={abbr}>{name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No trend data available yet.</p>
        </Card>
      ) : (
        <Card>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', height: 300, padding: 'var(--space-4)' }}>
            {data.map((d, i) => (
              <div key={d.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  ${Math.round(d.avg_price).toLocaleString()}
                </span>
                <div style={{
                  width: '100%', maxWidth: 40,
                  height: `${(d.avg_price / maxPrice) * 240}px`,
                  background: 'var(--color-accent)',
                  borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                  transition: 'height var(--transition-slow)',
                  opacity: 0.7 + (i / data.length) * 0.3,
                }} />
                <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                  {d.period.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Variability View — Most volatile procedures
// ============================================================================
function VariabilityView() {
  const [data, setData] = useState<VariabilityData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    window.electronAPI?.getVariability?.(20)
      .then((res) => setData((res as VariabilityData[]) ?? []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
        Most Variable Procedures
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Procedures with the largest price spread across hospitals.
      </p>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No variability data yet.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {data.map((d, i) => {
            const maxSpread = data[0]?.spread ?? 1;
            return (
              <Card key={d.billing_code} style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 'var(--space-2)' }}>
                      {d.billing_code}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      {d.description}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                    {d.hospital_count} hospitals
                  </span>
                </div>

                {/* Spread bar */}
                <div style={{ position: 'relative', height: 8, background: 'var(--color-surface-hover)', borderRadius: 4 }}>
                  <div style={{
                    position: 'absolute', height: '100%', borderRadius: 4,
                    background: `linear-gradient(90deg, var(--color-success), var(--color-warning), var(--color-error))`,
                    width: `${(d.spread / maxSpread) * 100}%`,
                    transition: 'width var(--transition-slow)',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ color: 'var(--color-success)' }}>${d.min_price.toLocaleString()}</span>
                  <span style={{ fontWeight: 600 }}>Avg: ${Math.round(d.avg_price).toLocaleString()}</span>
                  <span style={{ color: 'var(--color-error)' }}>${d.max_price.toLocaleString()}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Comparison View — Historical comparison tool
// ============================================================================
function ComparisonView() {
  const [cptCode, setCptCode] = useState('27447');
  const [areaCode, setAreaCode] = useState('');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [data, setData] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleCompare() {
    if (!cptCode || !areaCode) return;
    setLoading(true);
    try {
      const res = await window.electronAPI?.getComparison?.(cptCode, areaCode, startDate, endDate);
      setData((res as unknown[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
        Historical Comparison
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Compare pricing trends for a procedure in your area code versus state and national averages.
      </p>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              Procedure
            </label>
            <select
              value={cptCode}
              onChange={(e) => setCptCode(e.target.value)}
              style={{
                padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
              }}
            >
              {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
                <option key={code} value={code}>{code} — {desc}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              Area Code
            </label>
            <input
              type="text"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="e.g., 215"
              maxLength={3}
              style={{
                padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)',
                fontFamily: 'var(--font-family)', width: 100,
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              Start Date
            </label>
            <input
              type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              style={{
                padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              End Date
            </label>
            <input
              type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              style={{
                padding: 'var(--space-2) var(--space-3)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)', fontFamily: 'var(--font-family)',
              }}
            />
          </div>

          <Button onClick={handleCompare} loading={loading}>Compare</Button>
        </div>
      </Card>

      {data.length > 0 && (
        <Card>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Period</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Local Avg</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>State Avg</th>
                <th style={{ textAlign: 'right', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>National Avg</th>
              </tr>
            </thead>
            <tbody>
              {(data as { period: string; local_avg: number; state_avg: number; national_avg: number }[]).map((d) => (
                <tr key={d.period} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: 'var(--space-2)' }}>{d.period}</td>
                  <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>
                    {d.local_avg ? `$${Math.round(d.local_avg).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                    {d.state_avg ? `$${Math.round(d.state_avg).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: 'var(--space-2)', textAlign: 'right' }}>
                    {d.national_avg ? `$${Math.round(d.national_avg).toLocaleString()}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
