// ============================================================================
// Button Component — Clean, accessible button
// ============================================================================
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  style?: React.CSSProperties;
}

export function Button({
  children, onClick, variant = 'primary', size = 'md',
  loading = false, disabled = false, style,
}: ButtonProps) {
  const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    fontFamily: 'var(--font-family)',
    fontWeight: 500,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    transition: 'all var(--transition-fast)',
    opacity: disabled ? 0.5 : 1,
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--font-size-xs)' },
    md: { padding: 'var(--space-2) var(--space-5)', fontSize: 'var(--font-size-sm)' },
    lg: { padding: 'var(--space-3) var(--space-6)', fontSize: 'var(--font-size-base)' },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      background: 'var(--color-accent)',
      color: 'var(--color-text-inverse)',
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
    },
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{ ...baseStyles, ...sizeStyles[size], ...variantStyles[variant], ...style }}
    >
      {loading && (
        <span style={{
          width: 14, height: 14, border: '2px solid currentColor',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.6s linear infinite',
        }} />
      )}
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </button>
  );
}
