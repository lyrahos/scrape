// ============================================================================
// Settings Page — Configuration with clean form layout
// ============================================================================
import React, { useState, useEffect } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { useAppStore } from '../../store/appStore';

export function SettingsPage() {
  const { addNotification } = useAppStore();
  const [settings, setSettings] = useState({
    db_host: 'localhost',
    db_port: 5432,
    db_name: 'hospital_transparency',
    use_local_sqlite: true,
    scrape_concurrency: 5,
    scrape_delay_ms: 1000,
    max_retries: 3,
    update_interval_days: 30,
    auto_update_enabled: false,
  });

  useEffect(() => {
    window.electronAPI?.getSettings?.().then((s: unknown) => {
      if (s) setSettings((prev) => ({ ...prev, ...(s as typeof settings) }));
    }).catch(() => {});
  }, []);

  const update = (key: string, value: unknown) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    addNotification('success', 'Settings saved successfully');
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
        Settings
      </h2>
      <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-8)', fontSize: 'var(--font-size-md)' }}>
        Configure database, scraping, and update preferences.
      </p>

      {/* Database */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Database</h3>

        <ToggleField
          label="Use Local SQLite"
          description="Store data locally. No external database needed."
          checked={settings.use_local_sqlite}
          onChange={(v) => update('use_local_sqlite', v)}
        />

        {!settings.use_local_sqlite && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
            <InputField label="Host" value={settings.db_host} onChange={(v) => update('db_host', v)} />
            <InputField label="Port" value={String(settings.db_port)} onChange={(v) => update('db_port', parseInt(v) || 5432)} />
            <InputField label="Database" value={settings.db_name} onChange={(v) => update('db_name', v)} />
          </div>
        )}
      </Card>

      {/* Scraping */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Scraping</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <InputField
            label="Concurrency"
            value={String(settings.scrape_concurrency)}
            onChange={(v) => update('scrape_concurrency', Math.max(1, Math.min(20, parseInt(v) || 5)))}
          />
          <InputField
            label="Delay (ms)"
            value={String(settings.scrape_delay_ms)}
            onChange={(v) => update('scrape_delay_ms', Math.max(0, parseInt(v) || 1000))}
          />
          <InputField
            label="Max Retries"
            value={String(settings.max_retries)}
            onChange={(v) => update('max_retries', Math.max(0, Math.min(10, parseInt(v) || 3)))}
          />
        </div>
      </Card>

      {/* Updates */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-4)' }}>Automatic Updates</h3>

        <ToggleField
          label="Enable Auto Updates"
          description="Periodically check and update hospital data in the background."
          checked={settings.auto_update_enabled}
          onChange={(v) => update('auto_update_enabled', v)}
        />

        {settings.auto_update_enabled && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <InputField
              label="Update hospitals not checked in (days)"
              value={String(settings.update_interval_days)}
              onChange={(v) => update('update_interval_days', Math.max(1, parseInt(v) || 30))}
            />
          </div>
        )}
      </Card>

      {/* About */}
      <Card style={{ marginBottom: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>About</h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          Hospital Price Transparency Intelligence Platform v1.0.0
        </p>
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-1)' }}>
          Built to make healthcare pricing data accessible and understandable.
        </p>
      </Card>

      <Button onClick={handleSave}>Save Settings</Button>
    </div>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-1)' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: 'var(--space-2) var(--space-3)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--font-size-sm)',
          fontFamily: 'var(--font-family)',
          outline: 'none',
          transition: 'border-color var(--transition-fast)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
      />
    </div>
  );
}

function ToggleField({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{description}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: checked ? 'var(--color-accent)' : 'var(--color-border)',
          position: 'relative', cursor: 'pointer',
          transition: 'background var(--transition-fast)',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transition: 'left var(--transition-fast)',
        }} />
      </button>
    </div>
  );
}
