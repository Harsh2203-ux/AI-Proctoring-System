import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useThemeStore } from '../../store/themeStore';

interface ThemeToggleProps {
  /** Size variant — 'sm' for sidebar, 'md' for standalone pages */
  size?: 'sm' | 'md';
  /** Extra classes for positioning */
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ size = 'md', className = '' }) => {
  const { theme, toggle } = useThemeStore();
  const isDark = theme === 'dark';

  const base =
    'inline-flex items-center justify-center rounded-lg border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1';

  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-9 h-9',
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`${base} ${sizes[size]} ${className}`}
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        color: 'var(--muted)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--foreground)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
};
