'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Phone } from 'lucide-react';
import { apiClient, getOrCreatePublicDeviceToken } from '@/lib/api-client';
import { useTenant } from '@/lib/tenant-context';
import { formatBulgarianPhoneForDisplay, normalizeBulgarianPhone } from '@/lib/phone';

type UpcomingLookupResult = {
  phone: string;
  appointments: Array<{
    id: string;
    startAt: string;
    endAt: string;
    status: string;
    serviceName: string;
    staffName: string;
  }>;
};

export function ClientUpcomingLookup() {
  const tenant = useTenant();
  const [phone, setPhone] = useState('');
  const [recentPhones, setRecentPhones] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UpcomingLookupResult | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(`saloniq_recent_phones_${tenant.slug}`) || '[]');
      if (Array.isArray(stored)) {
        setRecentPhones(stored.filter((item): item is string => typeof item === 'string'));
      }
    } catch {
      setRecentPhones([]);
    }
  }, [tenant.slug]);

  const lookupUpcoming = async (sourcePhone?: string) => {
    const normalizedPhone = normalizeBulgarianPhone(sourcePhone || phone || recentPhones[0] || '');
    if (!normalizedPhone) return;

    try {
      setLoading(true);
      const next = await apiClient.get<UpcomingLookupResult>('/tenants/client-upcoming', {
        phone: normalizedPhone,
        deviceToken: getOrCreatePublicDeviceToken(tenant.slug),
      });
      setResult(next);
      setPhone(formatBulgarianPhoneForDisplay(normalizedPhone));
    } catch {
      setResult({ phone: normalizedPhone, appointments: [] });
      setPhone(formatBulgarianPhoneForDisplay(normalizedPhone));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--line-soft)',
        borderRadius: 28,
        padding: 22,
        boxShadow: 'var(--shadow-soft)',
        backdropFilter: 'blur(24px) saturate(140%)',
        WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: 0,
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--text-strong)',
              letterSpacing: '-0.03em',
            }}
          >
            <CalendarClock size={18} style={{ color: 'var(--color-primary)' }} />
            Провери предстоящите си часове
          </h3>
          <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--text-soft)', lineHeight: 1.55 }}>
            Проверяваме само записи от това устройство и този телефонен номер.
          </p>
        </div>
        {recentPhones[0] && (
          <button
            type="button"
            onClick={() => void lookupUpcoming(recentPhones[0])}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
            style={{ border: '1px solid var(--line-soft)', background: 'var(--surface-pill)', color: 'var(--text-strong)' }}
          >
            Последен номер
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 0 }}>
          <Phone size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0899 123 456"
            autoComplete="tel"
            style={{
              width: '100%',
              padding: '12px 14px 12px 40px',
              borderRadius: 16,
              border: '1px solid var(--line-soft)',
              background: 'var(--surface-pill)',
              outline: 'none',
              fontSize: 14,
              color: 'var(--text-strong)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void lookupUpcoming()}
          disabled={loading}
          className="rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          style={{
            background: 'var(--color-primary)',
            boxShadow: '0 12px 28px color-mix(in srgb, var(--color-primary) 28%, transparent)',
          }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Провери'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-soft)' }}>
            Номер: {formatBulgarianPhoneForDisplay(result.phone)}
          </p>
          {result.appointments.length ? (
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {result.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  style={{
                    border: '1px solid var(--line-soft)',
                    background: 'var(--surface-pill)',
                    borderRadius: 18,
                    padding: 14,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-strong)' }}>
                    {new Date(appointment.startAt).toLocaleString('bg-BG', {
                      day: 'numeric',
                      month: 'long',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-soft)' }}>
                    {appointment.serviceName} · {appointment.staffName}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--text-soft)' }}>
              Няма намерени предстоящи часове за този номер на това устройство.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
