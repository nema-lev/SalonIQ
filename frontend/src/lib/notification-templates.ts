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
    'Нова заявка в [Бизнес]\n\nКлиент: [ПълноИме]\nТелефон: [Телефон]\nУслуга: [Услуга]\nСпециалист: [Специалист]\nДата: [Дата]\nЧас: [Час]',
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
