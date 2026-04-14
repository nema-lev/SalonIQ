'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { Bell, Menu } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Календар',
  '/admin/clients': 'Клиенти',
  '/admin/staff': 'Персонал',
  '/admin/services': 'Услуги & Цени',
  '/admin/stats': 'Статистики',
  '/admin/settings': 'Настройки',
};

export function AdminHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);
  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    key === pathname || (key !== '/admin' && pathname.startsWith(key))
  )?.[1] ?? 'Admin';

  const today = format(new Date(), "EEEE, d MMMM yyyy 'г.'", { locale: bg });
  const { data: upcoming } = useQuery({
    queryKey: ['admin-header-upcoming'],
    queryFn: () =>
      apiClient.get<Array<{ status: string; owner_alert_state?: string }>>('/appointments/upcoming', {
        limit: '30',
        mode: 'attention',
      }),
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });
  const pendingCount = upcoming?.length ?? 0;
  const inboxActionCount = useMemo(
    () => (upcoming ?? []).filter((item) => item.status === 'pending').length,
    [upcoming],
  );
  const inboxUpdateCount = useMemo(
    () => (upcoming ?? []).filter((item) => Boolean(item.owner_alert_state)).length,
    [upcoming],
  );

  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!bellRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between"
      style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'nowrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          type="button"
          onClick={onOpenMenu}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            border: '1px solid #e5e7eb',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Menu className="w-4 h-4 text-gray-600" />
        </button>
        <div style={{ minWidth: 0 }}>
        <h1 className="text-xl font-bold text-gray-900" style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1.05 }}>{title}</h1>
        <p className="text-sm text-gray-400 capitalize" style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>{today}</p>
        </div>
      </div>

      <div ref={bellRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setNotificationsOpen((current) => !current)}
          aria-label={pendingCount > 0 ? `${pendingCount} заявки и отговори искат внимание` : 'Няма нови заявки'}
          style={{
            width: 42,
            height: 42,
            borderRadius: 14,
            border: '1px solid #e5e7eb',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <Bell className="w-4 h-4 text-gray-600" />
          {pendingCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 18,
                height: 18,
                borderRadius: 999,
                background: 'var(--color-primary)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
                boxShadow: '0 6px 18px rgba(124,58,237,0.22)',
              }}
            >
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>

        {notificationsOpen && (
          <div
            style={{
              position: 'absolute',
              top: 52,
              right: 0,
              width: 'min(92vw, 320px)',
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: 18,
              boxShadow: '0 22px 60px rgba(15,23,42,0.14)',
              padding: 12,
              zIndex: 80,
            }}
          >
            <div style={{ padding: '4px 6px 10px' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#111827' }}>Известия</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                {pendingCount > 0 ? `${pendingCount} елемента искат внимание` : 'Няма нови известия'}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  router.push('/admin');
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #ede9fe',
                  background: inboxActionCount > 0 ? 'rgba(124,58,237,0.06)' : '#f9fafb',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  {inboxActionCount > 0 ? `${inboxActionCount} заявки искат решение` : 'Няма чакащи решения'}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Отваря календара с чакащите решения за деня.
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNotificationsOpen(false);
                  router.push('/admin');
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #e5e7eb',
                  background: inboxUpdateCount > 0 ? 'rgba(14,165,233,0.06)' : '#f9fafb',
                  borderRadius: 14,
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                  {inboxUpdateCount > 0 ? `${inboxUpdateCount} нови обновления` : 'Няма нови обновления'}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                  Клиентски действия и промени по записите.
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
