import { Controller, Post, Body, Param, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { TelegramService } from './telegram.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentStatus } from '../../common/types/enums';
import type { Tenant } from '@prisma/client';

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number; first_name: string };
    message: { message_id: number; chat: { id: number } };
    data: string;
  };
  message?: {
    message_id: number;
    from: { id: number; first_name: string };
    chat: { id: number };
    text: string;
  };
}

/**
 * TelegramWebhookController — приема webhook updates от Telegram.
 *
 * Когато клиент натисне бутон (Потвърждавам / Отменям),
 * Telegram изпраща callback_query към този endpoint.
 *
 * URL: POST /api/v1/webhooks/telegram/:tenantSlug
 * Всеки tenant има различен webhook URL (по slug)
 */
@ApiTags('webhooks')
@Controller({ path: 'webhooks/telegram', version: '1' })
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly telegramService: TelegramService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  @Post(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Telegram webhook за tenant' })
  async handleWebhook(
    @Param('slug') slug: string,
    @Body() update: TelegramUpdate,
  ) {
    // Намери tenant-а
    const tenants = await this.prisma.$queryRaw<(Tenant & { schema_name: string; telegram_bot_token: string; business_name: string })[]>`
      SELECT id, slug, schema_name, telegram_bot_token, business_name,
             cancellation_hours, address
      FROM public.tenants
      WHERE slug = ${slug} AND is_active = true
      LIMIT 1
    `;

    if (!tenants.length) {
      this.logger.warn(`Webhook received for unknown tenant: ${slug}`);
      return { ok: true }; // Отговаряме 200 за да не блокира Telegram
    }

    const tenant = tenants[0];

    // Обработи callback query (натиснат бутон)
    if (update.callback_query) {
      await this.handleCallbackQuery(tenant, update.callback_query);
    }

    // Обработи текстово съобщение
    if (update.message?.text) {
      await this.handleMessage(tenant, update.message);
    }

    return { ok: true };
  }

  private async handleCallbackQuery(
    tenant: any,
    callbackQuery: NonNullable<TelegramUpdate['callback_query']>,
  ) {
    const { id: queryId, data, message } = callbackQuery;
    const chatId = message.chat.id.toString();

    this.logger.log(`Callback from ${chatId}: ${data}`);

    try {
      // Формат: action_appointmentId
      // Пример: confirm_abc-123, cancel_client_abc-123, owner_confirm_abc-123

      if (data.startsWith('confirm_')) {
        const appointmentId = data.replace('confirm_', '');
        await this.handleClientConfirm(tenant, appointmentId, chatId, queryId);

      } else if (data.startsWith('cancel_client_')) {
        const appointmentId = data.replace('cancel_client_', '');
        await this.handleClientCancel(tenant, appointmentId, chatId, queryId);

      } else if (data.startsWith('owner_confirm_')) {
        const appointmentId = data.replace('owner_confirm_', '');
        await this.handleOwnerConfirm(tenant, appointmentId, chatId, queryId);

      } else if (data.startsWith('owner_cancel_')) {
        const appointmentId = data.replace('owner_cancel_', '');
        await this.handleOwnerCancel(tenant, appointmentId, chatId, queryId);
      }
    } catch (error) {
      this.logger.error(`Callback error: ${error}`);
      await this.telegramService.answerCallbackQuery(
        tenant.telegram_bot_token,
        queryId,
        '❌ Грешка. Моля, опитайте отново.',
        true,
      );
    }
  }

  private async handleClientConfirm(
    tenant: any,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    // Потвърждение на присъствие от клиента
    await this.prisma.queryInSchema(
      tenant.schema_name,
      `UPDATE appointments
       SET client_confirmed = true, client_confirmed_at = NOW()
       WHERE id = $1 AND status = 'confirmed'`,
      [appointmentId],
    );

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '✅ Благодарим! Очакваме Ви.',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `✅ *Потвърждението е записано!*\n\nБлагодарим Ви. Очакваме Ви на уречения час.`,
    );
  }

  private async handleClientCancel(
    tenant: any,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    const bookingUrl = `https://${tenant.slug}.saloniq.bg`;

    await this.appointmentsService.updateStatus(
      tenant,
      appointmentId,
      AppointmentStatus.CANCELLED,
      'Отменен от клиента чрез Telegram',
      'client',
    );

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '❌ Часът е отменен.',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `❌ *Часът е отменен.*\n\nАко желаете да запишете нов час:\n${bookingUrl}`,
    );
  }

  private async handleOwnerConfirm(
    tenant: any,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    await this.appointmentsService.updateStatus(
      tenant,
      appointmentId,
      AppointmentStatus.CONFIRMED,
    );

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '✅ Резервацията е потвърдена!',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `✅ Резервацията е *потвърдена*. Клиентът ще получи известяване.`,
    );
  }

  private async handleOwnerCancel(
    tenant: any,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    await this.appointmentsService.updateStatus(
      tenant,
      appointmentId,
      AppointmentStatus.CANCELLED,
      'Отменен от бизнеса',
      'owner',
    );

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '❌ Резервацията е отменена.',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `❌ Резервацията е *отменена*. Клиентът ще получи известяване.`,
    );
  }

  private async handleMessage(tenant: any, message: NonNullable<TelegramUpdate['message']>) {
    const chatId = message.chat.id.toString();
    const text = message.text?.toLowerCase().trim();

    // /start command — регистрира chat_id на клиент
    if (text === '/start' || text?.startsWith('/start ')) {
      await this.telegramService.sendMessage(
        tenant.telegram_bot_token,
        chatId,
        `👋 *Здравейте!*\n\nТова е официалният бот на *${tenant.business_name}*.\n\n` +
        `Ще получавате потвърждения и напомняния за вашите часове тук.\n\n` +
        `За записване на час: https://${tenant.slug}.saloniq.bg`,
      );

      // Запази chat_id ако има phone в payload
      const parts = message.text.split(' ');
      if (parts.length > 1) {
        const phone = parts[1]; // /start +359888123456
        await this.prisma.queryInSchema(
          tenant.schema_name,
          `UPDATE clients SET telegram_chat_id = $1 WHERE phone = $2`,
          [chatId, phone],
        );
      }
    }
  }
}
