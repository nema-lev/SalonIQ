export interface NotificationTemplates {
  bookingPending: string;
  bookingConfirmed: string;
  reminder24h: string;
  reminder2h: string;
  cancellation: string;
  ownerNewBooking: string;
}

export const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplates = {
  bookingPending:
    'Здравейте, [Име]! Заявката Ви към [Бизнес] е получена и очаква потвърждение.\n\n[Услуга] при [Специалист]\n[Дата] в [Час]\n[Адрес]',
  bookingConfirmed:
    'Здравейте, [Име]! Часът Ви в [Бизнес] е потвърден.\n\n[Услуга] при [Специалист]\n[Дата] в [Час]\n[Адрес]',
  reminder24h:
    'Напомняне от [Бизнес]: утре имате [Услуга] при [Специалист] на [Дата] в [Час].\n[Адрес]',
  reminder2h:
    'След 2 часа Ви очакваме в [Бизнес] за [Услуга] при [Специалист] в [Час].\n[Адрес]',
  cancellation:
    '[Бизнес]: часът Ви за [Услуга] на [Дата] в [Час] беше отменен.\n[Причина]',
  ownerNewBooking:
    'Нова резервация в [Бизнес]\n[ПълноИме] · [Телефон]\n[Услуга] при [Специалист]\n[Дата] в [Час]',
};

export const TEMPLATE_TOKEN_LABELS = [
  'Бизнес',
  'Име',
  'ПълноИме',
  'Телефон',
  'Услуга',
  'Специалист',
  'Дата',
  'Час',
  'Адрес',
  'Цена',
  'Причина',
] as const;

type TemplateTokenLabel = (typeof TEMPLATE_TOKEN_LABELS)[number];

export function getNotificationTemplates(themeConfig: any): NotificationTemplates {
  const raw = themeConfig?.notificationTemplates || {};

  return {
    bookingPending: sanitizeTemplate(raw.bookingPending, DEFAULT_NOTIFICATION_TEMPLATES.bookingPending),
    bookingConfirmed: sanitizeTemplate(raw.bookingConfirmed, DEFAULT_NOTIFICATION_TEMPLATES.bookingConfirmed),
    reminder24h: sanitizeTemplate(raw.reminder24h, DEFAULT_NOTIFICATION_TEMPLATES.reminder24h),
    reminder2h: sanitizeTemplate(raw.reminder2h, DEFAULT_NOTIFICATION_TEMPLATES.reminder2h),
    cancellation: sanitizeTemplate(raw.cancellation, DEFAULT_NOTIFICATION_TEMPLATES.cancellation),
    ownerNewBooking: sanitizeTemplate(raw.ownerNewBooking, DEFAULT_NOTIFICATION_TEMPLATES.ownerNewBooking),
  };
}

function sanitizeTemplate(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
}

export function renderNotificationTemplate(
  template: string,
  values: Partial<Record<TemplateTokenLabel, string | number | null | undefined>>,
) {
  return template
    .replace(/\[(Бизнес|Име|ПълноИме|Телефон|Услуга|Специалист|Дата|Час|Адрес|Цена|Причина)\]/g, (_, token: TemplateTokenLabel) => {
      const raw = values[token];
      return raw == null ? '' : String(raw);
    })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
