import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Toaster } from 'sonner';
import { TenantProvider, type TenantConfig } from '@/lib/tenant-context';
import { QueryProvider } from '@/lib/query-provider';
import { getBusinessCopy, resolveTheme } from '@/lib/business-copy';
import './globals.css';

// Fetches tenant config server-side (SSR) — runs at request time
async function getTenantConfig(host: string): Promise<TenantConfig | null> {
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const res = await fetch(`${backendUrl}/api/v1/tenants/config`, {
      headers: {
        'X-Forwarded-Host': host,
        'X-Internal-Key': process.env.INTERNAL_API_KEY || '',
      },
      next: { revalidate: 300 }, // Cache 5 минути
    });

    if (!res.ok) return null;
    const json = await res.json();
    return json.data as TenantConfig;
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = headers();
  const host = headersList.get('host') || '';
  const tenant = await getTenantConfig(host);

  if (!tenant) {
    return { title: 'SalonIQ' };
  }

  const copy = getBusinessCopy(tenant.businessType);
  const theme = resolveTheme(tenant.businessType, tenant.theme);

  return {
    title: {
      default: tenant.businessName,
      template: `%s | ${tenant.businessName}`,
    },
    description:
      tenant.description || `${copy.bookingAction} онлайн в ${tenant.businessName}`,
    themeColor: theme.primaryColor,
    openGraph: {
      siteName: tenant.businessName,
      images: theme.coverImageUrl ? [{ url: theme.coverImageUrl }] : [],
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = headers();
  const host = headersList.get('host') || '';
  const tenant = await getTenantConfig(host);

  if (!tenant) {
    notFound();
  }

  return (
    <html lang="bg" suppressHydrationWarning>
      <head>
        {/* Preconnect за Google Fonts ако се ползва */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          <TenantProvider tenant={tenant}>
            {children}
            <Toaster
              position="top-center"
              richColors
              toastOptions={{
                style: {
                  fontFamily: 'var(--font-sans)',
                },
              }}
            />
          </TenantProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
