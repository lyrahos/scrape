// ============================================================================
// Sidebar Navigation — Apple-style minimal sidebar
// ============================================================================
import React from 'react';
import { useAppStore, type NavPage } from '../../store/appStore';

const navItems: { id: NavPage; label: string; icon: string }[] = [
  { id: 'search', label: 'Search Hospital', icon: '🔍' },
  { id: 'state', label: 'Select State', icon: '🗺' },
  { id: 'update', label: 'Update Hospitals', icon: '🔄' },
  { id: 'analytics', label: 'Data', icon: '📊' },
  { id: 'query', label: 'Ask Pricing Question', icon: '💬' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setPage = useAppStore((s) => s.setPage);
  const stats = useAppStore((s) => s.stats);

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      minWidth: 'var(--sidebar-width)',
      height: '100vh',
      background: 'var(--color-sidebar-bg)',
      borderRight: '1px solid var(--color-border-light)',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* Title bar drag area */}
      <div className="titlebar-drag" style={{
        height: 'var(--header-height)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-5)',
      }}>
        <h1 style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          letterSpacing: '-0.01em',
        }}>
          Price Transparency
        </h1>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: 'var(--space-2) var(--space-3)', overflow: 'auto' }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className="titlebar-no-drag"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              width: '100%',
              padding: 'var(--space-2) var(--space-3)',
              marginBottom: 'var(--space-1)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: currentPage === item.id ? 'var(--color-accent-light)' : 'transparent',
              color: currentPage === item.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: currentPage === item.id ? 600 : 400,
              fontFamily: 'var(--font-family)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => {
              if (currentPage !== item.id) {
                e.currentTarget.style.background = 'var(--color-surface-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage !== item.id) {
                e.currentTarget.style.background = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: '1rem', width: '20px', textAlign: 'center' }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Stats footer */}
      {stats && (
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderTop: '1px solid var(--color-border-light)',
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            Database
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <StatItem label="Hospitals" value={stats.totalHospitals.toLocaleString()} />
            <StatItem label="Records" value={stats.totalRecords.toLocaleString()} />
            <StatItem label="Files" value={stats.activeFiles.toLocaleString()} />
            <StatItem label="This Week" value={stats.updatesThisWeek.toLocaleString()} />
          </div>
        </div>
      )}
    </aside>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
        {label}
      </div>
    </div>
  );
}
