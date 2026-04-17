import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { TenantProvider, type TenantConfig } from '@/lib/tenant-context';
import { getBusinessCopy, resolveTheme } from '@/lib/business-copy';
import { resolveServerTenantFallbackSlug } from '@/lib/tenant-resolution';

function getTenantServerEnv() {
  const backendUrl = process.env.BACKEND_URL || '';
  const internalApiKey = process.env.INTERNAL_API_KEY || '';
  const missing: string[] = [];

  if (!backendUrl.trim()) missing.push('BACKEND_URL');
  if (!internalApiKey.trim()) missing.push('INTERNAL_API_KEY');

  if (missing.length > 0 && process.env.NODE_ENV !== 'production') {
    throw new Error(
      `Missing frontend server env vars for tenant SSR: ${missing.join(', ')}. ` +
        'Copy frontend/.env.local.example to frontend/.env.local.',
    );
  }

  return {
    backendUrl: backendUrl || 'http://localhost:3001',
    internalApiKey,
  };
}

async function getTenantConfig(host: string): Promise<TenantConfig | null> {
  try {
    const { backendUrl, internalApiKey } = getTenantServerEnv();
    const fallbackTenantSlug = resolveServerTenantFallbackSlug({
      host,
      appDomain: process.env.NEXT_PUBLIC_APP_DOMAIN || process.env.APP_DOMAIN || 'saloniq.bg',
      defaultTenantSlug: process.env.DEFAULT_TENANT_SLUG || '',
    });
    const res = await fetch(`${backendUrl}/api/v1/tenants/config`, {
      headers: {
        'X-Forwarded-Host': host,
        'X-Internal-Key': internalApiKey,
        ...(fallbackTenantSlug ? { 'X-Tenant-Slug': fallbackTenantSlug } : {}),
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (process.env.NODE_ENV !== 'production') {
        console.error(
          `Tenant config request failed with ${res.status} for host '${host}'` +
            `${fallbackTenantSlug ? ` and fallback tenant '${fallbackTenantSlug}'` : ''}.`,
        );
      }
      return null;
    }

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

export default async function TenantLayout({
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

  return <TenantProvider tenant={tenant}>{children}</TenantProvider>;
}
