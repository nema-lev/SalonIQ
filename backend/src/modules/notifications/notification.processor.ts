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
import { getNotificationTemplates } from './template.utils';

const TIMEZONE = 'Europe/Sofia';

interface NotificationJobData {
  tenantId: string;
  tenantSchemaName: string;
  appointmentId?: string;
  clientId?: string;
  waitlistEntryId?: string;
  slotStartAt?: string;
  slotStaffId?: string;
  publicBaseUrl?: string;
  status?: string;
  reason?: string;
  newStatus?: string;
  previousStatus?: string;
  cancelledBy?: 'client' | 'owner';
}

interface TenantConfig {
  telegram_bot_token: string;
  telegram_chat_id: string;
  sms_api_key: string | null;
  sms_sender_id: string | null;
  business_name: string;
  address: string;
  slug: string;
  custom_domain?: string | null;
  cancellation_hours?: number | null;
  reminder_hours: number[];
  theme_config: unknown;
}

interface AppointmentRow {
  id: string;
  start_at: Date;
  end_at: Date;
  price: number;
  client_name: string;
  client_salutation: string;
  client_phone: string;
  telegram_chat_id: string;
  preferred_channel: string;
  notifications_consent: boolean;
  intake_data: unknown;
  profile_data: unknown;
  service_name: string;
  staff_name: string;
}

interface WaitlistNotificationRow {
  waitlist_id: string;
  client_id: string;
  client_name: string;
  client_salutation: string;
  client_phone: string;
  telegram_chat_id: string | null;
  notifications_consent: boolean;
  service_name: string;
  service_duration_minutes: number;
  staff_name: string | null;
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
        sms_api_key, sms_sender_id,
        business_name, address, slug, custom_domain, cancellation_hours,
        reminder_hours, theme_config
       FROM tenants WHERE id = $1::uuid`,
      [tenantId],
    );

    if (!tenants.length) {
      this.logger.error(`Tenant ${tenantId} not found`);
      return;
    }
    const tenant = tenants[0];
    const themeConfig =
      typeof tenant.theme_config === 'string'
        ? JSON.parse(tenant.theme_config || '{}')
        : (tenant.theme_config || {});
    const allowClientCancellation = themeConfig.allowClientCancellation ?? true;
    const cancellationHours = Number(tenant.cancellation_hours ?? 0);
    const canClientCancel = allowClientCancellation && cancellationHours > 0;
    const notificationTemplates = getNotificationTemplates(themeConfig);
    const telegramChannelEnabled = themeConfig.enableTelegramNotifications ?? true;
    const smsChannelEnabled = themeConfig.enableSmsNotifications ?? Boolean(tenant.sms_api_key && tenant.sms_sender_id);

    const hasTelegram = telegramChannelEnabled && Boolean(tenant.telegram_bot_token);
    const hasSms = smsChannelEnabled && Boolean(tenant.sms_api_key && tenant.sms_sender_id);

    if (!hasTelegram && !hasSms) {
      this.logger.warn(`Tenant ${tenantId} has no Telegram or SMS configuration — skipping`);
      return;
    }

    if (job.name === NotificationJobType.WAITLIST_AVAILABLE) {
      const waitlistEntryId = job.data.waitlistEntryId;
      if (!waitlistEntryId) {
        this.logger.warn(`Waitlist notification without waitlistEntryId for tenant ${tenantId}`);
        return;
      }

      const waitlistRows = await this.prisma.queryInSchema<WaitlistNotificationRow[]>(
        tenantSchemaName,
        `
        SELECT
          w.id as waitlist_id,
          c.id as client_id,
          c.name as client_name,
          COALESCE(NULLIF(c.profile_data->>'salutation', ''), split_part(c.name, ' ', 1)) as client_salutation,
          c.phone as client_phone,
          c.telegram_chat_id,
          c.notifications_consent,
          sv.name as service_name,
          sv.duration_minutes as service_duration_minutes,
          s.name as staff_name
        FROM waitlist w
        JOIN clients c ON c.id = w.client_id
        JOIN services sv ON sv.id = w.service_id
        LEFT JOIN staff s ON s.id = COALESCE($2::uuid, w.staff_id)
        WHERE w.id = $1::uuid
        LIMIT 1
        `,
        [waitlistEntryId, job.data.slotStaffId || null],
      );

      if (!waitlistRows.length) {
        this.logger.warn(`Waitlist entry ${waitlistEntryId} not found`);
        return;
      }

      const waitlist = waitlistRows[0];
      const slotStartAt = job.data.slotStartAt ? new Date(job.data.slotStartAt) : null;
      if (!slotStartAt || Number.isNaN(slotStartAt.getTime())) {
        this.logger.warn(`Waitlist notification ${waitlistEntryId} missing slotStartAt`);
        return;
      }

      const slotEndAt = new Date(slotStartAt.getTime() + waitlist.service_duration_minutes * 60 * 1000);
      const waitlistDetails: AppointmentDetails = {
        id: waitlist.waitlist_id,
        clientName: waitlist.client_salutation || waitlist.client_name,
        clientPhone: waitlist.client_phone,
        serviceName: waitlist.service_name,
        staffName: waitlist.staff_name || 'Първи свободен специалист',
        startAt: slotStartAt,
        endAt: slotEndAt,
        address: tenant.address,
      };
      const bookingUrl: string | undefined =
        (tenant.custom_domain ? `https://${tenant.custom_domain}` : null) ||
        (typeof job.data.publicBaseUrl === 'string' ? job.data.publicBaseUrl.trim().replace(/\/$/, '') : null) ||
        undefined;

