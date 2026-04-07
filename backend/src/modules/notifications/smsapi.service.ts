import { Injectable, Logger } from '@nestjs/common';

/**
 * SmsApiService — интеграция с smsapi.bg
 * Документация: https://www.smsapi.bg/sms-api
 *
 * Fallback канал когато клиентът няма Telegram.
 */
@Injectable()
export class SmsApiService {
  private readonly logger = new Logger(SmsApiService.name);
  private readonly apiUrl = 'https://api.smsapi.bg/sms.do';

  async sendSms(
    to: string,
    message: string,
    senderId: string,
    apiToken: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const normalizedPhone = this.normalizePhone(to);
      if (!normalizedPhone) {
        return { success: false, error: `Невалиден телефон: ${to}` };
      }

      const params = new URLSearchParams({
        access_token: apiToken,
        to: normalizedPhone,
        message,
        from: senderId.substring(0, 11),
        format: 'json',
        encoding: 'utf-8',
      });

      const response = await fetch(`${this.apiUrl}?${params.toString()}`, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json() as any;

      if (data.error) {
        const errMsg = SMS_ERRORS[data.error] || `Грешка ${data.error}`;
        this.logger.warn(`smsapi.bg error to ${normalizedPhone}: ${errMsg}`);
        return { success: false, error: errMsg };
      }

      const messageId = data.list?.[0]?.id;
      this.logger.log(`SMS sent to ${normalizedPhone}, id=${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown';
      this.logger.error(`SMS send failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async sendBookingConfirmationSms(opts: {
    phone: string; clientName: string; businessName: string;
    serviceName: string; staffName: string; dateStr: string;
    timeStr: string; address?: string | null;
    apiToken: string; senderId: string;
  }) {
    const lines = [
      `✓ ${opts.businessName}`,
      `Здравейте, ${opts.clientName}!`,
      `${opts.serviceName} при ${opts.staffName}`,
      `${opts.dateStr} в ${opts.timeStr}`,
    ];
    if (opts.address) lines.push(opts.address);
    return this.sendSms(opts.phone, lines.join('\n'), opts.senderId, opts.apiToken);
  }

  async sendReminderSms(opts: {
    phone: string; clientName: string; businessName: string;
    serviceName: string; dateStr: string; timeStr: string;
    hoursUntil: 24 | 2; apiToken: string; senderId: string;
  }) {
    const timeLabel = opts.hoursUntil === 24 ? 'утре' : 'след 2 часа';
    const message =
      `${opts.businessName}: Напомняне\n` +
      `${opts.clientName}, час ${timeLabel}!\n` +
      `${opts.serviceName} в ${opts.timeStr}`;
    return this.sendSms(opts.phone, message, opts.senderId, opts.apiToken);
  }

  async sendCancellationSms(opts: {
    phone: string; clientName: string; businessName: string;
    dateStr: string; timeStr: string; reason?: string | null;
    apiToken: string; senderId: string;
  }) {
    const lines = [
      `${opts.businessName}: Отменен час`,
      `${opts.clientName}, часът Ви на ${opts.dateStr} в ${opts.timeStr} беше отменен.`,
    ];
    if (opts.reason) lines.push(`Причина: ${opts.reason}`);
    return this.sendSms(opts.phone, lines.join('\n'), opts.senderId, opts.apiToken);
  }

  private normalizePhone(phone: string): string | null {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('0')) cleaned = '+359' + cleaned.substring(1);
    else if (cleaned.startsWith('359') && !cleaned.startsWith('+')) cleaned = '+' + cleaned;
    if (!/^\+[1-9]\d{7,14}$/.test(cleaned)) return null;
    return cleaned;
  }
}

const SMS_ERRORS: Record<number, string> = {
  8: 'Грешен username/парола', 50: 'Недостатъчен кредит',
  54: 'Невалиден получател', 101: 'Невалиден access_token',
};
