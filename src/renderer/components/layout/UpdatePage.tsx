// ============================================================================
// Update Page — Discover hospitals, run updates, view logs
// ============================================================================
import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { Card } from '../common/Card';
import { Button } from '../common/Button';

export function UpdatePage() {
  const { isUpdating, setIsUpdating, updateProgress, setUpdateProgress, addNotification, setStats } = useAppStore();
  const [updateLog, setUpdateLog] = useState<unknown[]>([]);
  const [discoverCount, setDiscoverCount] = useState<number | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    loadUpdateLog();
    window.electronAPI?.onUpdateStatus?.((status: unknown) => {
      const s = status as { current: number; total: number; message: string };
      setUpdateProgress(s);
    });
  }, [setUpdateProgress]);

  async function loadUpdateLog() {
    try {
      const log = await window.electronAPI?.getUpdateLog?.(50);
      if (log) setUpdateLog(log);
    } catch { /* ignore */ }
  }

  async function handleDiscover() {
    setIsDiscovering(true);
    try {
      const result = await window.electronAPI?.discoverHospitals?.();
      setDiscoverCount(result?.count ?? 0);
      addNotification('success', `Discovered ${result?.count ?? 0} hospitals from CMS`);
      // Refresh stats
      const stats = await window.electronAPI?.getDbStatus?.();
      if (stats) setStats(stats as Parameters<typeof setStats>[0]);
    } catch (err) {
      addNotification('error', `Discovery failed: ${err}`);
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleUpdate() {
    setIsUpdating(true);
    setUpdateProgress({ current: 0, total: 0, message: 'Starting update...' });
    try {
      const result = await window.electronAPI?.runUpdate?.();
      const r = result as { updated: number; errors: number; skipped: number };
      addNotification('success', `Update complete. Updated: ${r.updated}, Errors: ${r.errors}, Skipped: ${r.skipped}`);
      await loadUpdateLog();
      const stats = await window.electronAPI?.getDbStatus?.();
      if (stats) setStats(stats as Parameters<typeof setStats>[0]);
    } catch (err) {
      addNotification('error', `Update failed: ${err}`);
    } finally {
      setIsUpdating(false);
      setUpdateProgress(null);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Update Hospitals
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)', fontSize: 'var(--font-size-md)' }}>
        Discover new hospitals and update pricing data from transparency files.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
        <Card>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              Discover Hospitals
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Download the latest CMS hospital dataset and add new hospitals to your database.
            </p>
          </div>
          <Button onClick={handleDiscover} loading={isDiscovering} variant="secondary">
            {isDiscovering ? 'Discovering...' : 'Discover from CMS'}
          </Button>
          {discoverCount !== null && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--color-success)' }}>
              Found {discoverCount.toLocaleString()} hospitals
            </p>
          )}
        </Card>

        <Card>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
              Update Pricing Data
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
              Check hospitals not updated in 30 days, download new transparency files, and process changes.
            </p>
          </div>
          <Button onClick={handleUpdate} loading={isUpdating}>
            {isUpdating ? 'Updating...' : 'Update Hospitals'}
          </Button>
          {updateProgress && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <div style={{
                height: 4, borderRadius: 2, background: 'var(--color-border)',
                overflow: 'hidden', marginBottom: 'var(--space-2)',
              }}>
                <div style={{
                  height: '100%', borderRadius: 2, background: 'var(--color-accent)',
                  width: updateProgress.total > 0
                    ? `${(updateProgress.current / updateProgress.total) * 100}%`
                    : '0%',
                  transition: 'width var(--transition-base)',
                }} />
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                {updateProgress.message}
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Update Log */}
      <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>
        Recent Activity
      </h3>
      {updateLog.length === 0 ? (
        <Card>
          <p style={{ color: 'var(--color-text-tertiary)', textAlign: 'center', padding: 'var(--space-8)' }}>
            No update history yet. Start by discovering hospitals.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {(updateLog as { log_id: string; hospital_id: string; result: string; rows_added: number; rows_changed: number; update_attempted_at: string; error_message?: string }[])
            .slice(0, 20)
            .map((entry) => (
              <Card key={entry.log_id} style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: entry.result === 'success' ? 'var(--color-success)'
                        : entry.result === 'error' ? 'var(--color-error)'
                        : 'var(--color-text-tertiary)',
                    }} />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{entry.hospital_id.slice(0, 8)}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      +{entry.rows_added} / ~{entry.rows_changed}
                    </span>
                  </div>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    {new Date(entry.update_attempted_at).toLocaleDateString()}
                  </span>
                </div>
                {entry.error_message && (
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-error)', marginTop: 'var(--space-1)' }}>
                    {entry.error_message}
                  </p>
                )}
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
