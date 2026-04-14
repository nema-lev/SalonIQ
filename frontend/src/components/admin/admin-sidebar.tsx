'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  Users,
  User,
  Scissors,
  BarChart3,
  Settings,
  LogOut,
  ChevronRight,
  X,
} from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';

const NAV_ITEMS = [
  { href: '/admin', label: 'Календар', icon: CalendarDays, exact: true },
  { href: '/admin/clients', label: 'Клиенти', icon: Users },
  { href: '/admin/staff', label: 'Персонал', icon: User },
  { href: '/admin/services', label: 'Услуги', icon: Scissors },
  { href: '/admin/stats', label: 'Статистики', icon: BarChart3 },
  { href: '/admin/settings', label: 'Настройки', icon: Settings },
];

interface AdminSidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

function SidebarBody({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const tenant = useTenant();

  const handleLogout = () => {
    localStorage.removeItem('saloniq_token');
    localStorage.removeItem('saloniq_tenant_slug');
    window.location.href = '/admin/login';
  };

  return (
    <>
      <div
        className="border-b border-gray-100"
        style={{ padding: 20, borderBottom: '1px solid #e5e7eb' }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 14,
                backgroundColor: tenant.theme.primaryColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {tenant.businessName.charAt(0)}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>
                {tenant.businessName}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>Admin панел</p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                border: '1px solid #e5e7eb',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <nav style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 14,
                fontSize: 14,
                fontWeight: 600,
                color: isActive ? '#fff' : '#374151',
                backgroundColor: isActive ? tenant.theme.primaryColor : 'transparent',
                textDecoration: 'none',
                marginBottom: 6,
              }}
            >
              <Icon className="w-4 h-4" />
              <span style={{ flex: 1 }}>{label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: 16, borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid #e5e7eb',
            background: '#fff',
            color: '#4b5563',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <LogOut className="w-4 h-4" />
          Изход
        </button>
      </div>
    </>
  );
}

export function AdminSidebar({ mobileOpen = false, onClose }: AdminSidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
          }}
        >
          <aside
            style={{
              width: 'min(86vw, 320px)',
              background: '#fff',
              borderRight: '1px solid #e5e7eb',
              display: 'flex',
              flexDirection: 'column',
              height: '100dvh',
              boxShadow: '12px 0 42px rgba(15, 23, 42, 0.18)',
            }}
          >
            <SidebarBody onClose={onClose} />
          </aside>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори менюто"
            style={{
              flex: 1,
              border: 'none',
              background: 'rgba(15, 23, 42, 0.45)',
              cursor: 'pointer',
            }}
          />
        </div>
      )}
    </>
  );
}
