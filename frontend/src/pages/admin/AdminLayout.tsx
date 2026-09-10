import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Users, Monitor, AlertTriangle,
  FileText, Settings, Shield, LogOut, UserX, ChevronLeft, ChevronRight
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggle } from '../../components/ui/ThemeToggle';

const navItems = [
  { path: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/admin/exams', icon: BookOpen, label: 'Examinations' },
  { path: '/admin/students', icon: Users, label: 'Students' },
  { path: '/admin/sessions', icon: Monitor, label: 'Active Sessions' },
  { path: '/admin/violations', icon: AlertTriangle, label: 'Violations' },
  { path: '/admin/disqualifications', icon: UserX, label: 'Disqualifications' },
  { path: '/admin/reports', icon: FileText, label: 'Reports' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
];

export const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-16' : 'w-60'} flex flex-col transition-all duration-200 flex-shrink-0`}
        style={{ background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div
          className={`flex items-center gap-3 p-4 ${collapsed ? 'justify-center' : ''}`}
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--primary-bg)', border: '1px solid var(--primary-border)' }}
          >
            <Shield className="w-5 h-5" style={{ color: 'var(--primary-text)' }} />
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--foreground)' }}>AI Proctoring</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>Admin Panel</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const active = location.pathname === path || location.pathname.startsWith(path + '/');
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm ${collapsed ? 'justify-center' : ''}`}
                style={active
                  ? { background: 'var(--primary-bg)', color: 'var(--primary-text)', border: '1px solid var(--primary-border)' }
                  : { color: 'var(--muted)', border: '1px solid transparent' }
                }
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--foreground)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--muted)'; }}
                title={collapsed ? label : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User info + theme toggle + collapse */}
        <div className="p-3 space-y-1" style={{ borderTop: '1px solid var(--border)' }}>
          {!collapsed && (
            <div className="px-2 py-2">
              <div className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{user?.full_name}</div>
              <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{user?.email}</div>
            </div>
          )}

          {/* Theme toggle */}
          <div className={`flex ${collapsed ? 'justify-center' : 'px-1'} py-1`}>
            <ThemeToggle size="sm" />
            {!collapsed && (
              <span className="ml-2 text-xs self-center" style={{ color: 'var(--muted)' }}>Toggle theme</span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${collapsed ? 'justify-center' : ''}`}
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--danger-text)';
              (e.currentTarget as HTMLElement).style.background = 'var(--danger-bg)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.color = 'var(--muted)';
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            <LogOut className="w-4 h-4" />
            {!collapsed && 'Sign Out'}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--foreground)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = 'var(--muted)')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto" style={{ background: 'var(--bg)' }}>
        {children}
      </main>
    </div>
  );
};
