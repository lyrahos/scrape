// ============================================================================
// Card Component — Apple-style rounded card with soft shadow
// ============================================================================
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, style, hover = false, onClick }: CardProps) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-6)',
        border: '1px solid var(--color-border-light)',
        boxShadow: isHovered
          ? '0 4px 24px var(--color-card-shadow-hover)'
          : '0 1px 3px var(--color-card-shadow)',
        transition: 'all var(--transition-base)',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
