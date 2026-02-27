// ============================================================================
// App Root — Layout with sidebar navigation
// ============================================================================
import React, { useEffect } from 'react';
import { useAppStore } from './store/appStore';
import { Sidebar } from './components/layout/Sidebar';
import { SearchPage } from './components/search/SearchPage';
import { StatePage } from './components/map/StatePage';
import { UpdatePage } from './components/layout/UpdatePage';
import { AnalyticsPage } from './components/analytics/AnalyticsPage';
import { QueryPage } from './components/query/QueryPage';
import { SettingsPage } from './components/settings/SettingsPage';
import { Notifications } from './components/common/Notifications';

export function App() {
  const currentPage = useAppStore((s) => s.currentPage);
  const setStats = useAppStore((s) => s.setStats);

  useEffect(() => {
    // Load dashboard stats on mount
    window.electronAPI?.getDbStatus?.().then((stats: unknown) => {
      setStats(stats as typeof useAppStore extends (...a: unknown[]) => infer R ? R extends { stats: infer S } ? S : never : never);
    }).catch(() => {});
  }, [setStats]);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflow: 'auto',
        background: 'var(--color-bg)',
        padding: 'var(--space-8)',
        paddingTop: 'calc(var(--header-height) + var(--space-6))',
      }}>
        <div className="titlebar-drag" style={{
          position: 'fixed', top: 0, left: 'var(--sidebar-width)',
          right: 0, height: 'var(--header-height)',
          zIndex: 50,
        }} />
        <div className="animate-fade-in">
          {currentPage === 'search' && <SearchPage />}
          {currentPage === 'state' && <StatePage />}
          {currentPage === 'update' && <UpdatePage />}
          {currentPage === 'analytics' && <AnalyticsPage />}
          {currentPage === 'query' && <QueryPage />}
          {currentPage === 'settings' && <SettingsPage />}
        </div>
      </main>
      <Notifications />
    </div>
  );
}
