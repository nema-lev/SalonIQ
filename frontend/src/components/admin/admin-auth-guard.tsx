'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('saloniq_token');
    const isLoginPage = pathname === '/admin/login';
    const isBlockedPage = pathname === '/admin/billing-blocked';

    if (!token && !isLoginPage && !isBlockedPage) {
      router.replace('/admin/login');
    } else if (token && isLoginPage) {
      router.replace('/admin');
    } else {
      setChecking(false);
    }
  }, [pathname, router]);

  useEffect(() => {
    if (pathname === '/admin/login' || pathname === '/admin/billing-blocked') return;
    const token = localStorage.getItem('saloniq_token');
    if (!token) return;

    const runCheck = () => {
      apiClient.get('/auth/me').catch(() => {
        // Redirect логиката е централизирана в api-client interceptor-а.
      });
    };

    runCheck();
    const intervalId = window.setInterval(runCheck, 60 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [pathname]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return <>{children}</>;
}
