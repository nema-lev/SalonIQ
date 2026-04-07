'use client';

import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { Bell, Plus } from 'lucide-react';
import { usePathname } from 'next/navigation';

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Календар',
  '/admin/clients': 'Клиенти',
  '/admin/services': 'Услуги & Цени',
  '/admin/stats': 'Статистики',
  '/admin/settings': 'Настройки',
};

export function AdminHeader() {
  const pathname = usePathname();
  const title = Object.entries(PAGE_TITLES).find(([key]) =>
    key === pathname || (key !== '/admin' && pathname.startsWith(key))
  )?.[1] ?? 'Admin';

  const today = format(new Date(), "EEEE, d MMMM yyyy 'г.'", { locale: bg });

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="text-sm text-gray-400 capitalize">{today}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Нова резервация бутон */}
        {pathname === '/admin' && (
          <button className="
            flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white
            bg-[var(--color-primary)] hover:opacity-90 transition-all shadow-sm
          ">
            <Plus className="w-4 h-4" />
            Нова резервация
          </button>
        )}

        {/* Известявания */}
        <button className="relative w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors">
          <Bell className="w-4 h-4 text-gray-500" />
        </button>
      </div>
    </header>
  );
}
