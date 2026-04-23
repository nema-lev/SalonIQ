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
          className="h-dvh overflow-hidden bg-gray-50"
          style={{
            height: '100dvh',
            minHeight: '100dvh',
            background: '#f5f6fb',
            width: '100%',
            overflow: 'hidden',
          }}
        >
          <AdminSidebar mobileOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
          <div className="min-h-0 min-w-0" style={{ minHeight: 0, minWidth: 0, height: '100%' }}>
            <div
              className="flex h-full min-h-0 min-w-0 flex-col"
              style={{ display: 'flex', height: '100%', minHeight: 0, minWidth: 0 }}
            >
              <AdminHeader onOpenMenu={() => setMobileNavOpen(true)} />
              <main
                data-admin-scroll-root
                className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
                style={{
                  flex: 1,
                  minHeight: 0,
                  padding: '20px 16px calc(env(safe-area-inset-bottom, 0px) + 104px)',
                  overflowY: 'auto',
                  overflowX: 'clip',
                  overscrollBehaviorX: 'none',
                  overscrollBehaviorY: 'contain',
                  scrollbarGutter: 'stable',
                  WebkitOverflowScrolling: 'touch',
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
