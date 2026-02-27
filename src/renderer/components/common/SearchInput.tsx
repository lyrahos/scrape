// ============================================================================
// Search Input — Clean search bar with subtle styling
// ============================================================================
import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', onSubmit, autoFocus }: SearchInputProps) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 600,
    }}>
      <span style={{
        position: 'absolute', left: 'var(--space-4)', top: '50%', transform: 'translateY(-50%)',
        color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-md)', pointerEvents: 'none',
      }}>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{
          width: '100%',
          padding: 'var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 28px)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface)',
          fontSize: 'var(--font-size-md)',
          fontFamily: 'var(--font-family)',
          color: 'var(--color-text-primary)',
          outline: 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)';
          e.currentTarget.style.boxShadow = '0 0 0 3px var(--color-accent-light)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
    </div>
  );
}
