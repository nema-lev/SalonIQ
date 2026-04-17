'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { TrendingUp, Users, Calendar, AlertTriangle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Stats {
  period: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  noShowCount: number;
  noShowRate: number;
  totalRevenue: number;
  newClients: number;
  returningClients: number;
  topServices: { name: string; count: number; revenue: number }[];
  topStaff: { name: string; count: number; revenue: number }[];
  busyHours: { hour: number; count: number }[];
}

const PERIODS = [
  { value: 'today', label: 'Днес' },
  { value: 'week', label: 'Тази седмица' },
  { value: 'month', label: 'Този месец' },
  { value: 'year', label: 'Тази година' },
];

function StatCard({ title, value, sub, icon, color = 'primary' }: {
  title: string; value: string | number; sub?: string;
  icon: React.ReactNode; color?: 'primary' | 'green' | 'red' | 'amber';
}) {
  const colors = {
    primary: 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
    green: 'bg-green-100 text-green-600',
    red: 'bg-red-100 text-red-600',
    amber: 'bg-amber-100 text-amber-600',
  };
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colors[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-sm font-medium text-gray-600 mt-0.5">{title}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function StatsPage() {
  const [period, setPeriod] = useState('month');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', period],
    queryFn: () => apiClient.get<Stats>('/stats', { period }),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      {/* Period selector */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all
              ${period === value ? 'bg-white text-[var(--color-primary)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : stats ? (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Резервации"
              value={stats.totalAppointments}
              sub={`${stats.completedAppointments} завършени`}
              icon={<Calendar className="w-5 h-5" />}
            />
            <StatCard
              title="Приход"
              value={`${stats.totalRevenue} €`}
              icon={<TrendingUp className="w-5 h-5" />}
              color="green"
            />
            <StatCard
              title="Клиенти"
              value={stats.newClients + stats.returningClients}
              sub={`${stats.newClients} нови`}
              icon={<Users className="w-5 h-5" />}
              color="primary"
            />
            <StatCard
              title="No-show"
              value={`${stats.noShowRate.toFixed(1)}%`}
              sub={`${stats.noShowCount} случая`}
              icon={<AlertTriangle className="w-5 h-5" />}
              color={stats.noShowRate > 15 ? 'red' : 'amber'}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top services */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">Топ услуги</h3>
              <div className="space-y-3">
                {stats.topServices.slice(0, 5).map((svc, i) => {
                  const maxCount = stats.topServices[0]?.count || 1;
                  return (
                    <div key={svc.name}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-gray-800">
                          <span className="text-gray-400 mr-1.5">#{i + 1}</span>
                          {svc.name}
                        </span>
                        <span className="text-gray-500">{svc.count} пъти · {svc.revenue} €</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--color-primary)] transition-all"
                          style={{ width: `${(svc.count / maxCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {stats.topServices.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Няма данни</p>
                )}
              </div>
            </div>

            {/* Busy hours heatmap */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">Натоварени часове</h3>
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  const hourData = stats.busyHours.find((b) => b.hour === h);
                  const count = hourData?.count ?? 0;
                  const maxBusy = Math.max(...stats.busyHours.map((b) => b.count), 1);
                  const intensity = count / maxBusy;
                  return (
                    <div key={h} className="flex flex-col items-center gap-1">
                      <div
                        className="w-full aspect-square rounded-md transition-colors"
                        style={{
                          backgroundColor: count > 0
                            ? `color-mix(in srgb, var(--color-primary) ${Math.round(intensity * 80 + 20)}%, transparent)`
                            : '#f3f4f6',
                        }}
                        title={`${h}:00 — ${count} резервации`}
                      />
                      {h % 4 === 0 && (
                        <span className="text-[10px] text-gray-400">{h}h</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-gray-400">По-малко</span>
                <div className="flex gap-1">
                  {[20, 40, 60, 80, 100].map((p) => (
                    <div
                      key={p}
                      className="w-4 h-4 rounded-sm"
                      style={{
                        backgroundColor: `color-mix(in srgb, var(--color-primary) ${p}%, transparent)`,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-gray-400">Повече</span>
              </div>
            </div>
          </div>

          {/* Staff performance */}
          {stats.topStaff.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="font-bold text-gray-900 mb-4">Персонал</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.topStaff.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                    <div className="w-8 h-8 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {s.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.count} часа · {s.revenue} €</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Completion rates */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 mb-4">Разпределение на резервациите</h3>
            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'Завършени', count: stats.completedAppointments, color: '#22c55e' },
                { label: 'Отменени', count: stats.cancelledAppointments, color: '#ef4444' },
                { label: 'No-show', count: stats.noShowCount, color: '#f59e0b' },
              ].map(({ label, count, color }) => {
                const pct = stats.totalAppointments > 0
                  ? ((count / stats.totalAppointments) * 100).toFixed(1)
                  : '0';
                return (
                  <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-sm text-gray-700 font-medium">{label}</span>
                    <span className="text-sm font-bold text-gray-900">{count}</span>
                    <span className="text-xs text-gray-400">({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-20 text-gray-400">Няма данни за избрания период</div>
      )}
    </div>
  );
}
