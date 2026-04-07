import type { ThemeConfig } from './tenant-context';

type BusinessCopy = {
  businessTypeLabel: string;
  serviceLabel: string;
  serviceLabelPlural: string;
  providerLabel: string;
  providerLabelPlural: string;
  providerAutoAssignLabel: string;
  bookingLabel: string;
  bookingAction: string;
  detailsHint: string;
};

const THEME_PRESETS: Record<string, Omit<ThemeConfig, 'logoUrl' | 'faviconUrl' | 'coverImageUrl'>> = {
  SALON: {
    primaryColor: '#b45309',
    secondaryColor: '#f59e0b',
    accentColor: '#7c2d12',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  BARBERSHOP: {
    primaryColor: '#1f2937',
    secondaryColor: '#b45309',
    accentColor: '#fbbf24',
    fontFamily: 'Manrope',
    borderRadius: 'sharp',
  },
  HAIR_SALON: {
    primaryColor: '#9f1239',
    secondaryColor: '#fb7185',
    accentColor: '#7c2d12',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  NAIL_STUDIO: {
    primaryColor: '#be185d',
    secondaryColor: '#f472b6',
    accentColor: '#fb7185',
    fontFamily: 'Manrope',
    borderRadius: 'pill',
  },
  SPA: {
    primaryColor: '#0f766e',
    secondaryColor: '#2dd4bf',
    accentColor: '#155e75',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  DENTAL: {
    primaryColor: '#0369a1',
    secondaryColor: '#38bdf8',
    accentColor: '#0f766e',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  MASSAGE: {
    primaryColor: '#7c3f00',
    secondaryColor: '#fb923c',
    accentColor: '#a16207',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  BEAUTY: {
    primaryColor: '#a21caf',
    secondaryColor: '#e879f9',
    accentColor: '#db2777',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
  OTHER: {
    primaryColor: '#0f172a',
    secondaryColor: '#475569',
    accentColor: '#0f766e',
    fontFamily: 'Manrope',
    borderRadius: 'rounded',
  },
};

export function getBusinessCopy(businessType: string | null | undefined): BusinessCopy {
  switch (businessType) {
    case 'BARBERSHOP':
      return {
        businessTypeLabel: 'бръснарница',
        serviceLabel: 'услуга',
        serviceLabelPlural: 'услуги',
        providerLabel: 'бръснар',
        providerLabelPlural: 'бръснари',
        providerAutoAssignLabel: 'свободен бръснар',
        bookingLabel: 'час',
        bookingAction: 'Запиши час',
        detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
      };
    case 'HAIR_SALON':
      return {
        businessTypeLabel: 'фризьорски салон',
        serviceLabel: 'услуга',
        serviceLabelPlural: 'услуги',
        providerLabel: 'фризьор',
        providerLabelPlural: 'фризьори',
        providerAutoAssignLabel: 'свободен фризьор',
        bookingLabel: 'час',
        bookingAction: 'Запиши час',
        detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
      };
    case 'NAIL_STUDIO':
      return {
        businessTypeLabel: 'маникюрно студио',
        serviceLabel: 'процедура',
        serviceLabelPlural: 'процедури',
        providerLabel: 'маникюрист',
        providerLabelPlural: 'маникюристи',
        providerAutoAssignLabel: 'свободен маникюрист',
        bookingLabel: 'час',
        bookingAction: 'Запиши час',
        detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
      };
    case 'SPA':
      return {
        businessTypeLabel: 'спа център',
        serviceLabel: 'терапия',
        serviceLabelPlural: 'терапии',
        providerLabel: 'терапевт',
        providerLabelPlural: 'терапевти',
        providerAutoAssignLabel: 'свободен терапевт',
        bookingLabel: 'сеанс',
        bookingAction: 'Запази сеанс',
        detailsHint: 'Необходими за потвърждение и напомняне за Вашия сеанс',
      };
    case 'DENTAL':
      return {
        businessTypeLabel: 'дентален кабинет',
        serviceLabel: 'процедура',
        serviceLabelPlural: 'процедури',
        providerLabel: 'лекар',
        providerLabelPlural: 'лекари',
        providerAutoAssignLabel: 'свободен лекар',
        bookingLabel: 'преглед',
        bookingAction: 'Запази час',
        detailsHint: 'Необходими за потвърждение и напомняне за Вашия преглед',
      };
    case 'MASSAGE':
      return {
        businessTypeLabel: 'масажно студио',
        serviceLabel: 'терапия',
        serviceLabelPlural: 'терапии',
        providerLabel: 'терапевт',
        providerLabelPlural: 'терапевти',
        providerAutoAssignLabel: 'свободен терапевт',
        bookingLabel: 'сеанс',
        bookingAction: 'Запази сеанс',
        detailsHint: 'Необходими за потвърждение и напомняне за Вашия сеанс',
      };
    case 'BEAUTY':
      return {
        businessTypeLabel: 'студио за красота',
        serviceLabel: 'процедура',
        serviceLabelPlural: 'процедури',
        providerLabel: 'специалист',
        providerLabelPlural: 'специалисти',
        providerAutoAssignLabel: 'свободен специалист',
        bookingLabel: 'час',
        bookingAction: 'Запиши час',
        detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
      };
    default:
      return {
        businessTypeLabel: 'бизнес',
        serviceLabel: 'услуга',
        serviceLabelPlural: 'услуги',
        providerLabel: 'специалист',
        providerLabelPlural: 'специалисти',
        providerAutoAssignLabel: 'свободен специалист',
        bookingLabel: 'час',
        bookingAction: 'Запиши час',
        detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
      };
  }
}

export function resolveTheme(
  businessType: string | null | undefined,
  theme: Partial<ThemeConfig> | null | undefined,
): ThemeConfig {
  const preset = THEME_PRESETS[businessType || 'OTHER'] || THEME_PRESETS.OTHER;

  return {
    primaryColor: theme?.primaryColor || preset.primaryColor,
    secondaryColor: theme?.secondaryColor || preset.secondaryColor,
    accentColor: theme?.accentColor || preset.accentColor,
    fontFamily: theme?.fontFamily || preset.fontFamily,
    logoUrl: theme?.logoUrl || null,
    faviconUrl: theme?.faviconUrl || null,
    coverImageUrl: theme?.coverImageUrl || null,
    borderRadius: theme?.borderRadius || preset.borderRadius,
  };
}
