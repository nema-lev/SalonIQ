'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { resolveTheme } from './business-copy';

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  borderRadius: 'sharp' | 'rounded' | 'pill';
}

export interface TenantConfig {
  id: string;
  slug: string;
  businessName: string;
  businessType: string;
  description: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleMapsUrl: string | null;
  workingHours: Record<string, { open: string; close: string; isOpen: boolean }>;
  theme: ThemeConfig;
  requiresConfirmation: boolean;
  cancellationHours: number;
  minAdvanceBookingHours: number;
  maxAdvanceBookingDays: number;
}

const TenantContext = createContext<TenantConfig | null>(null);

export function TenantProvider({
  children,
  tenant,
}: {
  children: React.ReactNode;
  tenant: TenantConfig;
}) {
  // Инжектирай CSS variables за white-label теми
  useEffect(() => {
    const theme = resolveTheme(tenant.businessType, tenant.theme);
    const root = document.documentElement;

    root.style.setProperty('--color-primary', theme.primaryColor);
    root.style.setProperty('--color-secondary', theme.secondaryColor);
    root.style.setProperty('--color-accent', theme.accentColor);

    // Радиус на ъгълчетата
    const radii = { sharp: '0px', rounded: '8px', pill: '999px' };
    root.style.setProperty('--radius', radii[theme.borderRadius] ?? '8px');

    // Шрифт
    if (theme.fontFamily && theme.fontFamily !== 'Inter') {
      root.style.setProperty('--font-sans', `"${theme.fontFamily}", sans-serif`);
    }

    // Favicon
    if (theme.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    }

    // Page title
    document.title = tenant.businessName;
  }, [tenant]);

  return (
    <TenantContext.Provider value={tenant}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