      let waitlistResult: { success: boolean; messageId?: number; error?: string } | null = null;
      let waitlistChannel: NotificationChannel = NotificationChannel.TELEGRAM;

      if (waitlist.notifications_consent && hasTelegram && waitlist.telegram_chat_id) {
        waitlistChannel = NotificationChannel.TELEGRAM;
        waitlistResult = await this.telegramService.sendWaitlistAvailable(
          tenant.telegram_bot_token,
          waitlist.telegram_chat_id,
          waitlistDetails,
          tenant.business_name,
          bookingUrl,
        );
      } else if (waitlist.notifications_consent && hasSms) {
        const zonedStart = toZonedTime(waitlistDetails.startAt, TIMEZONE);
        waitlistChannel = NotificationChannel.SMS;
        const smsResult = await this.smsService.sendWaitlistAvailableSms({
          phone: waitlistDetails.clientPhone,
          clientName: waitlistDetails.clientName,
          businessName: tenant.business_name,
          serviceName: waitlistDetails.serviceName,
          staffName: waitlistDetails.staffName,
          dateStr: format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg }),
          timeStr: format(zonedStart, 'HH:mm'),
          bookingUrl,
          apiToken: tenant.sms_api_key!,
          senderId: tenant.sms_sender_id!,
        });
        waitlistResult = {
          success: smsResult.success,
          error: smsResult.error,
        };
      }

      if (!waitlistResult) {
        this.logger.debug(
          `No eligible waitlist channel for entry ${waitlistEntryId} (consent=${waitlist.notifications_consent}, telegram=${Boolean(waitlist.telegram_chat_id)}, hasTelegram=${hasTelegram}, hasSms=${hasSms})`,
        );
        return;
      }

      await this.prisma.queryInSchema(
        tenantSchemaName,
        `INSERT INTO notifications_log (
          appointment_id, client_id, channel, type, status,
          external_id, error_message, sent_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
        [
          appointmentId || null,
          waitlist.client_id,
          waitlistChannel,
          NotificationJobType.WAITLIST_AVAILABLE,
          waitlistResult.success ? NotificationStatus.SENT : NotificationStatus.FAILED,
          waitlistResult.messageId?.toString() || null,
          waitlistResult.error || null,
        ],
      );

      if (!waitlistResult.success) {
        throw new Error(`Notification failed: ${waitlistResult.error}`);
      }

      return;
    }

    // 2. Вземи детайлите за резервацията
    const appointments = await this.prisma.queryInSchema<AppointmentRow[]>(
      tenantSchemaName,
      `SELECT
        a.id, a.start_at, a.end_at, a.price, a.intake_data,
        c.name as client_name,
        COALESCE(NULLIF(c.profile_data->>'salutation', ''), split_part(c.name, ' ', 1)) as client_salutation,
        c.phone as client_phone,
        c.telegram_chat_id, c.preferred_channel, c.notifications_consent,
        c.profile_data,
        sv.name as service_name,
        s.name as staff_name
       FROM appointments a
       JOIN clients c ON c.id = a.client_id
       JOIN services sv ON sv.id = a.service_id
       JOIN staff s ON s.id = a.staff_id
       WHERE a.id = $1::uuid`,
      [appointmentId],
    );

    if (!appointments.length) {
      this.logger.warn(`Appointment ${appointmentId} not found`);
      return;
    }
    const appt = appointments[0];

    const canNotifyClient = Boolean(appt.notifications_consent);

    const resolvedClientDisplayName = this.resolveClientDisplayName(
      appt.client_name,
      appt.client_salutation,
      appt.profile_data,
    );

    const appointmentDetails: AppointmentDetails = {
      id: appt.id,
      clientName: resolvedClientDisplayName,
      clientPhone: appt.client_phone,
      serviceName: appt.service_name,
      staffName: appt.staff_name,
      startAt: new Date(appt.start_at),
      endAt: new Date(appt.end_at),
      price: appt.price,
      address: tenant.address,
    };

    let intakeData: Record<string, any> = {};
    if (typeof appt.intake_data === 'string') {
      try {
        intakeData = JSON.parse(appt.intake_data || '{}');
      } catch {
        intakeData = {};
      }
    } else if (appt.intake_data && typeof appt.intake_data === 'object') {
      intakeData = appt.intake_data as Record<string, any>;
    }
    const bookingUrl: string | undefined =
      (tenant.custom_domain ? `https://${tenant.custom_domain}` : null) ||
      (typeof intakeData.publicBaseUrl === 'string' ? intakeData.publicBaseUrl.trim().replace(/\/$/, '') : null) ||
      undefined;
    const proposal = intakeData?.proposal as
      | { publicBaseUrl?: string | null; acceptToken?: string; rejectToken?: string }
      | undefined;
    const acceptUrl =
      proposal?.publicBaseUrl && proposal?.acceptToken
        ? `${proposal.publicBaseUrl}/api/v1/appointments/proposal/${tenant.slug}/respond?decision=accept&token=${proposal.acceptToken}`
        : null;
    const rejectUrl =
      proposal?.publicBaseUrl && proposal?.rejectToken
        ? `${proposal.publicBaseUrl}/api/v1/appointments/proposal/${tenant.slug}/respond?decision=reject&token=${proposal.rejectToken}`
        : null;

    if (
      hasTelegram &&
      tenant.telegram_chat_id &&
      job.name === NotificationJobType.BOOKING_CONFIRMED
    ) {
      await this.telegramService.sendOwnerNewBooking(
        tenant.telegram_bot_token,
        tenant.telegram_chat_id,
        { ...appointmentDetails, clientName: resolvedClientDisplayName },
        tenant.business_name,
        (job.data.status as 'confirmed' | 'pending') || 'confirmed',
        notificationTemplates.ownerNewBooking,
      );
    }

    if (
      hasTelegram &&
      tenant.telegram_chat_id &&
      job.data.newStatus === 'cancelled' &&
      job.data.cancelledBy === 'client'
    ) {
      await this.telegramService.sendOwnerClientCancellation(
        tenant.telegram_bot_token,
        tenant.telegram_chat_id,
        { ...appointmentDetails, clientName: resolvedClientDisplayName },
        tenant.business_name,
        job.data.reason,
      );
    }

    if (!canNotifyClient) {
      this.logger.debug(`Client ${clientId} has no notification consent — skipping client-facing notification`);
      return;
    }

    // 4. Изпрати правилното известяване
    let result: { success: boolean; messageId?: number; error?: string } | null = null;
    let notifType = job.name;
    let resultChannel: NotificationChannel = NotificationChannel.TELEGRAM;

    switch (job.name as NotificationJobType) {
      case NotificationJobType.BOOKING_PROPOSAL:
        if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
          resultChannel = NotificationChannel.TELEGRAM;
          result = await this.telegramService.sendProposalRequest(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
          );
        } else if (canNotifyClient && hasSms && acceptUrl && rejectUrl) {
          const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
          const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
          const timeStr = format(zonedStart, 'HH:mm');
          const smsResult = await this.smsService.sendProposalSms({
            phone: appointmentDetails.clientPhone,
            clientName: appointmentDetails.clientName,
            businessName: tenant.business_name,
            serviceName: appointmentDetails.serviceName,
            dateStr,
            timeStr,
            acceptUrl,
            rejectUrl,
            apiToken: tenant.sms_api_key!,
            senderId: tenant.sms_sender_id!,
          });
          resultChannel = NotificationChannel.SMS;
          result = {
            success: smsResult.success,
            error: smsResult.error,
          };
        }
        break;

      case NotificationJobType.BOOKING_CONFIRMED:
        if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
          resultChannel = NotificationChannel.TELEGRAM;
          result = await this.telegramService.sendBookingConfirmation(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            (job.data.status as 'confirmed' | 'pending') || 'confirmed',
            cancellationHours,
            (job.data.status as 'confirmed' | 'pending') === 'pending'
              ? notificationTemplates.bookingPending
              : notificationTemplates.bookingConfirmed,
          );
        } else if (canNotifyClient && hasSms) {
          const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
          const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
          const timeStr = format(zonedStart, 'HH:mm');
          const smsResult = await this.smsService.sendBookingConfirmationSms({
            phone: appointmentDetails.clientPhone,
            clientName: appointmentDetails.clientName,
            businessName: tenant.business_name,
            serviceName: appointmentDetails.serviceName,
            staffName: appointmentDetails.staffName,
            dateStr,
            timeStr,
            address: appointmentDetails.address,
            apiToken: tenant.sms_api_key!,
            senderId: tenant.sms_sender_id!,
          });
          resultChannel = NotificationChannel.SMS;
          result = { success: smsResult.success, error: smsResult.error };
        }
        break;

      case NotificationJobType.REMINDER_24H:
        if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
          resultChannel = NotificationChannel.TELEGRAM;
          result = await this.telegramService.sendReminder(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            24,
            cancellationHours,
            notificationTemplates.reminder24h,
          );
        } else if (canNotifyClient && hasSms) {
          const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
          const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
          const timeStr = format(zonedStart, 'HH:mm');
          const smsResult = await this.smsService.sendReminderSms({
            phone: appointmentDetails.clientPhone,
            clientName: appointmentDetails.clientName,
            businessName: tenant.business_name,
            serviceName: appointmentDetails.serviceName,
            dateStr,
            timeStr,
            hoursUntil: 24,
            apiToken: tenant.sms_api_key!,
            senderId: tenant.sms_sender_id!,
          });
          resultChannel = NotificationChannel.SMS;
          result = { success: smsResult.success, error: smsResult.error };
        }
        // Маркирай че е изпратен reminder
        await this.prisma.queryInSchema(
          tenantSchemaName,
          `UPDATE appointments SET reminder_24h_sent_at = NOW() WHERE id = $1::uuid`,
          [appointmentId],
        );
        break;

      case NotificationJobType.REMINDER_2H:
        if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
          resultChannel = NotificationChannel.TELEGRAM;
          result = await this.telegramService.sendReminder(
            tenant.telegram_bot_token,
            appt.telegram_chat_id,
            appointmentDetails,
            tenant.business_name,
            2,
            cancellationHours,
            notificationTemplates.reminder2h,
          );
        } else if (canNotifyClient && hasSms) {
          const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
          const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
          const timeStr = format(zonedStart, 'HH:mm');
          const smsResult = await this.smsService.sendReminderSms({
            phone: appointmentDetails.clientPhone,
            clientName: appointmentDetails.clientName,
            businessName: tenant.business_name,
            serviceName: appointmentDetails.serviceName,
            dateStr,
            timeStr,
            hoursUntil: 2,
            apiToken: tenant.sms_api_key!,
            senderId: tenant.sms_sender_id!,
          });
          resultChannel = NotificationChannel.SMS;
          result = { success: smsResult.success, error: smsResult.error };
        }
        await this.prisma.queryInSchema(
          tenantSchemaName,
          `UPDATE appointments SET reminder_2h_sent_at = NOW() WHERE id = $1::uuid`,
          [appointmentId],
        );
        break;

      case NotificationJobType.STATUS_CHANGED:
      case NotificationJobType.BOOKING_CANCELLED_CLIENT:
      case NotificationJobType.BOOKING_CANCELLED_BUSINESS: {
        if (job.data.newStatus === 'confirmed') {
          if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
            resultChannel = NotificationChannel.TELEGRAM;
            result = await this.telegramService.sendBookingConfirmation(
              tenant.telegram_bot_token,
              appt.telegram_chat_id,
              appointmentDetails,
              tenant.business_name,
              'confirmed',
              cancellationHours,
              notificationTemplates.bookingConfirmed,
            );
          } else if (canNotifyClient && hasSms) {
            const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
            const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
            const timeStr = format(zonedStart, 'HH:mm');
            const smsResult = await this.smsService.sendBookingConfirmationSms({
              phone: appointmentDetails.clientPhone,
              clientName: appointmentDetails.clientName,
              businessName: tenant.business_name,
              serviceName: appointmentDetails.serviceName,
              staffName: appointmentDetails.staffName,
              dateStr,
              timeStr,
              address: appointmentDetails.address,
              apiToken: tenant.sms_api_key!,
              senderId: tenant.sms_sender_id!,
            });
            resultChannel = NotificationChannel.SMS;
            result = { success: smsResult.success, error: smsResult.error };
          }
          break;
        }

        if (job.data.newStatus === 'cancelled') {
          const cancelledBy = job.name === NotificationJobType.BOOKING_CANCELLED_CLIENT ? 'client' : 'owner';
          const notificationFlow =
            cancelledBy === 'owner' &&
            (job.data.previousStatus === 'pending' || job.data.previousStatus === 'proposal_pending')
              ? 'rejected'
              : 'cancelled';
          if (canNotifyClient && hasTelegram && appt.telegram_chat_id) {
            resultChannel = NotificationChannel.TELEGRAM;
            result = await this.telegramService.sendCancellation(
              tenant.telegram_bot_token,
              appt.telegram_chat_id,
              appointmentDetails,
              tenant.business_name,
              cancelledBy,
              notificationFlow,
              job.data.reason,
              bookingUrl,
              notificationFlow === 'cancelled' ? notificationTemplates.cancellation : undefined,
            );
          } else if (canNotifyClient && hasSms) {
            const zonedStart = toZonedTime(appointmentDetails.startAt, TIMEZONE);
            const dateStr = format(zonedStart, "d MMMM yyyy 'г.'", { locale: bg });
            const timeStr = format(zonedStart, 'HH:mm');
            const smsResult = await this.smsService.sendCancellationSms({
              phone: appointmentDetails.clientPhone,
              clientName: appointmentDetails.clientName,
              businessName: tenant.business_name,
              dateStr,
              timeStr,
              flow: notificationFlow,
              reason: job.data.reason,
              apiToken: tenant.sms_api_key!,
              senderId: tenant.sms_sender_id!,
            });
            resultChannel = NotificationChannel.SMS;
            result = { success: smsResult.success, error: smsResult.error };
          }
        }
        break;
      }
    }

    if (!result) {
      this.logger.debug(
        `No eligible notification channel for appointment ${appointmentId} (consent=${appt.notifications_consent}, clientTelegram=${Boolean(appt.telegram_chat_id)}, hasTelegram=${hasTelegram}, hasSms=${hasSms}, preferredChannel=${appt.preferred_channel || 'none'})`,
      );
      return;
    }

    // 5. Логвай резултата
    await this.prisma.queryInSchema(
      tenantSchemaName,
       `INSERT INTO notifications_log (
        appointment_id, client_id, channel, type, status,
        external_id, error_message, sent_at
      ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, NOW())`,
      [
        appointmentId,
        clientId,
        resultChannel,
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

  private resolveClientDisplayName(
    currentName: string,
    salutation: string,
    profileDataRaw: unknown,
  ) {
    const profileData = this.parseProfileData(profileDataRaw);
    const originalClientName =
      typeof profileData.originalClientName === 'string' ? profileData.originalClientName.trim() : '';
    const preferred = this.pickNonGenericName(currentName, originalClientName, salutation);
    return preferred || currentName || salutation || 'Клиент';
  }

  private parseProfileData(value: unknown) {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value || '{}') as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    if (typeof value === 'object') {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private pickNonGenericName(...candidates: Array<string | undefined | null>) {
    for (const raw of candidates) {
      const value = (raw || '').trim();
      if (!value) continue;
      const normalized = value.toLocaleLowerCase('bg-BG');
      if (
        ['пълно име', 'две имена', 'име', 'вашето име', 'твоето име', 'full name', 'name', 'your name'].includes(normalized)
      ) {
        continue;
      }
      return value;
    }
    return '';
  }
}
