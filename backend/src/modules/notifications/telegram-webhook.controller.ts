import { Controller, Post, Body, Param, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { TelegramService } from './telegram.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentStatus } from '../../common/types/enums';
import type { Tenant } from '@prisma/client';
import { buildBulgarianPhoneVariants, normalizeBulgarianPhone } from '../../common/utils/phone';

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

interface TenantWebhookRow {
  id: string;
  slug: string;
  schema_name: string;
  telegram_bot_token: string;
  business_name: string;
  custom_domain?: string | null;
  telegram_chat_id?: string | null;
  address?: string | null;
  theme_config?: unknown;
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
    const tenants = await this.prisma.$queryRaw<TenantWebhookRow[]>`
      SELECT id, slug, schema_name, telegram_bot_token, business_name,
             custom_domain,
             theme_config,
             telegram_chat_id, cancellation_hours, address
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
      } else if (data.startsWith('proposal_accept_')) {
        const appointmentId = data.replace('proposal_accept_', '');
        await this.handleProposalAccept(tenant, appointmentId, chatId, queryId);
      } else if (data.startsWith('proposal_reject_')) {
        const appointmentId = data.replace('proposal_reject_', '');
        await this.handleProposalReject(tenant, appointmentId, chatId, queryId);
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

  private async handleProposalAccept(
    tenant: TenantWebhookRow,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    const details = await this.loadAppointmentDetailsForTelegram(tenant, appointmentId);
    await this.appointmentsService.respondToProposal(tenant as unknown as Tenant, appointmentId, 'accept');

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '✅ Предложението е прието.',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `✅ *Часът е потвърден.*\n\nЩе получите напомняне преди посещението.`,
    );

    if (tenant.telegram_chat_id && details) {
      await this.telegramService.sendOwnerProposalResponse(
        tenant.telegram_bot_token,
        tenant.telegram_chat_id,
        details,
        tenant.business_name,
        'accept',
      );
    }
  }

  private async handleProposalReject(
    tenant: TenantWebhookRow,
    appointmentId: string,
    chatId: string,
    queryId: string,
  ) {
    const details = await this.loadAppointmentDetailsForTelegram(tenant, appointmentId);
    await this.appointmentsService.respondToProposal(tenant as unknown as Tenant, appointmentId, 'reject');

    await this.telegramService.answerCallbackQuery(
      tenant.telegram_bot_token,
      queryId,
      '❌ Предложението е отказано.',
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `❌ *Предложението е отказано.*\n\nАко е нужно, ще получите ново предложение от салона.`,
    );

    if (tenant.telegram_chat_id && details) {
      await this.telegramService.sendOwnerProposalResponse(
        tenant.telegram_bot_token,
        tenant.telegram_chat_id,
        details,
        tenant.business_name,
        'reject',
      );
    }
  }

  private async handleMessage(tenant: any, message: NonNullable<TelegramUpdate['message']>) {
    const chatId = message.chat.id.toString();
    const rawText = message.text?.trim() || '';
    const text = rawText.toLowerCase();
    const bookingUrl = tenant.custom_domain ? `https://${tenant.custom_domain}` : null;
    const possiblePhone = normalizeBulgarianPhone(rawText);
    const possiblePhoneVariants = buildBulgarianPhoneVariants(possiblePhone);

    // /start command — регистрира chat_id на клиент
    if (text === '/start' || text?.startsWith('/start ')) {
      const payload = rawText.split(/\s+/, 2)[1]?.trim() || '';

      if (payload.startsWith('owner_setup_')) {
        await this.handleOwnerSetupStart(tenant, chatId, payload.replace('owner_setup_', ''));
        return;
      }

      await this.telegramService.sendMessage(
        tenant.telegram_bot_token,
        chatId,
        `👋 *Здравейте!*\n\nТова е официалният бот на *${tenant.business_name}*.\n\n` +
        `Ще получавате потвърждения и напомняния за вашите часове тук.\n\n` +
        `За автоматично свързване използвайте бутона след резервация, или изпратете телефона си в този чат.` +
        (bookingUrl ? `\n\nЗа записване на час: ${bookingUrl}` : ''),
      );

      // Запази chat_id ако има phone в payload
      const parts = rawText.split(' ');
      if (parts.length > 1) {
        const startPayload = parts[1].startsWith('phone_') ? parts[1].replace('phone_', '') : parts[1];
        const phone = normalizeBulgarianPhone(startPayload);
        const phoneVariants = buildBulgarianPhoneVariants(phone);

        if (!phoneVariants.length) {
          return;
        }

        await this.prisma.queryInSchema(
          tenant.schema_name,
          `UPDATE clients SET telegram_chat_id = $1 WHERE phone = ANY($2::text[])`,
          [chatId, phoneVariants],
        );

        await this.telegramService.sendMessage(
          tenant.telegram_bot_token,
          chatId,
          `✅ Чатът е свързан успешно с Вашия телефон и ще получавате известия от *${tenant.business_name}*.`,
        );
      }

      return;
    }

    if (possiblePhoneVariants.length) {
      const updateResult = await this.prisma.queryInSchema<{ id: string }[]>(
        tenant.schema_name,
        `UPDATE clients
         SET telegram_chat_id = $1
         WHERE phone = ANY($2::text[])
         RETURNING id`,
        [chatId, possiblePhoneVariants],
      );

      if (updateResult.length > 0) {
        await this.telegramService.sendMessage(
          tenant.telegram_bot_token,
          chatId,
          `✅ Чатът е свързан успешно с Вашия телефон и ще получавате известия от *${tenant.business_name}*.`,
        );
        return;
      }
    }
  }

  private async handleOwnerSetupStart(
    tenant: TenantWebhookRow,
    chatId: string,
    setupToken: string,
  ) {
    const theme =
      typeof tenant.theme_config === 'string'
        ? JSON.parse(tenant.theme_config || '{}')
        : (tenant.theme_config || {});

    const storedToken = typeof theme.telegramOwnerSetupToken === 'string' ? theme.telegramOwnerSetupToken : '';
    const expiresAt =
      typeof theme.telegramOwnerSetupExpiresAt === 'string'
        ? new Date(theme.telegramOwnerSetupExpiresAt)
        : null;

    const isExpired = Boolean(expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now());

    if (!storedToken || storedToken !== setupToken || isExpired) {
      await this.telegramService.sendMessage(
        tenant.telegram_bot_token,
        chatId,
        `⚠️ Тази връзка за свързване е невалидна или е изтекла.\n\nВърнете се в админ панела и натиснете отново "Отвори моя бот".`,
      );
      return;
    }

    const nextTheme = {
      ...theme,
      telegramOwnerSetupToken: null,
      telegramOwnerSetupExpiresAt: null,
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET telegram_chat_id = $1,
          theme_config = $2::jsonb,
          updated_at = NOW()
      WHERE id = $3::uuid
      `,
      chatId,
      JSON.stringify(nextTheme),
      tenant.id,
    );

    await this.telegramService.sendMessage(
      tenant.telegram_bot_token,
      chatId,
      `✅ *Telegram е свързан успешно.*\n\nОттук нататък ще получавате owner известията за *${tenant.business_name}* в този чат.`,
    );
  }

  private async loadAppointmentDetailsForTelegram(tenant: TenantWebhookRow, appointmentId: string) {
    const [row] = await this.prisma.queryInSchema<any[]>(
      tenant.schema_name,
      `
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.price,
        COALESCE(NULLIF(c.profile_data->>'salutation', ''), split_part(c.name, ' ', 1)) as client_name,
        c.phone as client_phone,
        sv.name as service_name,
        s.name as staff_name
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services sv ON sv.id = a.service_id
      JOIN staff s ON s.id = a.staff_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!row) return null;

    return {
      id: row.id,
      clientName: row.client_name,
      clientPhone: row.client_phone,
      serviceName: row.service_name,
      staffName: row.staff_name,
      startAt: new Date(row.start_at),
      endAt: new Date(row.end_at),
      price: row.price,
      address: tenant.address || undefined,
    };
  }
}
