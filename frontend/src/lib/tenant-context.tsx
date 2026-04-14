'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { resolveTheme } from './business-copy';
import type { NotificationTemplates } from './notification-templates';

export interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  fontFamily: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  coverText: string | null;
  logoShape: 'rounded' | 'circle';
  borderRadius: 'sharp' | 'rounded' | 'pill';
  surfaceStyle: 'light' | 'graphite' | 'dark';
  poweredByText: string;
  serviceCategories: string[];
}

export interface TenantConfig {
  id: string;
  slug: string;
  businessName: string;
  businessType: string;
  plan: string;
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
  reminderHours: number[];
  minAdvanceBookingHours: number;
  maxAdvanceBookingDays: number;
  allowRandomStaffSelection: boolean;
  allowClientCancellation: boolean;
  collectClientEmail: boolean;
  enableTelegramNotifications: boolean;
  enableSmsNotifications: boolean;
  notificationTemplates: NotificationTemplates;
  showBusinessNameInPortal: boolean;
}

type TenantContextValue = {
  tenant: TenantConfig;
  updateTenant: (patch: Omit<Partial<TenantConfig>, 'theme'> & { theme?: Partial<ThemeConfig> }) => void;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  children,
  tenant,
}: {
  children: React.ReactNode;
  tenant: TenantConfig;
}) {
  const [tenantState, setTenantState] = useState<TenantConfig>(tenant);

  useEffect(() => {
    setTenantState(tenant);
  }, [tenant]);

  const updateTenant = (patch: Omit<Partial<TenantConfig>, 'theme'> & { theme?: Partial<ThemeConfig> }) => {
    setTenantState((current) => ({
      ...current,
      ...patch,
      theme: patch.theme ? { ...current.theme, ...patch.theme } : current.theme,
    }));
  };

  // Инжектирай CSS variables за white-label теми
  useEffect(() => {
    const theme = resolveTheme(tenantState.businessType, tenantState.theme);
    const root = document.documentElement;
    const surfacePalettes = {
      light: {
        bgSurface: '#f6f4ff',
        bgCard: 'rgba(255,255,255,0.78)',
        textStrong: '#1c1535',
        textSoft: '#675f84',
        lineSoft: 'rgba(124, 58, 237, 0.12)',
        shadowSoft: '0 18px 48px rgba(73, 39, 142, 0.08)',
        shadowStrong: '0 28px 80px rgba(73, 39, 142, 0.18)',
        bgOrb1: 'rgba(168, 85, 247, 0.18)',
        bgOrb2: 'rgba(124, 58, 237, 0.14)',
        bgGradientStart: '#faf8ff',
        bgGradientMid: '#f6f4ff',
        bgGradientEnd: '#f4f2fb',
      },
      graphite: {
        bgSurface: '#eef2f6',
        bgCard: 'rgba(255,255,255,0.68)',
        textStrong: '#111827',
        textSoft: '#4b5563',
        lineSoft: 'rgba(15, 23, 42, 0.12)',
        shadowSoft: '0 18px 48px rgba(15, 23, 42, 0.10)',
        shadowStrong: '0 28px 80px rgba(15, 23, 42, 0.16)',
        bgOrb1: 'rgba(30, 41, 59, 0.12)',
        bgOrb2: 'rgba(71, 85, 105, 0.12)',
        bgGradientStart: '#f8fafc',
        bgGradientMid: '#eef2f6',
        bgGradientEnd: '#e7ecf3',
      },
      dark: {
        bgSurface: '#090c14',
        bgCard: 'rgba(15,23,42,0.62)',
        textStrong: '#f8fafc',
        textSoft: '#cbd5e1',
        lineSoft: 'rgba(148,163,184,0.18)',
        shadowSoft: '0 18px 48px rgba(2, 6, 23, 0.34)',
        shadowStrong: '0 28px 80px rgba(2, 6, 23, 0.54)',
        bgOrb1: 'rgba(56, 189, 248, 0.12)',
        bgOrb2: 'rgba(124, 58, 237, 0.18)',
        bgGradientStart: '#0b1020',
        bgGradientMid: '#090c14',
        bgGradientEnd: '#06080f',
      },
    } as const;
    const surface = surfacePalettes[theme.surfaceStyle] ?? surfacePalettes.light;

    root.style.setProperty('--color-primary', theme.primaryColor);
    root.style.setProperty('--color-secondary', theme.secondaryColor);
    root.style.setProperty('--color-accent', theme.accentColor);
    root.style.setProperty('--bg-surface', surface.bgSurface);
    root.style.setProperty('--bg-card', surface.bgCard);
    root.style.setProperty('--text-strong', surface.textStrong);
    root.style.setProperty('--text-soft', surface.textSoft);
    root.style.setProperty('--line-soft', surface.lineSoft);
    root.style.setProperty('--shadow-soft', surface.shadowSoft);
    root.style.setProperty('--shadow-strong', surface.shadowStrong);
    root.style.setProperty('--bg-orb-1', surface.bgOrb1);
    root.style.setProperty('--bg-orb-2', surface.bgOrb2);
    root.style.setProperty('--bg-gradient-start', surface.bgGradientStart);
    root.style.setProperty('--bg-gradient-mid', surface.bgGradientMid);
    root.style.setProperty('--bg-gradient-end', surface.bgGradientEnd);

    // Радиус на ъгълчетата
    const radii = { sharp: '0px', rounded: '8px', pill: '999px' };
    root.style.setProperty('--radius', radii[theme.borderRadius] ?? '8px');

    // Шрифт
    if (theme.fontFamily && theme.fontFamily !== 'Inter') {
      root.style.setProperty('--font-sans', `"${theme.fontFamily}", sans-serif`);
    }

    // Favicon
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (theme.faviconUrl) {
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = theme.faviconUrl;
    } else if (link) {
      link.remove();
    }

    // Page title
    document.title = tenantState.businessName;
  }, [tenantState]);

  const value = useMemo(
    () => ({ tenant: tenantState, updateTenant }),
    [tenantState],
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantConfig {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx.tenant;
}

export function useTenantActions() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenantActions must be used within TenantProvider');
  return { updateTenant: ctx.updateTenant };
}
