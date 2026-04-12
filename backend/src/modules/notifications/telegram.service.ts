import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { renderNotificationTemplate } from './template.utils';

const TIMEZONE = 'Europe/Sofia';

export interface AppointmentDetails {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  price?: number;
  address?: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramWebhookResult {
  ok: boolean;
  description?: string;
  errorCode?: number;
}

export interface TelegramBotProfileResult {
  ok: boolean;
  username?: string;
  firstName?: string;
  description?: string;
  errorCode?: number;
}

/**
 * TelegramService — изпраща съобщения чрез Telegram Bot API.
 *
 * Всеки tenant има свой Bot Token.
 * Клиентът получава съобщения на своя chat_id.
 * Собственикът получава известявания на неговия chat_id (telegramChatId в tenant настройките).
 */
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly apiBase = 'https://api.telegram.org/bot';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Изпраща потвърждение за записан час към клиента
   */
  async sendBookingConfirmation(
    botToken: string,
    chatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    status: 'confirmed' | 'pending',
    allowClientCancellation = true,
    template?: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, "EEEE, d MMMM yyyy 'г.'", { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');

    const isPending = status === 'pending';
    const text = template
      ? renderNotificationTemplate(template, {
          Бизнес: businessName,
          Име: appointment.clientName,
          ПълноИме: appointment.clientName,
          Телефон: appointment.clientPhone,
          Услуга: appointment.serviceName,
          Специалист: appointment.staffName,
          Дата: dateStr,
          Час: timeStr,
          Адрес: appointment.address || '',
          Цена: appointment.price ? `${appointment.price} €` : '',
        })
      : `${isPending ? '⏳' : '✅'} *${businessName}*\n` +
        `─────────────────\n` +
        `${isPending ? '📋 Заявка за час' : '✅ Потвърждение за час'}\n\n` +
        `*Здравейте, ${appointment.clientName}!*\n\n` +
        `🔧 *Услуга:* ${appointment.serviceName}\n` +
        `👤 *Специалист:* ${appointment.staffName}\n` +
        `📅 *Дата:* ${dateStr}\n` +
        `🕐 *Час:* ${timeStr}\n` +
        (appointment.price ? `💰 *Цена:* ${appointment.price} €\n` : '') +
        (appointment.address ? `📍 *Адрес:* ${appointment.address}\n` : '') +
        `\n${isPending ? 'Заявката е получена и очаква потвърждение.' : 'Часът е потвърден. Очакваме Ви!'}`;

    const keyboard = isPending
      ? undefined
      : allowClientCancellation
        ? {
            inline_keyboard: [
              [{ text: '❌ Отменям', callback_data: `cancel_client_${appointment.id}` }],
            ],
          }
        : undefined;

    return this.sendMessage(botToken, chatId, text, keyboard, template ? undefined : 'Markdown');
  }

  /**
   * Изпраща reminder 24ч преди часа с бутони за потвърждение
   */
  async sendReminder(
    botToken: string,
    chatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    hoursUntil: 24 | 2,
    allowClientCancellation = true,
    template?: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const timeStr = format(zonedStart, 'HH:mm');
    const dateStr = format(zonedStart, "d MMMM", { locale: bg });
    const text = template
      ? renderNotificationTemplate(template, {
          Бизнес: businessName,
          Име: appointment.clientName,
          ПълноИме: appointment.clientName,
          Телефон: appointment.clientPhone,
          Услуга: appointment.serviceName,
          Специалист: appointment.staffName,
          Дата: dateStr,
          Час: timeStr,
          Адрес: appointment.address || '',
          Цена: appointment.price ? `${appointment.price} €` : '',
        })
      : `🔔 *Напомняне — ${businessName}*\n` +
        `─────────────────\n\n` +
        `*${appointment.clientName}*, имате час *${hoursUntil === 24 ? 'утре' : 'след 2 часа'}*!\n\n` +
        `🔧 *${appointment.serviceName}*\n` +
        `👤 ${appointment.staffName}\n` +
        `🕐 ${dateStr} в ${timeStr}\n` +
        (appointment.address ? `📍 ${appointment.address}\n` : '') +
        `\nМоля потвърдете присъствието си:`;

    const keyboard =
      hoursUntil === 24
        ? {
            inline_keyboard: [
              [
                { text: '✅ Потвърждавам', callback_data: `confirm_${appointment.id}` },
                ...(allowClientCancellation
                  ? [{ text: '❌ Отменям', callback_data: `cancel_client_${appointment.id}` }]
                  : []),
              ],
            ],
          }
        : undefined;

    return this.sendMessage(botToken, chatId, text, keyboard, template ? undefined : 'Markdown');
  }

  async sendProposalRequest(
    botToken: string,
    chatId: string,
    appointment: AppointmentDetails,
    businessName: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, "EEEE, d MMMM yyyy 'г.'", { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');

    const text =
      `🕓 *${businessName} — предложение за час*\n` +
      `─────────────────\n\n` +
      `*${appointment.clientName}*, предлагаме Ви:\n\n` +
      `🔧 *${appointment.serviceName}*\n` +
      `👤 *${appointment.staffName}*\n` +
      `📅 *${dateStr}*\n` +
      `🕐 *${timeStr}*\n` +
      (appointment.address ? `📍 *${appointment.address}*\n` : '') +
      `\nМоля, потвърдете дали този час Ви устройва.`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Приемам', callback_data: `proposal_accept_${appointment.id}` },
          { text: '❌ Отказвам', callback_data: `proposal_reject_${appointment.id}` },
        ],
      ],
    };

