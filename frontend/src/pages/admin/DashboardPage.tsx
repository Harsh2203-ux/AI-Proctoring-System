import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BookOpen, Users, Monitor, AlertTriangle, UserX, FileText, TrendingUp, Activity } from 'lucide-react';
import api from '../../lib/api';
import { AdminLayout } from './AdminLayout';
import { Badge } from '../../components/ui/Badge';

export const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, chartRes] = await Promise.all([
          api.get('/api/admin/dashboard/stats'),
          api.get('/api/admin/dashboard/violations-chart?days=7'),
        ]);
        setStats(statsRes.data);
        setChartData(chartRes.data);
      } catch (e: any) {
        console.error('[DashboardPage] load error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  const statCards = [
    { label: 'Active Exams', value: stats.active_exams, icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-900/20 border-blue-700/30', path: '/admin/exams' },
    { label: 'Total Students', value: stats.total_students, icon: Users, color: 'text-purple-400', bg: 'bg-purple-900/20 border-purple-700/30', path: '/admin/students' },
    { label: 'Active Sessions', value: stats.active_sessions, icon: Monitor, color: 'text-green-400', bg: 'bg-green-900/20 border-green-700/30', path: '/admin/sessions' },
    { label: "Violations Today", value: stats.violations_today, icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-900/20 border-amber-700/30', path: '/admin/violations' },
    { label: 'Disqualifications', value: stats.disqualifications_today, icon: UserX, color: 'text-red-400', bg: 'bg-red-900/20 border-red-700/30', path: '/admin/disqualifications' },
    { label: 'Pending Reviews', value: stats.pending_reviews, icon: FileText, color: 'text-orange-400', bg: 'bg-orange-900/20 border-orange-700/30', path: '/admin/violations' },
  ];

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>Dashboard</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>AI Proctoring System Overview</p>
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <Activity className="w-3.5 h-3.5 text-green-400" />
            Auto-refreshes every 30s
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {statCards.map((card) => (
            <div
              key={card.label}
              onClick={() => navigate(card.path)}
              className={`border rounded-xl p-5 cursor-pointer hover:scale-[1.01] transition-transform ${card.bg}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm" style={{ color: 'var(--muted)' }}>{card.label}</div>
                  <div className={`text-3xl font-bold mt-1 ${card.color}`}>
                    {loading ? '—' : (card.value ?? 0)}
                  </div>
                </div>
                <card.icon className={`w-10 h-10 ${card.color} opacity-60`} />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Violations chart */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-5">
            <h2 className="font-semibold mb-4 flex items-center gap-2" style={{ color: 'var(--foreground)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: 'var(--primary-text)' }} />
              Violations (Last 7 Days)
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <XAxis dataKey="date" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--muted)' }}
                  itemStyle={{ color: 'var(--primary-text)' }}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick stats */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-5">
            <h2 className="font-semibold mb-4" style={{ color: 'var(--foreground)' }}>System Summary</h2>
            <div className="space-y-3">
              {[
                { label: 'Total Examinations', value: stats.total_exams ?? 0 },
                { label: 'Total Violations', value: stats.total_violations ?? 0 },
                { label: 'Total Reports', value: stats.total_reports ?? 0 },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-dark-border">
                  <span className="text-sm" style={{ color: 'var(--muted)' }}>{item.label}</span>
                  <span className="font-semibold" style={{ color: 'var(--foreground)' }}>{item.value}</span>
                </div>
              ))}
              <div className="pt-2 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--warning-text)' }} />
                <span className="text-xs" style={{ color: 'var(--warning-text)' }}>DEMO MODE — AI results are simulated</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};
