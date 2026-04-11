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
          className="min-h-screen bg-gray-50 flex"
          style={{ minHeight: '100vh', background: '#f5f6fb', display: 'flex', width: '100%', overflowX: 'clip' }}
        >
          <AdminSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <div
            className="flex-1 flex flex-col min-w-0"
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          >
            <AdminHeader onOpenMenu={() => setMobileNavOpen(true)} />
            <main
              className="flex-1 overflow-auto"
              style={{
                flex: 1,
                padding: '20px 16px calc(env(safe-area-inset-bottom, 0px) + 104px)',
                overflow: 'auto',
                overflowX: 'clip',
                overscrollBehaviorX: 'none',
              }}
            >
              {children}
            </main>
          </div>
        </div>
      )}
    </AdminAuthGuard>
  );
}
