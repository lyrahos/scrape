// ============================================================================
// State Selection Page — Browse hospitals by state
// ============================================================================
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { Card } from '../common/Card';
import { US_STATES } from '../../../shared/constants';

interface HospitalEntry {
  hospital_id: string;
  name: string;
  city: string;
  zip: string;
  hospital_type?: string;
}

export function StatePage() {
  const { selectedState, setSelectedState } = useAppStore();
  const [hospitals, setHospitals] = useState<HospitalEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedState) {
      loadHospitals(selectedState);
    }
  }, [selectedState]);

  async function loadHospitals(state: string) {
    setLoading(true);
    try {
      const res = await window.electronAPI?.listHospitalsByState?.(state);
      setHospitals((res as HospitalEntry[]) ?? []);
    } catch {
      setHospitals([]);
    } finally {
      setLoading(false);
    }
  }

  const stateEntries = Object.entries(US_STATES).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Browse by State
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-6)', fontSize: 'var(--font-size-md)' }}>
        Select a state to see all hospitals in your database.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--space-6)', minHeight: '60vh' }}>
        {/* State List */}
        <div style={{
          height: 'calc(100vh - 220px)',
          overflowY: 'auto',
          paddingRight: 'var(--space-2)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {stateEntries.map(([abbr, name]) => (
              <button
                key={abbr}
                onClick={() => setSelectedState(abbr)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 'var(--space-2) var(--space-3)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: selectedState === abbr ? 'var(--color-accent-light)' : 'transparent',
                  color: selectedState === abbr ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: selectedState === abbr ? 600 : 400,
                  fontFamily: 'var(--font-family)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span>{name}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>{abbr}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Hospital List */}
        <div>
          {!selectedState && (
            <Card style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-lg)' }}>
                Select a state to view hospitals
              </p>
            </Card>
          )}

          {selectedState && loading && (
            <p className="animate-pulse" style={{ color: 'var(--color-text-tertiary)' }}>Loading hospitals...</p>
          )}

          {selectedState && !loading && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                  {US_STATES[selectedState]}
                </h3>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-tertiary)' }}>
                  {hospitals.length.toLocaleString()} hospital{hospitals.length !== 1 ? 's' : ''}
                </span>
              </div>

              {hospitals.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
                  <p style={{ color: 'var(--color-text-tertiary)' }}>
                    No hospitals found. Try discovering hospitals first.
                  </p>
                </Card>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                  gap: 'var(--space-3)',
                  maxHeight: 'calc(100vh - 260px)',
                  overflowY: 'auto',
                }}>
                  {hospitals.map((h) => (
                    <Card key={h.hospital_id} hover style={{ padding: 'var(--space-4)' }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-1)' }}>
                        {h.name}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {h.city} {h.zip}
                      </div>
                      {h.hospital_type && (
                        <span style={{
                          display: 'inline-block', marginTop: 'var(--space-2)',
                          fontSize: '10px', color: 'var(--color-accent)',
                          background: 'var(--color-accent-light)',
                          padding: '1px 6px', borderRadius: 'var(--radius-full)',
                        }}>
                          {h.hospital_type}
                        </span>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
