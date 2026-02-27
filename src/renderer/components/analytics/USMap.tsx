// ============================================================================
// US Map Component — SVG-based choropleth map of state pricing
// Using react-simple-maps for geographic rendering
// ============================================================================
import React, { useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// FIPS code to state abbreviation mapping
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

interface StateData {
  state: string;
  avg_price: number;
  hospital_count: number;
  record_count: number;
}

interface USMapProps {
  stateData: Map<string, StateData>;
  maxPrice: number;
}

export function USMap({ stateData, maxPrice }: USMapProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);

  const colorScale = scaleLinear<string>()
    .domain([0, maxPrice * 0.5, maxPrice])
    .range(['#E0F2FE', '#3B82F6', '#1E3A8A']);

  return (
    <div style={{ position: 'relative' }}>
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: '100%', height: 'auto', maxHeight: 500 }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const fips = geo.id;
                const stateAbbr = FIPS_TO_STATE[fips];
                const data = stateAbbr ? stateData.get(stateAbbr) : undefined;
                const fill = data ? colorScale(data.avg_price) : '#F0F1F3';

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#FFFFFF"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: { fill: '#0066FF', outline: 'none', cursor: 'pointer' },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(e) => {
                      if (data) {
                        const rect = (e.target as SVGElement).closest('svg')?.getBoundingClientRect();
                        setTooltip({
                          x: e.clientX - (rect?.left ?? 0),
                          y: e.clientY - (rect?.top ?? 0) - 10,
                          content: `${stateAbbr}: $${Math.round(data.avg_price).toLocaleString()} avg (${data.hospital_count} hospitals)`,
                        });
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--color-text-primary)',
          color: 'var(--color-text-inverse)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-xs)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}>
          {tooltip.content}
        </div>
      )}

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 'var(--space-2)', marginTop: 'var(--space-3)',
      }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>Low</span>
        <div style={{
          width: 200, height: 8, borderRadius: 4,
          background: 'linear-gradient(90deg, #E0F2FE, #3B82F6, #1E3A8A)',
        }} />
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>High</span>
      </div>
    </div>
  );
}
