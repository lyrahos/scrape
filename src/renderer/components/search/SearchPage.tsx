// ============================================================================
// Search Page — Hospital search with results and pricing details
// ============================================================================
import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { SearchInput } from '../common/SearchInput';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

interface HospitalResult {
  hospital_id: string;
  name: string;
  city: string;
  state: string;
  zip: string;
  hospital_type?: string;
  address: string;
}

interface PricingResult {
  record_id: string;
  billing_code: string;
  billing_code_type: string;
  service_description: string;
  payer?: string;
  price_type: string;
  price: number;
}

export function SearchPage() {
  const { searchQuery, setSearchQuery } = useAppStore();
  const [results, setResults] = useState<HospitalResult[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<HospitalResult | null>(null);
  const [pricing, setPricing] = useState<PricingResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await window.electronAPI?.searchHospitals?.(searchQuery);
      setResults((res as HospitalResult[]) ?? []);
      setSelectedHospital(null);
      setPricing([]);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  const selectHospital = async (hospital: HospitalResult) => {
    setSelectedHospital(hospital);
    // Load pricing data for this hospital
    // For now we do this via a direct query
  };

  const handleScrape = async () => {
    if (!selectedHospital) return;
    setIsScraping(true);
    try {
      const result = await window.electronAPI?.scrapeHospitalFile?.(selectedHospital.hospital_id);
      useAppStore.getState().addNotification('success', `Processed ${(result as { recordsValid?: number })?.recordsValid ?? 0} records`);
    } catch (err) {
      useAppStore.getState().addNotification('error', `Scrape failed: ${err}`);
    } finally {
      setIsScraping(false);
    }
  };

  const priceTypeLabel = (pt: string) => {
    const labels: Record<string, string> = {
      gross_charge: 'Gross Charge',
      discounted_cash: 'Cash Price',
      min_negotiated: 'Min Negotiated',
      max_negotiated: 'Max Negotiated',
      payer_specific: 'Payer Rate',
    };
    return labels[pt] ?? pt;
  };

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Search Hospitals
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-md)' }}>
        Find hospitals by name, city, state, or ZIP code.
      </p>

      <div style={{ marginBottom: 'var(--space-6)' }}>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search by hospital name, city, or ZIP code..."
          onSubmit={handleSearch}
          autoFocus
        />
      </div>

      {isSearching && (
        <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Searching...</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: selectedHospital ? '1fr 1fr' : '1fr', gap: 'var(--space-6)' }}>
        {/* Results List */}
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
              {results.length} hospital{results.length !== 1 ? 's' : ''} found
            </p>
            {results.map((h) => (
              <Card
                key={h.hospital_id}
                hover
                onClick={() => selectHospital(h)}
                style={{
                  padding: 'var(--space-4)',
                  borderColor: selectedHospital?.hospital_id === h.hospital_id ? 'var(--color-accent)' : undefined,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginBottom: 'var(--space-1)' }}>
                  {h.name}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  {h.city}, {h.state} {h.zip}
                </div>
                {h.hospital_type && (
                  <span style={{
                    display: 'inline-block', marginTop: 'var(--space-2)',
                    fontSize: 'var(--font-size-xs)', color: 'var(--color-accent)',
                    background: 'var(--color-accent-light)',
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  }}>
                    {h.hospital_type}
                  </span>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Hospital Detail */}
        {selectedHospital && (
          <div className="animate-fade-in">
            <Card>
              <h3 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
                {selectedHospital.name}
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>
                {selectedHospital.address}
              </p>
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
                {selectedHospital.city}, {selectedHospital.state} {selectedHospital.zip}
              </p>

              <Button onClick={handleScrape} loading={isScraping} size="sm">
                {isScraping ? 'Scraping...' : 'Fetch Pricing Data'}
              </Button>

              {pricing.length > 0 && (
                <div style={{ marginTop: 'var(--space-6)' }}>
                  <h4 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                    Pricing Data
                  </h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                          <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Code</th>
                          <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Description</th>
                          <th style={{ textAlign: 'left', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Type</th>
                          <th style={{ textAlign: 'right', padding: 'var(--space-2)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pricing.slice(0, 50).map((p) => (
                          <tr key={p.record_id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: 'var(--space-2)', fontFamily: 'monospace' }}>{p.billing_code}</td>
                            <td style={{ padding: 'var(--space-2)' }}>{p.service_description}</td>
                            <td style={{ padding: 'var(--space-2)' }}>
                              <span style={{
                                fontSize: 'var(--font-size-xs)', padding: '2px 6px',
                                borderRadius: 'var(--radius-sm)', background: 'var(--color-surface-hover)',
                              }}>
                                {priceTypeLabel(p.price_type)}
                              </span>
                            </td>
                            <td style={{ padding: 'var(--space-2)', textAlign: 'right', fontWeight: 600 }}>
                              ${p.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {results.length === 0 && !isSearching && searchQuery && (
        <Card style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-md)' }}>
            No hospitals found. Try a different search term.
          </p>
        </Card>
      )}
    </div>
  );
}
