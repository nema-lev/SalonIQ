import type { ThemeConfig } from './tenant-context';
import { getBusinessTypeConfig, type BusinessCopy, type BusinessProfile } from './business-config';

export function getBusinessCopy(businessType: string | null | undefined): BusinessCopy {
  return getBusinessTypeConfig(businessType).copy;
}

export function getBusinessProfile(businessType: string | null | undefined): BusinessProfile {
  return getBusinessTypeConfig(businessType);
}

export function resolveTheme(
  businessType: string | null | undefined,
  theme: Partial<ThemeConfig> | null | undefined,
): ThemeConfig {
  const preset = getBusinessTypeConfig(businessType).themePreset;

  return {
    primaryColor: theme?.primaryColor || preset.primaryColor,
    secondaryColor: theme?.secondaryColor || preset.secondaryColor,
    accentColor: theme?.accentColor || preset.accentColor,
    fontFamily: theme?.fontFamily || preset.fontFamily,
    logoUrl: theme?.logoUrl || null,
    faviconUrl: theme?.faviconUrl || null,
    coverImageUrl: theme?.coverImageUrl || null,
    borderRadius: theme?.borderRadius || preset.borderRadius,
    surfaceStyle: theme?.surfaceStyle || preset.surfaceStyle,
  };
}
