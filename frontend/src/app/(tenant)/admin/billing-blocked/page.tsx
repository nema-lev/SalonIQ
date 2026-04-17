'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ShieldX } from 'lucide-react';

export default function BillingBlockedPage() {
  const params = useSearchParams();
  const reason = params.get('reason');
  const isSuspended = reason === 'suspended';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f6fb',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 28,
          padding: 28,
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isSuspended ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.1)',
            color: isSuspended ? '#dc2626' : '#d97706',
            marginBottom: 18,
          }}
        >
          {isSuspended ? <ShieldX className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, color: '#111827', letterSpacing: '-0.04em' }}>
          {isSuspended ? 'Достъпът е спрян' : 'Услугата не е платена'}
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.7, color: '#4b5563' }}>
          {isSuspended
            ? 'Достъпът до админ панела е спрян от платформата. Свържете се с администратора на SalonIQ.'
            : 'Достъпът до админ панела е временно ограничен, защото абонаментът не е активен.'}
        </p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link
            href="/admin/login"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 18px',
              borderRadius: 14,
              background: 'var(--color-primary)',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Назад към входа
          </Link>
        </div>
      </div>
    </div>
  );
}
