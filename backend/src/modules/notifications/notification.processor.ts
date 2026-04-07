import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { toZonedTime } from 'date-fns-tz';
import { TelegramService, AppointmentDetails } from './telegram.service';
import { SmsApiService } from './smsapi.service';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { NotificationJobType, NotificationChannel, NotificationStatus } from '../../common/types/enums';

const TIMEZONE = 'Europe/Sofia';

interface NotificationJobData {
  tenantId: string;
  tenantSchemaName: string;
  appointmentId: string;
  clientId: string;
  status?: string;
  reason?: string;
  newStatus?: string;
}

interface TenantConfig {
  telegram_bot_token: string;
  telegram_chat_id: string;
  business_name: string;
  address: string;
  slug: string;
  reminder_hours: number[];
}

interface AppointmentRow {
  id: string;
  start_at: Date;
  end_at: Date;
  price: number;
  client_name: string;
  client_phone: string;
  telegram_chat_id: string;
  preferred_channel: string;
  notifications_consent: boolean;
  service_name: string;
  staff_name: string;
}

/**
 * NotificationProcessor — BullMQ worker за изпращане на известявания.
 *
 * При всяко събитие (нова резервация, reminder и т.н.) се поставя job в queue-а.
 * Процесорът го взима, вика правилния канал (Telegram/SMS/Email),
 * и логва резултата в notifications_log таблицата на tenant-а.
 *
 * Retry logic: 3 опита с exponential backoff (5s, 25s, 125s)
 */
@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly telegramService: TelegramService,
    private readonly smsService: SmsApiService,
    private readonly prisma: TenantPrismaService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    this.logger.debug(`Processing job ${job.name} [${job.id}]`);

    const { tenantId, tenantSchemaName, appointmentId, clientId } = job.data;

    // 1. Вземи tenant конфигурацията
    const tenants = await this.prisma.queryInSchema<TenantConfig[]>(
      'public',
      `SELECT
        telegram_bot_token, telegram_chat_id,
        business_name, address, slug,
        reminder_hours
       FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (!tenants.length) {
      this.logger.error(`Tenant ${tenantId} not found`);
      return;
    }
    const tenant = tenants[0];

    if (!tenant.telegram_bot_token) {
      this.logger.warn(`Tenant ${tenantId} has no Telegram bot token — skipping`);
      return;
    }

    // 2. Вземи детайлите за резервацията
    const appointments = await this.prisma.queryInSchema<AppointmentRow[]>(
      tenantSchemaName,
      `SELECT
        a.id, a.start_at, a.end_at, a.price,
        c.name as client_name, c.phone as client_phone,
        c.telegram_chat_id, c.preferred_channel, c.notifications_consent,
        sv.name as service_name,
        s.name as staff_name
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services sv ON sv.id = a.service_id
       JOIN staff s ON s.id = a.staff_id
       WHERE a.id = $1`,
      [appointmentId],
    );

    if (!appointments.length) {
      this.logger.warn(`Appointment ${appointmentId} not found`);
      return;
    }
    const appt = appointments[0];

    // 3. Провери consent — не изпращаме без съгласие
    if (!appt.notifications_consent) {
      this.logger.debug(`Client ${clientId} has no notification consent — skipping`);
      return;
    }

    const appointmentDetails: AppointmentDetails = {
      id: appt.id,
      clientName: appt.client_name,
      clientPhone: appt.client_phone,
      serviceName: appt.service_name,
      staffName: appt.staff_name,
      startAt: new Date(appt.start_at),
      endAt: new Date(appt.end_at),
      price: appt.price,
      address: tenant.address,
    };

    const bookingUrl = `https://${tenant.slug}.saloniq.bg`;

    // 4. Изпрати правилното известяване
    let result: { success: boolean; messageId?: number; error?: string } | null = null;
    let notifType = job.name;

    switch (job.name as NotificationJobType) {
      case NotificationJobType.BOOKING_CONFIRMED:
        if (appt.telegram_chat_id) {
          result = await this.telegramService.sendBookingConfirmation(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            (job.data.status as 'confirmed' | 'pending') || 'confirmed',
          );
        }
        // Извести и собственика
        if (tenant.telegram_chat_id) {
          await this.telegramService.sendOwnerNewBooking(
            tenant.telegram_bot_token,
            tenant.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            (job.data.status as 'confirmed' | 'pending') || 'confirmed',
          );
        }
        break;

      case NotificationJobType.REMINDER_24H:
        if (appt.telegram_chat_id) {
          result = await this.telegramService.sendReminder(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            24,
          );
        }
        // Маркирай че е изпратен reminder
        await this.prisma.queryInSchema(
          tenantSchemaName,
          `UPDATE appointments SET reminder_24h_sent_at = NOW() WHERE id = $1`,
          [appointmentId],
        );
        break;

      case NotificationJobType.REMINDER_2H:
        if (appt.telegram_chat_id) {
          result = await this.telegramService.sendReminder(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            2,
          );
        }
        await this.prisma.queryInSchema(
          tenantSchemaName,
          `UPDATE appointments SET reminder_2h_sent_at = NOW() WHERE id = $1`,
          [appointmentId],
        );
        break;

      case NotificationJobType.STATUS_CHANGED:
      case NotificationJobType.BOOKING_CANCELLED_CLIENT:
      case NotificationJobType.BOOKING_CANCELLED_BUSINESS: {
        const cancelledBy = job.data.newStatus === 'cancelled' ? 'owner' : 'client';
        if (appt.telegram_chat_id) {
          result = await this.telegramService.sendCancellation(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            cancelledBy as 'client' | 'owner',
            job.data.reason,
            bookingUrl,
          );
        }
        break;
      }
    }

    // 5. Логвай резултата
    await this.prisma.queryInSchema(
      tenantSchemaName,
      `INSERT INTO notifications_log (
        appointment_id, client_id, channel, type, status,
        external_id, error_message, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        appointmentId,
        clientId,
        NotificationChannel.TELEGRAM,
        notifType,
        result?.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
        result?.messageId?.toString() || null,
        result?.error || null,
      ],
    );

    if (result && !result.success) {
      // BullMQ ще retry-не при throw
      throw new Error(`Notification failed: ${result.error}`);
    }
  }
}
