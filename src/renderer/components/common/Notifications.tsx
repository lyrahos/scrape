// ============================================================================
// Notifications — Toast-style notifications
// ============================================================================
import React, { useEffect } from 'react';
import { useAppStore } from '../../store/appStore';

export function Notifications() {
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);

  return (
    <div style={{
      position: 'fixed',
      bottom: 'var(--space-6)',
      right: 'var(--space-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-2)',
      zIndex: 1000,
      pointerEvents: 'none',
    }}>
      {notifications.map((n) => (
        <Toast key={n.id} id={n.id} type={n.type} message={n.message} onDismiss={removeNotification} />
      ))}
    </div>
  );
}

function Toast({ id, type, message, onDismiss }: {
  id: string; type: string; message: string; onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), 5000);
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const bgColor = type === 'success' ? '#ECFDF5' : type === 'error' ? '#FEF2F2' : '#EFF6FF';
  const textColor = type === 'success' ? '#065F46' : type === 'error' ? '#991B1B' : '#1E40AF';
  const borderColor = type === 'success' ? '#A7F3D0' : type === 'error' ? '#FECACA' : '#BFDBFE';

  return (
    <div
      className="animate-slide-in"
      style={{
        background: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3) var(--space-5)',
        fontSize: 'var(--font-size-sm)',
        maxWidth: 400,
        pointerEvents: 'auto',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        cursor: 'pointer',
      }}
      onClick={() => onDismiss(id)}
    >
      {message}
    </div>
  );
}
