'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays, Users, Scissors, BarChart3,
  Settings, LogOut, ChevronRight,
} from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';

const NAV_ITEMS = [
  { href: '/admin', label: 'Календар', icon: CalendarDays, exact: true },
  { href: '/admin/clients', label: 'Клиенти', icon: Users },
  { href: '/admin/services', label: 'Услуги', icon: Scissors },
  { href: '/admin/stats', label: 'Статистики', icon: BarChart3 },
  { href: '/admin/settings', label: 'Настройки', icon: Settings },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const tenant = useTenant();

  const handleLogout = () => {
    localStorage.removeItem('saloniq_token');
    window.location.href = '/admin/login';
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-100 flex flex-col min-h-screen">
      {/* Logo area */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm"
            style={{ backgroundColor: tenant.theme.primaryColor }}
          >
            {tenant.businessName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{tenant.businessName}</p>
            <p className="text-xs text-gray-400">Admin панел</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-[var(--color-primary)] text-white shadow-md shadow-[var(--color-primary)]/25'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
              style={isActive ? { backgroundColor: tenant.theme.primaryColor } : {}}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70" />}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="
            w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
            text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-150
          "
        >
          <LogOut className="w-4 h-4" />
          Изход
        </button>
      </div>
    </aside>
  );
}
