import type { ThemeConfig } from './tenant-context';

export const BUSINESS_TYPES = [
  'SALON',
  'BARBERSHOP',
  'HAIR_SALON',
  'NAIL_STUDIO',
  'SPA',
  'DENTAL',
  'MASSAGE',
  'BEAUTY',
  'OTHER',
] as const;

export type BusinessTypeKey = (typeof BUSINESS_TYPES)[number];

export type BusinessCopy = {
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

export type BusinessProfile = {
  label: string;
  description: string;
  copy: BusinessCopy;
  themePreset: Omit<ThemeConfig, 'logoUrl' | 'faviconUrl' | 'coverImageUrl'>;
  operations: {
    staffSelection: 'required' | 'optional' | 'disabled';
    staffSelectionLabel: string;
    onlineFlowLabel: string;
    adminFocusLabel: string;
  };
};

export const BUSINESS_TYPE_CONFIG: Record<BusinessTypeKey, BusinessProfile> = {
  SALON: {
    label: 'Козметичен салон',
    description: 'Класически модел с услуги, персонал и директен избор на специалист.',
    copy: {
      businessTypeLabel: 'козметичен салон',
      serviceLabel: 'услуга',
      serviceLabelPlural: 'услуги',
      providerLabel: 'специалист',
      providerLabelPlural: 'специалисти',
      providerAutoAssignLabel: 'свободен специалист',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#b45309',
      secondaryColor: '#f59e0b',
      accentColor: '#7c2d12',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Услуги, специалисти и натовареност',
    },
  },
  BARBERSHOP: {
    label: 'Бръснарница',
    description: 'Работа с по-кратки услуги и по-ясен избор на конкретен бръснар.',
    copy: {
      businessTypeLabel: 'бръснарница',
      serviceLabel: 'услуга',
      serviceLabelPlural: 'услуги',
      providerLabel: 'бръснар',
      providerLabelPlural: 'бръснари',
      providerAutoAssignLabel: 'свободен бръснар',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#1f2937',
      secondaryColor: '#b45309',
      accentColor: '#fbbf24',
      fontFamily: 'Manrope',
      borderRadius: 'sharp',
      surfaceStyle: 'graphite',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Бърз оборот и календар по стол/специалист',
    },
  },
  HAIR_SALON: {
    label: 'Фризьорски салон',
    description: 'Услуги с по-дълга продължителност и силна зависимост от конкретен фризьор.',
    copy: {
      businessTypeLabel: 'фризьорски салон',
      serviceLabel: 'услуга',
      serviceLabelPlural: 'услуги',
      providerLabel: 'фризьор',
      providerLabelPlural: 'фризьори',
      providerAutoAssignLabel: 'свободен фризьор',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#9f1239',
      secondaryColor: '#fb7185',
      accentColor: '#7c2d12',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Продължителни услуги и натоварване по фризьор',
    },
  },
  NAIL_STUDIO: {
    label: 'Маникюрно студио',
    description: 'Процедурен модел с по-ясно продуктово представяне и избор на маникюрист.',
    copy: {
      businessTypeLabel: 'маникюрно студио',
      serviceLabel: 'процедура',
      serviceLabelPlural: 'процедури',
      providerLabel: 'маникюрист',
      providerLabelPlural: 'маникюристи',
      providerAutoAssignLabel: 'свободен маникюрист',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#be185d',
      secondaryColor: '#f472b6',
      accentColor: '#fb7185',
      fontFamily: 'Manrope',
      borderRadius: 'pill',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Процедури, цветове и повторяеми посещения',
    },
  },
  SPA: {
    label: 'СПА / уелнес',
    description: 'Сеанси и терапии с по-спокойна комуникация и по-дълги времеви блокове.',
    copy: {
      businessTypeLabel: 'спа център',
      serviceLabel: 'терапия',
      serviceLabelPlural: 'терапии',
      providerLabel: 'терапевт',
      providerLabelPlural: 'терапевти',
      providerAutoAssignLabel: 'свободен терапевт',
      bookingLabel: 'сеанс',
      bookingAction: 'Запази сеанс',
      detailsHint: 'Необходими за потвърждение и напомняне за Вашия сеанс',
    },
    themePreset: {
      primaryColor: '#0f766e',
      secondaryColor: '#2dd4bf',
      accentColor: '#155e75',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Сеанси, буфери и по-дълги резервации',
    },
  },
  DENTAL: {
    label: 'Дентален кабинет',
    description: 'По-структуриран прием с акцент върху процедури, прегледи и по-точни напомняния.',
    copy: {
      businessTypeLabel: 'дентален кабинет',
      serviceLabel: 'процедура',
      serviceLabelPlural: 'процедури',
      providerLabel: 'лекар',
      providerLabelPlural: 'лекари',
      providerAutoAssignLabel: 'свободен лекар',
      bookingLabel: 'преглед',
      bookingAction: 'Запази час',
      detailsHint: 'Необходими за потвърждение и напомняне за Вашия преглед',
    },
    themePreset: {
      primaryColor: '#0369a1',
      secondaryColor: '#38bdf8',
      accentColor: '#0f766e',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'required',
      staffSelectionLabel: 'Задължителен избор на лекар',
      onlineFlowLabel: 'Структуриран booking flow',
      adminFocusLabel: 'Прегледи, потвърждения и по-строг график',
    },
  },
  MASSAGE: {
    label: 'Масажно студио',
    description: 'Сеансов модел, близък до SPA, с акцент върху терапевт и спокойна комуникация.',
    copy: {
      businessTypeLabel: 'масажно студио',
      serviceLabel: 'терапия',
      serviceLabelPlural: 'терапии',
      providerLabel: 'терапевт',
      providerLabelPlural: 'терапевти',
      providerAutoAssignLabel: 'свободен терапевт',
      bookingLabel: 'сеанс',
      bookingAction: 'Запази сеанс',
      detailsHint: 'Необходими за потвърждение и напомняне за Вашия сеанс',
    },
    themePreset: {
      primaryColor: '#7c3f00',
      secondaryColor: '#fb923c',
      accentColor: '#a16207',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'По-дълги сесии и повторяеми посещения',
    },
  },
  BEAUTY: {
    label: 'Студио за красота',
    description: 'Общ профил за разнородни процедури и по-гъвкава терминология.',
    copy: {
      businessTypeLabel: 'студио за красота',
      serviceLabel: 'процедура',
      serviceLabelPlural: 'процедури',
      providerLabel: 'специалист',
      providerLabelPlural: 'специалисти',
      providerAutoAssignLabel: 'свободен специалист',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#a21caf',
      secondaryColor: '#e879f9',
      accentColor: '#db2777',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'light',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Директен booking flow',
      adminFocusLabel: 'Гъвкав каталог и различни типове процедури',
    },
  },
  OTHER: {
    label: 'Друг бизнес',
    description: 'Неутрален профил, който не налага специализирана терминология.',
    copy: {
      businessTypeLabel: 'бизнес',
      serviceLabel: 'услуга',
      serviceLabelPlural: 'услуги',
      providerLabel: 'специалист',
      providerLabelPlural: 'специалисти',
      providerAutoAssignLabel: 'свободен специалист',
      bookingLabel: 'час',
      bookingAction: 'Запиши час',
      detailsHint: 'Необходими за потвърждение и известяване за Вашия час',
    },
    themePreset: {
      primaryColor: '#0f172a',
      secondaryColor: '#475569',
      accentColor: '#0f766e',
      fontFamily: 'Manrope',
      borderRadius: 'rounded',
      surfaceStyle: 'graphite',
    },
    operations: {
      staffSelection: 'optional',
      staffSelectionLabel: 'Избор или автоматично разпределяне',
      onlineFlowLabel: 'Неутрален booking flow',
      adminFocusLabel: 'Общ режим без специализирани ограничения',
    },
  },
};

export const BUSINESS_TYPE_LABELS: Record<BusinessTypeKey, string> = Object.fromEntries(
  BUSINESS_TYPES.map((type) => [type, BUSINESS_TYPE_CONFIG[type].label]),
) as Record<BusinessTypeKey, string>;

export function getBusinessTypeConfig(businessType: string | null | undefined): BusinessProfile {
  const key = (businessType || 'OTHER') as BusinessTypeKey;
  return BUSINESS_TYPE_CONFIG[key] || BUSINESS_TYPE_CONFIG.OTHER;
}
