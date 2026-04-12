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
    'Заявката Ви към [Бизнес] е получена.\n\nУслуга: [Услуга]\nСпециалист: [Специалист]\nДата: [Дата]\nЧас: [Час]\n[Адрес]\n\nЩе Ви изпратим потвърждение скоро.',
  bookingConfirmed:
    'Часът Ви в [Бизнес] е потвърден.\n\nУслуга: [Услуга]\nСпециалист: [Специалист]\nДата: [Дата]\nЧас: [Час]\n[Адрес]\n\nОчакваме Ви.',
  reminder24h:
    'Напомняне от [Бизнес]\n\nУтре имате [Услуга] при [Специалист].\nДата: [Дата]\nЧас: [Час]\n[Адрес]',
  reminder2h:
    'След 2 часа Ви очакваме в [Бизнес].\n\n[Услуга] при [Специалист]\nЧас: [Час]\n[Адрес]',
  cancellation:
    'Часът Ви в [Бизнес] беше отменен.\n\nУслуга: [Услуга]\nДата: [Дата]\nЧас: [Час]\n[Причина]',
  ownerNewBooking:
    'Нова резервация в [Бизнес]\n\nКлиент: [ПълноИме]\nТелефон: [Телефон]\nУслуга: [Услуга]\nСпециалист: [Специалист]\nДата: [Дата]\nЧас: [Час]',
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