    return this.sendMessage(botToken, chatId, text, keyboard);
  }

  /**
   * Изпраща известяване за отмяна
   */
  async sendCancellation(
    botToken: string,
    chatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    cancelledBy: 'client' | 'owner',
    reason?: string,
    bookingUrl?: string,
    template?: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, "d MMMM", { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');

    const text = template
      ? renderNotificationTemplate(template, {
          Бизнес: businessName,
          Име: appointment.clientName,
          ПълноИме: appointment.clientName,
          Телефон: appointment.clientPhone,
          Услуга: appointment.serviceName,
          Специалист: appointment.staffName,
          Дата: dateStr,
          Час: timeStr,
          Адрес: appointment.address || '',
          Цена: appointment.price ? `${appointment.price} €` : '',
          Причина: reason || '',
        })
      : `❌ *${businessName} — Отменен час*\n` +
        `─────────────────\n\n` +
        `*${appointment.clientName}*, часът Ви на *${dateStr} в ${timeStr}* беше отменен` +
        (cancelledBy === 'owner' ? ' от нашия екип' : '') +
        '.\n' +
        (reason ? `\n📝 *Причина:* ${reason}\n` : '') +
        (cancelledBy === 'owner' && bookingUrl
          ? `\nМожете да запишете нов час тук:\n${bookingUrl}`
          : '\nАко желаете, можете да запишете нов час.');

    const keyboard =
      bookingUrl
        ? {
            inline_keyboard: [
              [{ text: '📅 Запиши нов час', url: bookingUrl }],
            ],
          }
        : undefined;

    return this.sendMessage(botToken, chatId, text, keyboard, template ? undefined : 'Markdown');
  }

  /**
   * Изпраща известяване до СОБСТВЕНИКА за нова резервация
   */
  async sendOwnerNewBooking(
    botToken: string,
    ownerChatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    status: 'confirmed' | 'pending',
    template?: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, "d.MM.yyyy", { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');
    const isRequested = status === 'pending';

    const text = template
      ? renderNotificationTemplate(template, {
          Бизнес: businessName,
          Име: appointment.clientName,
          ПълноИме: appointment.clientName,
          Телефон: appointment.clientPhone,
          Услуга: appointment.serviceName,
          Специалист: appointment.staffName,
          Дата: dateStr,
          Час: timeStr,
          Адрес: appointment.address || '',
          Цена: appointment.price ? `${appointment.price} €` : '',
        })
      : `🆕 *${isRequested ? 'Нова заявка' : 'Нова резервация'} — ${businessName}*\n` +
        `─────────────────\n\n` +
        `👤 *Клиент:* ${appointment.clientName}\n` +
        `📞 *Телефон:* ${appointment.clientPhone}\n` +
        `🔧 *Услуга:* ${appointment.serviceName}\n` +
        `👤 *Специалист:* ${appointment.staffName}\n` +
        `📅 *Дата:* ${dateStr} в ${timeStr}\n` +
        (appointment.price ? `💰 *Цена:* ${appointment.price} €\n` : '');

    const keyboard =
      isRequested
        ? {
            inline_keyboard: [
              [
                { text: '✅ Потвърди', callback_data: `owner_confirm_${appointment.id}` },
                { text: '❌ Откажи', callback_data: `owner_cancel_${appointment.id}` },
              ],
            ],
          }
        : undefined;

    return this.sendMessage(botToken, ownerChatId, text, keyboard, template ? undefined : 'Markdown');
  }

  async sendOwnerClientCancellation(
    botToken: string,
    ownerChatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    reason?: string,
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, 'd.MM.yyyy', { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');

    const text =
      `❌ *Клиентът отмени — ${businessName}*\n` +
      `─────────────────\n\n` +
      `👤 *Клиент:* ${appointment.clientName}\n` +
      `📞 *Телефон:* ${appointment.clientPhone}\n` +
      `🔧 *Услуга:* ${appointment.serviceName}\n` +
      `📅 *Дата:* ${dateStr} в ${timeStr}\n` +
      (reason ? `📝 *Причина:* ${reason}\n` : '');

    return this.sendMessage(botToken, ownerChatId, text, undefined, 'Markdown');
  }

  async sendOwnerProposalResponse(
    botToken: string,
    ownerChatId: string,
    appointment: AppointmentDetails,
    businessName: string,
    decision: 'accept' | 'reject',
  ): Promise<SendMessageResult> {
    const zonedStart = toZonedTime(appointment.startAt, TIMEZONE);
    const dateStr = format(zonedStart, 'd.MM.yyyy', { locale: bg });
    const timeStr = format(zonedStart, 'HH:mm');

    const text =
      `${decision === 'accept' ? '✅' : '❌'} *${businessName} — отговор по предложение*\n` +
      `─────────────────\n\n` +
      `👤 *Клиент:* ${appointment.clientName}\n` +
      `📞 *Телефон:* ${appointment.clientPhone}\n` +
      `🔧 *Услуга:* ${appointment.serviceName}\n` +
      `📅 *Предложен час:* ${dateStr} в ${timeStr}\n\n` +
      (decision === 'accept'
        ? 'Клиентът прие предложението.'
        : 'Клиентът отказа предложението.');

    return this.sendMessage(botToken, ownerChatId, text);
  }

  async sendOwnerPasswordRecovery(
    botToken: string,
    ownerChatId: string,
    businessName: string,
    resetUrl: string,
  ): Promise<SendMessageResult> {
    const text =
      `🔐 *${businessName} — възстановяване на достъпа*\n` +
      `─────────────────\n\n` +
      `Получена е заявка за смяна на паролата за admin входа.\n\n` +
      `Използвайте бутона по-долу, за да зададете нова парола. Линкът е валиден 30 минути.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🔑 Смени паролата', url: resetUrl }],
      ],
    };

    return this.sendMessage(botToken, ownerChatId, text, keyboard);
  }

  /**
   * Изпраща съобщение за рожден ден (маркетинг — само с consent)
   */
  async sendBirthdayGreeting(
    botToken: string,
    chatId: string,
    clientName: string,
    businessName: string,
    bookingUrl: string,
  ): Promise<SendMessageResult> {
    const text =
      `🎂 *Честит рожден ден, ${clientName}!*\n\n` +
      `Екипът на *${businessName}* Ви пожелава здраве и много поводи за усмивки!\n\n` +
      `🎁 По случай специалния ден — запишете час и получете малка изненада от нас.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '🎁 Запиши час', url: bookingUrl }],
      ],
    };

    return this.sendMessage(botToken, chatId, text, keyboard);
  }

  // ─── Core Telegram API ────────────────────────────────────────────────────

  async sendMessage(
    botToken: string,
    chatId: string,
    text: string,
    replyMarkup?: object,
    parseMode: 'Markdown' | undefined = 'Markdown',
  ): Promise<SendMessageResult> {
    try {
      const url = `${this.apiBase}${botToken}/sendMessage`;
      const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      };

      if (parseMode) {
        body.parse_mode = parseMode;
      }

      if (replyMarkup) {
        body.reply_markup = JSON.stringify(replyMarkup);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const data = await response.json() as { ok: boolean; result?: { message_id: number }; description?: string };

      if (!data.ok) {
        this.logger.warn(`Telegram API error: ${data.description}`);
        return { success: false, error: data.description };
      }

      return { success: true, messageId: data.result?.message_id };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Telegram send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Отговаря на callback query (бутоните в съобщенията)
   */
  async answerCallbackQuery(
    botToken: string,
    callbackQueryId: string,
    text: string,
    showAlert = false,
  ): Promise<void> {
    try {
      await fetch(`${this.apiBase}${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: callbackQueryId,
          text,
          show_alert: showAlert,
        }),
      });
    } catch (error) {
      this.logger.warn('answerCallbackQuery failed:', error);
    }
  }

  /**
   * Задава webhook за бота
   */
  async setWebhook(botToken: string, webhookUrl: string): Promise<TelegramWebhookResult> {
    const response = await fetch(`${this.apiBase}${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      }),
    });
    const data = await response.json() as { ok: boolean; description?: string; error_code?: number };
    return {
      ok: data.ok,
      description: this.normalizeTelegramDescription(data.description, data.error_code),
      errorCode: data.error_code,
    };
  }

  async getWebhookInfo(botToken: string): Promise<{
    ok: boolean;
    url?: string;
    pendingUpdateCount?: number;
    lastErrorMessage?: string;
    lastErrorDate?: number;
  }> {
    const response = await fetch(`${this.apiBase}${botToken}/getWebhookInfo`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as {
      ok: boolean;
      result?: {
        url: string;
        pending_update_count: number;
        last_error_message?: string;
        last_error_date?: number;
      };
    };

    return {
      ok: data.ok,
      url: data.result?.url,
      pendingUpdateCount: data.result?.pending_update_count,
      lastErrorMessage: data.result?.last_error_message,
      lastErrorDate: data.result?.last_error_date,
    };
  }

  async getBotProfile(botToken: string): Promise<TelegramBotProfileResult> {
    const response = await fetch(`${this.apiBase}${botToken}/getMe`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json() as {
      ok: boolean;
      result?: {
        username?: string;
        first_name?: string;
      };
      description?: string;
      error_code?: number;
    };

    return {
      ok: data.ok,
      username: data.result?.username,
      firstName: data.result?.first_name,
      description: this.normalizeTelegramDescription(data.description, data.error_code),
      errorCode: data.error_code,
    };
  }

  private normalizeTelegramDescription(description?: string, errorCode?: number) {
    if (errorCode === 404 || description === 'Not Found') {
      return 'Невалиден Bot Token.';
    }

    return description;
  }
}
