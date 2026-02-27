// ============================================================================
// Analytics Page — Heat map, trends, variability, comparison
// Uses Recharts for production-grade visualizations
// ============================================================================
import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { USMap } from './USMap';
import { COMMON_CPT_CODES, US_STATES } from '../../../shared/constants';

type Tab = 'heatmap' | 'trends' | 'variability' | 'comparison';

interface StateMapData {
  state: string;
  avg_price: number;
  hospital_count: number;
  record_count: number;
  median_price?: number;
}

interface TrendData {
  period: string;
  avg_price: number;
  min_price: number;
  max_price: number;
  record_count: number;
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

interface ComparisonData {
  period: string;
  local_avg: number;
  state_avg: number;
  national_avg: number;
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
// Heat Map View — US Map + state tiles with color gradient
// ============================================================================
function HeatMapView() {
  const [data, setData] = useState<StateMapData[]>([]);
  const [cptCode, setCptCode] = useState('27447');
  const [priceType, setPriceType] = useState('gross_charge');
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const res = await window.electronAPI?.getStateMap?.(cptCode, priceType);
      setData((res as StateMapData[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [cptCode, priceType]);

  const maxPrice = Math.max(...data.map((d) => d.avg_price), 1);
  const stateDataMap = new Map(data.map((d) => [d.state, d]));

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
            Procedure (CPT)
          </label>
          <select value={cptCode} onChange={(e) => setCptCode(e.target.value)} style={selectStyle}>
            {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
              <option key={code} value={code}>{code} — {desc}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
            Price Type
          </label>
          <select value={priceType} onChange={(e) => setPriceType(e.target.value)} style={selectStyle}>
            <option value="gross_charge">Gross Charge</option>
            <option value="discounted_cash">Cash Price</option>
            <option value="min_negotiated">Min Negotiated</option>
            <option value="max_negotiated">Max Negotiated</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No pricing data available. Update hospitals first.</p>
        </Card>
      ) : (
        <>
          {/* US Map */}
          <Card style={{ marginBottom: 'var(--space-6)', padding: 'var(--space-4)' }}>
            <USMap stateData={stateDataMap} maxPrice={maxPrice} />
          </Card>

          {/* State Tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 'var(--space-2)' }}>
            {data.sort((a, b) => b.avg_price - a.avg_price).map((d) => {
              const intensity = d.avg_price / maxPrice;
              return (
                <Card key={d.state} style={{
                  padding: 'var(--space-3)',
                  background: `rgba(0, 102, 255, ${0.05 + intensity * 0.3})`,
                  border: 'none', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{d.state}</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: '#0052CC' }}>
                    ${Math.round(d.avg_price).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    {d.hospital_count} hospitals
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Trends View — Line/area chart for price changes over time
// ============================================================================
function TrendsView() {
  const [data, setData] = useState<TrendData[]>([]);
  const [cptCode, setCptCode] = useState('27447');
  const [state, setState] = useState('');
  const [areaCode, setAreaCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      const res = await window.electronAPI?.getTrends?.(cptCode, state || undefined, areaCode || undefined);
      setData((res as TrendData[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [cptCode, state, areaCode]);

  const procedureName = COMMON_CPT_CODES[cptCode] ?? cptCode;

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
            Procedure
          </label>
          <select value={cptCode} onChange={(e) => setCptCode(e.target.value)} style={selectStyle}>
            {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
              <option key={code} value={code}>{code} — {desc}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
            State
          </label>
          <select value={state} onChange={(e) => setState(e.target.value)} style={selectStyle}>
            <option value="">All States</option>
            {Object.entries(US_STATES).map(([abbr, name]) => (
              <option key={abbr} value={abbr}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
            Area Code
          </label>
          <input
            value={areaCode} onChange={(e) => setAreaCode(e.target.value)}
            placeholder="e.g., 215" maxLength={3} style={inputStyle}
          />
        </div>
      </div>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No trend data available yet.</p>
        </Card>
      ) : (
        <Card>
          <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
            {procedureName} — Price Trend
          </h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
              <defs>
                <linearGradient id="avgGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0066FF" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#0066FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
              <Tooltip
                contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
              />
              <Legend />
              <Area type="monotone" dataKey="max_price" stroke="#EF4444" fill="none" strokeDasharray="4 4" name="Max" />
              <Area type="monotone" dataKey="avg_price" stroke="#0066FF" fill="url(#avgGrad)" strokeWidth={2} name="Average" />
              <Area type="monotone" dataKey="min_price" stroke="#10B981" fill="none" strokeDasharray="4 4" name="Min" />
            </AreaChart>
          </ResponsiveContainer>
          <div style={{ textAlign: 'center', marginTop: 'var(--space-2)', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            {data.length} data points
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Variability View — Horizontal bar chart of most volatile procedures
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

  // Prepare chart data with min/avg/max for stacked-style display
  const chartData = data.map((d) => ({
    name: `${d.billing_code} ${d.description?.slice(0, 30) ?? ''}`,
    min: d.min_price,
    avg: d.avg_price - d.min_price,
    max: d.max_price - d.avg_price,
    fullMin: d.min_price,
    fullAvg: d.avg_price,
    fullMax: d.max_price,
    spread: d.spread,
    hospitals: d.hospital_count,
  }));

  return (
    <div>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        Most Variable Procedures
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Procedures with the largest price spread across hospitals. Wider bars indicate greater variability.
      </p>

      {loading ? (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading...</p>
      ) : data.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <p style={{ color: 'var(--color-text-tertiary)' }}>No variability data yet.</p>
        </Card>
      ) : (
        <>
          <Card style={{ marginBottom: 'var(--space-6)' }}>
            <ResponsiveContainer width="100%" height={Math.max(400, data.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 150, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#6B7280' }} width={140} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB' }}
                  formatter={(value: number, name: string) => {
                    const labels: Record<string, string> = { min: 'Min Price', avg: 'Avg Range', max: 'Max Range' };
                    return [`$${value.toLocaleString()}`, labels[name] ?? name];
                  }}
                />
                <Bar dataKey="min" stackId="a" fill="#10B981" name="min" radius={[4, 0, 0, 4]} />
                <Bar dataKey="avg" stackId="a" fill="#0066FF" name="avg" />
                <Bar dataKey="max" stackId="a" fill="#EF4444" name="max" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Detail cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {data.slice(0, 10).map((d) => (
              <Card key={d.billing_code} style={{ padding: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, marginRight: 'var(--space-2)' }}>{d.billing_code}</span>
                    <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{d.description}</span>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>{d.hospital_count} hospitals</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ color: '#10B981', fontWeight: 600 }}>Min: ${d.min_price.toLocaleString()}</span>
                  <span style={{ fontWeight: 600 }}>Avg: ${Math.round(d.avg_price).toLocaleString()}</span>
                  <span style={{ color: '#EF4444', fontWeight: 600 }}>Max: ${d.max_price.toLocaleString()}</span>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>Spread: ${d.spread.toLocaleString()}</span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Comparison View — Multi-line chart comparing local vs state vs national
// ============================================================================
function ComparisonView() {
  const [cptCode, setCptCode] = useState('27447');
  const [areaCode, setAreaCode] = useState('');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2026-12-31');
  const [data, setData] = useState<ComparisonData[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleCompare() {
    if (!cptCode || !areaCode) return;
    setLoading(true);
    try {
      const res = await window.electronAPI?.getComparison?.(cptCode, areaCode, startDate, endDate);
      setData((res as ComparisonData[]) ?? []);
    } catch { setData([]); }
    finally { setLoading(false); }
  }

  const procedureName = COMMON_CPT_CODES[cptCode] ?? cptCode;

  return (
    <div>
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
        Historical Comparison
      </h3>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-sm)' }}>
        Compare pricing for a procedure in your area vs. state and national averages over time.
      </p>

      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              Procedure
            </label>
            <select value={cptCode} onChange={(e) => setCptCode(e.target.value)} style={selectStyle}>
              {Object.entries(COMMON_CPT_CODES).map(([code, desc]) => (
                <option key={code} value={code}>{code} — {desc}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
              Area Code
            </label>
            <input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="e.g., 215" maxLength={3} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>Start</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>End</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          <Button onClick={handleCompare} loading={loading}>Compare</Button>
        </div>
      </Card>

      {data.length > 0 && (
        <>
          <Card style={{ marginBottom: 'var(--space-6)' }}>
            <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
              {procedureName} — Area {areaCode} vs. Averages
            </h4>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={data} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: '1px solid #E5E7EB' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                />
                <Legend />
                <Line type="monotone" dataKey="local_avg" stroke="#0066FF" strokeWidth={3} name="Local (Your Area)" dot={false} />
                <Line type="monotone" dataKey="state_avg" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6 3" name="State Average" dot={false} />
                <Line type="monotone" dataKey="national_avg" stroke="#9CA3AF" strokeWidth={2} strokeDasharray="3 3" name="National Average" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Data Table */}
          <Card>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={thStyle}>Period</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Local Avg</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>State Avg</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>National Avg</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>% vs National</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => {
                  const pctDiff = d.local_avg && d.national_avg
                    ? ((d.local_avg - d.national_avg) / d.national_avg * 100).toFixed(1)
                    : null;
                  return (
                    <tr key={d.period} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={tdStyle}>{d.period}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                        {d.local_avg ? `$${Math.round(d.local_avg).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {d.state_avg ? `$${Math.round(d.state_avg).toLocaleString()}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {d.national_avg ? `$${Math.round(d.national_avg).toLocaleString()}` : '—'}
                      </td>
                      <td style={{
                        ...tdStyle, textAlign: 'right', fontWeight: 600,
                        color: pctDiff && parseFloat(pctDiff) > 0 ? '#EF4444' : '#10B981',
                      }}>
                        {pctDiff ? `${parseFloat(pctDiff) > 0 ? '+' : ''}${pctDiff}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Shared styles
// ============================================================================
const selectStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family)', background: 'var(--color-surface)',
};

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family)', width: 120,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500, fontSize: 'var(--font-size-xs)',
};

const tdStyle: React.CSSProperties = {
  padding: 'var(--space-2)',
};
