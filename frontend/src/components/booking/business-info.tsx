'use client';

import { Clock, MapPin, ExternalLink } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { ClientUpcomingLookup } from './client-upcoming-lookup';

const DAY_NAMES: Record<string, string> = {
  mon: 'Понеделник',
  tue: 'Вторник',
  wed: 'Сряда',
  thu: 'Четвъртък',
  fri: 'Петък',
  sat: 'Събота',
  sun: 'Неделя',
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function BusinessInfo() {
  const tenant = useTenant();
  const { workingHours, address, city, googleMapsUrl } = tenant;

  const hasWorkingHours = Object.keys(workingHours).length > 0;

  if (!hasWorkingHours && !address) return null;

  // Намери днешния ден
  const todayKey = DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const todaySchedule = workingHours[todayKey];

  return (
    <div className="mt-10 space-y-4" style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div
        className="h-px bg-gray-100"
        style={{
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, var(--surface-accent-soft) 20%, var(--surface-secondary-soft) 80%, transparent 100%)',
        }}
      />

      {hasWorkingHours && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 28, padding: 22, boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)' }}>
          <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-4" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 16px', fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', letterSpacing: '-0.03em' }}>
            <Clock className="w-4 h-4 text-[var(--color-primary)]" />
            Работно време
          </h3>

          {todaySchedule && (
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[var(--color-primary)]/5" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: 14, borderRadius: 16, background: 'linear-gradient(90deg, var(--surface-accent-soft), var(--surface-secondary-soft))', border: '1px solid var(--line-soft)' }}>
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  todaySchedule.isOpen ? 'bg-green-500' : 'bg-red-400'
                }`}
              />
              <span className="text-sm font-semibold text-gray-700" style={{ color: 'var(--text-soft)' }}>Днес:</span>
              <span className="text-sm text-gray-600" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                {todaySchedule.isOpen
                  ? `${todaySchedule.open} – ${todaySchedule.close}`
                  : 'Затворено'}
              </span>
            </div>
          )}

          <div className="space-y-1.5" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DAY_ORDER.map((day) => {
              const schedule = workingHours[day];
              if (!schedule) return null;
              const isToday = day === todayKey;

              return (
                <div
                  key={day}
                  className={`flex justify-between items-center text-sm py-1 ${
                    isToday ? 'font-semibold text-[var(--color-primary)]' : 'text-gray-600'
                  }`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 15, padding: '6px 0', color: isToday ? 'var(--text-strong)' : 'var(--text-soft)', fontWeight: isToday ? 800 : 500, borderBottom: '1px solid color-mix(in srgb, var(--line-soft) 70%, transparent)' }}
                >
                  <span>{DAY_NAMES[day]}</span>
                  <span style={{ color: schedule.isOpen ? 'inherit' : 'var(--text-soft)' }}>
                    {schedule.isOpen
                      ? `${schedule.open} – ${schedule.close}`
                      : 'Почивен'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {address && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--line-soft)', borderRadius: 28, padding: 22, boxShadow: 'var(--shadow-soft)', backdropFilter: 'blur(24px) saturate(140%)', WebkitBackdropFilter: 'blur(24px) saturate(140%)' }}>
          <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-3" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 12px', fontSize: 22, fontWeight: 900, color: 'var(--text-strong)', letterSpacing: '-0.03em' }}>
            <MapPin className="w-4 h-4 text-[var(--color-primary)]" />
            Адрес
          </h3>
          <p className="text-gray-600 text-sm" style={{ margin: 0, fontSize: 16, color: 'var(--text-soft)', lineHeight: 1.6 }}>
            {[address, city].filter(Boolean).join(', ')}
          </p>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center gap-1.5 mt-3 text-sm font-semibold
                text-[var(--color-primary)] hover:underline
              "
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
                padding: '10px 14px',
                borderRadius: 999,
                background: 'var(--surface-accent-soft)',
                border: '1px solid var(--line-soft)',
                textDecoration: 'none',
                fontWeight: 700,
                color: 'var(--text-strong)',
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Виж в Google Maps
            </a>
          )}
        </div>
      )}

      <ClientUpcomingLookup />

      <p className="text-center text-xs pb-4" style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-soft)', paddingBottom: 16, margin: 0, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {tenant.theme.poweredByText || 'Powered by SalonIQ'}
      </p>
    </div>
  );
}
