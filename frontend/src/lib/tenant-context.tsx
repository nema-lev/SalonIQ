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
    const primarySoft = toRgba(theme.primaryColor, 0.12);
    const secondarySoft = toRgba(theme.secondaryColor, 0.1);
    const primaryGlow = toRgba(theme.primaryColor, 0.18);
    const secondaryGlow = toRgba(theme.secondaryColor, 0.14);
    const lightGradient = buildSoftSurfaceGradient(theme.primaryColor, theme.secondaryColor);
    const surfaceAccentSoft = `color-mix(in srgb, ${theme.primaryColor} 12%, ${theme.surfaceStyle === 'dark' ? '#111827' : '#ffffff'})`;
    const surfaceAccentMuted = `color-mix(in srgb, ${theme.primaryColor} 8%, ${theme.surfaceStyle === 'dark' ? '#0f172a' : '#f8fafc'})`;
    const secondaryAccentSoft = `color-mix(in srgb, ${theme.secondaryColor} 10%, ${theme.surfaceStyle === 'dark' ? '#111827' : '#ffffff'})`;
    const pillSurface = theme.surfaceStyle === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.74)';
    const surfacePalettes = {
      light: {
        bgSurface: '#f8fafc',
        bgCard: 'rgba(255,255,255,0.78)',
        textStrong: '#1c1535',
        textSoft: '#675f84',
        lineSoft: primarySoft,
        shadowSoft: '0 18px 48px rgba(73, 39, 142, 0.08)',
        shadowStrong: '0 28px 80px rgba(73, 39, 142, 0.18)',
        bgOrb1: secondaryGlow,
        bgOrb2: primaryGlow,
        bgGradientStart: lightGradient.start,
        bgGradientMid: lightGradient.mid,
        bgGradientEnd: lightGradient.end,
      },
      graphite: {
        bgSurface: '#eef2f6',
        bgCard: 'rgba(255,255,255,0.68)',
        textStrong: '#111827',
        textSoft: '#4b5563',
        lineSoft: 'rgba(15, 23, 42, 0.12)',
        shadowSoft: '0 18px 48px rgba(15, 23, 42, 0.10)',
        shadowStrong: '0 28px 80px rgba(15, 23, 42, 0.16)',
        bgOrb1: toRgba(theme.primaryColor, 0.08),
        bgOrb2: toRgba(theme.secondaryColor, 0.09),
        bgGradientStart: '#f8fafc',
        bgGradientMid: mixHex(theme.primaryColor, '#eef2f6', 0.1),
        bgGradientEnd: mixHex(theme.secondaryColor, '#e7ecf3', 0.16),
      },
      dark: {
        bgSurface: '#090c14',
        bgCard: 'rgba(15,23,42,0.62)',
        textStrong: '#f8fafc',
        textSoft: '#cbd5e1',
        lineSoft: toRgba(theme.secondaryColor, 0.22),
        shadowSoft: '0 18px 48px rgba(2, 6, 23, 0.34)',
        shadowStrong: '0 28px 80px rgba(2, 6, 23, 0.54)',
        bgOrb1: toRgba(theme.secondaryColor, 0.12),
        bgOrb2: toRgba(theme.primaryColor, 0.18),
        bgGradientStart: '#0b1020',
        bgGradientMid: mixHex(theme.primaryColor, '#090c14', 0.18),
        bgGradientEnd: mixHex(theme.secondaryColor, '#06080f', 0.12),
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
    root.style.setProperty('--surface-accent-soft', surfaceAccentSoft);
    root.style.setProperty('--surface-accent-muted', surfaceAccentMuted);
    root.style.setProperty('--surface-secondary-soft', secondaryAccentSoft);
    root.style.setProperty('--surface-pill', pillSurface);

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

function toRgba(hex: string, alpha: number) {
  const rgb = parseHexColor(hex);
  if (!rgb) return `rgba(124, 58, 237, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function mixHex(first: string, second: string, ratio: number) {
  const a = parseHexColor(first);
  const b = parseHexColor(second);
  if (!a || !b) return first;
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  const mixed = {
    r: Math.round(a.r * clampedRatio + b.r * (1 - clampedRatio)),
    g: Math.round(a.g * clampedRatio + b.g * (1 - clampedRatio)),
    b: Math.round(a.b * clampedRatio + b.b * (1 - clampedRatio)),
  };
  return `#${[mixed.r, mixed.g, mixed.b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function buildSoftSurfaceGradient(primary: string, secondary: string) {
  return {
    start: mixHex(primary, '#ffffff', 0.06),
    mid: mixHex(secondary, '#f8fafc', 0.1),
    end: mixHex(primary, '#f1f5f9', 0.08),
  };
}

function parseHexColor(value: string) {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    };
  }
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return {
      r: parseInt(`${normalized[1]}${normalized[1]}`, 16),
      g: parseInt(`${normalized[2]}${normalized[2]}`, 16),
      b: parseInt(`${normalized[3]}${normalized[3]}`, 16),
    };
  }
  return null;
}
