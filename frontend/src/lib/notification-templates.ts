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

export const TEMPLATE_TOKENS = [
  { label: 'Бизнес', token: '[Бизнес]' },
  { label: 'Име', token: '[Име]' },
  { label: 'Пълно име', token: '[ПълноИме]' },
  { label: 'Телефон', token: '[Телефон]' },
  { label: 'Услуга', token: '[Услуга]' },
  { label: 'Специалист', token: '[Специалист]' },
  { label: 'Дата', token: '[Дата]' },
  { label: 'Час', token: '[Час]' },
  { label: 'Адрес', token: '[Адрес]' },
  { label: 'Цена', token: '[Цена]' },
  { label: 'Причина', token: '[Причина]' },
] as const;

export function renderTemplatePreview(template: string, values: Record<string, string>) {
  return template
    .replace(/\[(Бизнес|Име|ПълноИме|Телефон|Услуга|Специалист|Дата|Час|Адрес|Цена|Причина)\]/g, (_, token) => {
      return values[token] || '';
    })
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}
