'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { AdminHeader } from '@/components/admin/admin-header';
import { AdminAuthGuard } from '@/components/admin/admin-auth-guard';

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin/login';
  const isBlockedPage = pathname === '/admin/billing-blocked';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <AdminAuthGuard>
      {isLoginPage || isBlockedPage ? (
        <>{children}</>
      ) : (
        <div
          className="min-h-screen bg-gray-50"
          style={{ minHeight: '100vh', background: '#f5f6fb', width: '100%', overflowX: 'clip' }}
        >
          <AdminSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <div
            className="min-h-screen min-w-0 lg:pl-[280px]"
            style={{ minHeight: '100vh', minWidth: 0, paddingLeft: '0px' }}
          >
            <div
              className="flex min-h-screen min-w-0 flex-col"
              style={{ display: 'flex', minHeight: '100vh', minWidth: 0 }}
            >
              <AdminHeader onOpenMenu={() => setMobileNavOpen(true)} />
              <main
                className="flex-1 overflow-y-auto overflow-x-hidden"
                style={{
                  flex: 1,
                  padding: '20px 16px calc(env(safe-area-inset-bottom, 0px) + 104px)',
                  overflowY: 'auto',
                  overflowX: 'clip',
                  overscrollBehaviorX: 'none',
                }}
              >
                {children}
              </main>
            </div>
          </div>
        </div>
      )}
    </AdminAuthGuard>
  );
}
