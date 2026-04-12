import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { addMinutes, isBefore, isAfter, addHours, startOfDay, endOfDay, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { randomUUID } from 'crypto';

import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentStatus, NotificationJobType } from '../../common/types/enums';
import { buildBulgarianPhoneVariants, normalizeBulgarianPhone } from '../../common/utils/phone';
import type { Tenant } from '@prisma/client';
import { NotificationProcessor } from '../notifications/notification.processor';

const TIMEZONE = 'Europe/Sofia';

type AppointmentBookedBy = 'client' | 'owner' | 'staff';
type ProposalKind = 'admin_inquiry' | 'counter_offer';
type ProposalDecision = 'accept' | 'reject';
type UpcomingMode = 'all' | 'attention' | 'pending';
type SlotResult = { start: string; end: string; remainingSpots?: number; capacity?: number };

interface ProposalMetadata {
  kind: ProposalKind;
  publicBaseUrl: string | null;
  acceptToken: string;
  rejectToken: string;
  originalStatus: AppointmentStatus | null;
  originalStartAt: string | null;
  originalEndAt: string | null;
  requestedAt: string;
  ownerAlertState: '' | 'proposal_accepted' | 'proposal_rejected';
  lastDecision?: ProposalDecision;
}

interface IntakeDataWithProposal {
  proposal?: ProposalMetadata;
  ownerActionAlert?: '' | 'client_cancelled';
  stateMeta?: OwnerStateMeta;
  [key: string]: unknown;
}

interface ClientProfileData {
  salutation?: string;
  nameSource?: 'owner' | 'client_submitted';
  originalClientName?: string;
}

type OwnerStateKind =
  | 'requested'
  | 'proposal_sent'
  | 'approved'
  | 'booked_direct'
  | 'proposal_accepted'
  | 'rejected'
  | 'proposal_rejected'
  | 'cancelled_by_owner'
  | 'cancelled_by_client'
  | 'completed'
  | 'no_show';

interface OwnerStateMeta {
  transitionKind: OwnerStateKind;
  fromStatus: string | null;
  toStatus: string;
  updatedAt: string;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
    private readonly notificationProcessor: NotificationProcessor,
  ) {}

  async createByAdmin(tenant: Tenant, dto: CreateAppointmentDto) {
    return this.create(tenant, dto, {
      forceConfirmed: !dto.askClient,
      askClient: Boolean(dto.askClient),
      bookedBy: 'owner',
      publicBaseUrl: dto.publicBaseUrl,
    });
  }

  /**
   * Получава всички резервации за даден ден (за admin календара)
   */
  async findByDate(tenant: Tenant, date: Date, staffId?: string) {
    const zonedDate = toZonedTime(date, TIMEZONE);
    const dayStart = fromZonedTime(startOfDay(zonedDate), TIMEZONE);
    const dayEnd = fromZonedTime(endOfDay(zonedDate), TIMEZONE);

    const rows = await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      SELECT
        a.*,
        c.name as client_name, c.phone as client_phone, c.telegram_chat_id,
        s.name as staff_name, s.color as staff_color,
        sv.name as service_name, sv.color as service_color, sv.duration_minutes
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN staff s ON s.id = a.staff_id
      JOIN services sv ON sv.id = a.service_id
      WHERE a.start_at >= $1
        AND a.start_at < $2
        ${staffId ? 'AND a.staff_id = $3::uuid' : ''}
      ORDER BY a.start_at ASC
      `,
      staffId ? [dayStart, dayEnd, staffId] : [dayStart, dayEnd],
    );

    return rows;
  }

  async getCalendarBoard(tenant: Tenant, from: Date, to: Date, staffId?: string) {
    const fromUtc = new Date(from);
    const toUtc = new Date(to);

    const staffRows = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT id, name, color, is_active, accepts_online, working_hours
      FROM staff
      WHERE is_active = true
        ${staffId ? 'AND id = $1::uuid' : ''}
      ORDER BY name ASC
      `,
      staffId ? [staffId] : [],
    );

    const appointments = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        a.*,
        c.name as client_name,
        c.phone as client_phone,
        c.telegram_chat_id,
        s.name as staff_name,
        s.color as staff_color,
        sv.name as service_name,
        sv.color as service_color,
        sv.duration_minutes,
        COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), a.status) as owner_view_state,
        CASE
          WHEN a.status = 'pending' THEN 'Заявка'
          WHEN a.status = 'proposal_pending' THEN 'Предложен час'
          WHEN a.status = 'confirmed' THEN 'Запазен час'
          WHEN a.status = 'completed' THEN 'Приключен'
          WHEN a.status = 'no_show' THEN 'Неявил се'
          WHEN a.status = 'cancelled' AND COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), '') IN ('rejected', 'proposal_rejected') THEN 'Отказан'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'client' THEN 'Отменен от клиент'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'owner' THEN 'Отменен от салона'
          WHEN a.status = 'cancelled' THEN 'Отменен'
          ELSE a.status
        END as owner_view_label
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN staff s ON s.id = a.staff_id
      JOIN services sv ON sv.id = a.service_id
      WHERE a.start_at >= $1::timestamptz
        AND a.start_at < $2::timestamptz
        ${staffId ? 'AND a.staff_id = $3::uuid' : ''}
      ORDER BY a.start_at ASC
      `,
      staffId ? [fromUtc.toISOString(), toUtc.toISOString(), staffId] : [fromUtc.toISOString(), toUtc.toISOString()],
    );

    const exceptions = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT id, staff_id, type, start_at, end_at, note
      FROM staff_exceptions
      WHERE start_at < $2::timestamptz
        AND end_at > $1::timestamptz
        ${staffId ? 'AND staff_id = $3::uuid' : ''}
      ORDER BY start_at ASC
      `,
      staffId ? [fromUtc.toISOString(), toUtc.toISOString(), staffId] : [fromUtc.toISOString(), toUtc.toISOString()],
    );

    return {
      staff: staffRows,
      appointments,
      exceptions,
    };
  }

  async createStaffException(
    tenant: Tenant,
    staffId: string,
    startAtIso: string,
    endAtIso: string,
    type = 'blocked',
    note?: string | null,
  ) {
    const startAt = new Date(startAtIso);
    const endAt = new Date(endAtIso);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('Невалиден период за блокирания интервал.');
    }
    if (!isBefore(startAt, endAt)) {
      throw new BadRequestException('Краят трябва да е след началото.');
    }

    const normalizedType = ['vacation', 'sick', 'blocked', 'partial_day'].includes(type) ? type : 'blocked';
    const [staff] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `SELECT id, name, color FROM staff WHERE id = $1::uuid LIMIT 1`,
      [staffId],
    );

    if (!staff) {
      throw new NotFoundException('Специалистът не е намерен.');
    }

    const [created] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      INSERT INTO staff_exceptions (staff_id, type, start_at, end_at, note)
      VALUES ($1::uuid, $2, $3::timestamptz, $4::timestamptz, $5)
      RETURNING id, staff_id, type, start_at, end_at, note, created_at
      `,
      [staffId, normalizedType, startAt.toISOString(), endAt.toISOString(), note?.trim() || null],
    );

    return {
      ...created,
      staff_name: staff.name,
      staff_color: staff.color,
    };
  }

  async deleteStaffException(tenant: Tenant, exceptionId: string) {
    const [deleted] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      DELETE FROM staff_exceptions
      WHERE id = $1::uuid
      RETURNING id, staff_id, type, start_at, end_at, note
      `,
      [exceptionId],
    );

    if (!deleted) {
      throw new NotFoundException('Блокираният интервал не е намерен.');
    }

    return deleted;
  }

  async findUpcoming(tenant: Tenant, limit = 10, mode: UpcomingMode = 'all') {
    const whereClause =
      mode === 'pending'
        ? `a.status IN ('pending', 'proposal_pending')`
        : mode === 'attention'
          ? `(a.status IN ('pending', 'proposal_pending') OR COALESCE(NULLIF(a.intake_data->>'ownerActionAlert', ''), NULLIF(a.intake_data->'proposal'->>'ownerAlertState', ''), '') <> '')`
          : `a.start_at >= NOW()
        AND a.status NOT IN ('cancelled', 'completed', 'no_show')`;

    return this.prisma.queryInSchema(
      tenant.schemaName,
      `
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        a.price,
        a.cancelled_by,
        COALESCE(NULLIF(a.intake_data->>'ownerActionAlert', ''), NULLIF(a.intake_data->'proposal'->>'ownerAlertState', ''), '') as owner_alert_state,
        COALESCE(a.intake_data->'proposal'->>'lastDecision', '') as proposal_decision,
        COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), a.status) as owner_view_state,
        CASE
          WHEN a.status = 'pending' THEN 'Заявка'
          WHEN a.status = 'proposal_pending' THEN 'Предложен час'
          WHEN a.status = 'confirmed' THEN 'Запазен час'
          WHEN a.status = 'completed' THEN 'Приключен'
          WHEN a.status = 'no_show' THEN 'Неявил се'
          WHEN a.status = 'cancelled' AND COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), '') IN ('rejected', 'proposal_rejected') THEN 'Отказан'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'client' THEN 'Отменен от клиент'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'owner' THEN 'Отменен от салона'
          WHEN a.status = 'cancelled' THEN 'Отменен'
          ELSE a.status
        END as owner_view_label,
        c.name as client_name,
        c.phone as client_phone,
        s.name as staff_name,
        sv.name as service_name,
        sv.color as service_color
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN staff s ON s.id = a.staff_id
      JOIN services sv ON sv.id = a.service_id
      WHERE ${whereClause}
      ORDER BY a.start_at ASC
      LIMIT $1
      `,
      [limit],
    );
  }

  async getAppointmentContext(tenant: Tenant, appointmentId: string) {
    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        a.price,
        a.internal_notes,
        a.cancellation_reason,
        a.cancelled_by,
        a.created_at,
        COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), a.status) as owner_view_state,
        CASE
          WHEN a.status = 'pending' THEN 'Заявка'
          WHEN a.status = 'proposal_pending' THEN 'Предложен час'
          WHEN a.status = 'confirmed' THEN 'Запазен час'
          WHEN a.status = 'completed' THEN 'Приключен'
          WHEN a.status = 'no_show' THEN 'Неявил се'
          WHEN a.status = 'cancelled' AND COALESCE(NULLIF(a.intake_data->'stateMeta'->>'transitionKind', ''), '') IN ('rejected', 'proposal_rejected') THEN 'Отказан'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'client' THEN 'Отменен от клиент'
          WHEN a.status = 'cancelled' AND a.cancelled_by = 'owner' THEN 'Отменен от салона'
          WHEN a.status = 'cancelled' THEN 'Отменен'
          ELSE a.status
        END as owner_view_label,
        sv.name as service_name,
        sv.color as service_color,
        s.name as staff_name,
        s.color as staff_color,
        c.id as client_id,
        c.name as client_name,
        c.phone as client_phone,
        c.email as client_email,
        COALESCE(NULLIF(c.profile_data->>'salutation', ''), split_part(c.name, ' ', 1)) as client_salutation,
        COALESCE(NULLIF(c.profile_data->>'nameSource', ''), 'owner') as client_name_source,
        COALESCE(NULLIF(c.profile_data->>'originalClientName', ''), c.name) as original_client_name
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services sv ON sv.id = a.service_id
      JOIN staff s ON s.id = a.staff_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!appointment) {
      throw new NotFoundException('Резервацията не е намерена.');
    }

    const notifications = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        id,
        channel,
        type,
        status,
        external_id,
        error_message,
        sent_at,
        delivered_at,
        created_at
      FROM notifications_log
      WHERE appointment_id = $1::uuid
      ORDER BY COALESCE(sent_at, created_at) DESC
      LIMIT 20
      `,
      [appointmentId],
    );

    return {
      appointment,
      notifications,
    };
  }

  /**
   * Получава свободните слотове за конкретна дата, услуга и служител
   */
  async getAvailableSlots(
    tenant: Tenant,
    serviceId: string,
    staffId: string,
    date: Date,
  ): Promise<SlotResult[]> {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);

    const minAdvanceBookingHours = Number((tenant as any).minAdvanceBookingHours ?? 1);
    const maxAdvanceBookingDays = Number((tenant as any).maxAdvanceBookingDays ?? 60);

    // 1. Вземи услугата
    const services = await this.prisma.queryInSchema<{
      duration_minutes: number;
      buffer_before_min: number;
      buffer_after_min: number;
      booking_mode: string;
      slot_capacity: number;
      group_days: string[] | null;
      group_time_slots: string[] | null;
    }[]>(
      tenant.schemaName,
      `SELECT duration_minutes, buffer_before_min, buffer_after_min, booking_mode, slot_capacity, group_days, group_time_slots
       FROM services WHERE id = $1::uuid`,
      [serviceId],
    );

    if (!services.length) throw new NotFoundException('Услугата не е намерена');
    const service = services[0];
    const totalDuration = service.duration_minutes + service.buffer_before_min + service.buffer_after_min;

    // 2. Вземи работното време на служителя за този ден
    const dayOfWeek = format(toZonedTime(date, TIMEZONE), 'EEE').toLowerCase(); // mon, tue, ...
    const staffRows = await this.prisma.queryInSchema<{ working_hours: Record<string, { open: string; close: string; isOpen: boolean }> }[]>(
      tenant.schemaName,
      `SELECT working_hours FROM staff WHERE id = $1::uuid AND is_active = true`,
      [staffId],
    );

    if (!staffRows.length) throw new NotFoundException('Служителят не е намерен');

    const daySchedule = staffRows[0].working_hours[dayOfWeek];
    if (!daySchedule?.isOpen) return []; // Почивен ден

    // 3. Намери заетите интервали за деня
    const zonedDate = toZonedTime(date, TIMEZONE);
    const dayStart = fromZonedTime(startOfDay(zonedDate), TIMEZONE);
    const dayEnd = fromZonedTime(endOfDay(zonedDate), TIMEZONE);

    const bookedSlots = await this.prisma.queryInSchema<{ start_at: Date; end_at: Date; service_id: string }[]>(
      tenant.schemaName,
      `
      SELECT start_at, end_at, service_id FROM appointments
      WHERE staff_id = $1::uuid
        AND start_at >= $2
        AND end_at <= $3
        AND status NOT IN ('cancelled', 'no_show')
      ORDER BY start_at
      `,
      [staffId, dayStart, dayEnd],
    );

    // 4. Вземи изключенията (отпуски, блокирани часове)
    const exceptions = await this.prisma.queryInSchema<{ start_at: Date; end_at: Date }[]>(
      tenant.schemaName,
      `
      SELECT start_at, end_at FROM staff_exceptions
      WHERE staff_id = $1::uuid
        AND start_at < $3
        AND end_at > $2
      `,
      [staffId, dayStart, dayEnd],
    );

    // 5. Генерирай слотове
    const [openHour, openMin] = daySchedule.open.split(':').map(Number);
    const [closeHour, closeMin] = daySchedule.close.split(':').map(Number);

    const workStart = fromZonedTime(
      new Date(toZonedTime(date, TIMEZONE).setHours(openHour, openMin, 0, 0)),
      TIMEZONE,
    );
    const workEnd = fromZonedTime(
      new Date(toZonedTime(date, TIMEZONE).setHours(closeHour, closeMin, 0, 0)),
      TIMEZONE,
    );

    const minAdvanceTime = addHours(new Date(), minAdvanceBookingHours);
    const maxAdvanceTime = addHours(new Date(), maxAdvanceBookingDays * 24);

    const slots: SlotResult[] = [];

    if (service.booking_mode === 'group') {
      const allowedDays = service.group_days || [];
      const allowedTimes = [...new Set((service.group_time_slots || []).filter(Boolean))].sort();
      const capacity = Math.max(Number(service.slot_capacity || 1), 1);

      if (!allowedDays.includes(dayOfWeek) || !allowedTimes.length) {
        return [];
      }

      for (const time of allowedTimes) {
        const [hour, minute] = time.split(':').map(Number);
        const slotStart = fromZonedTime(
          new Date(toZonedTime(date, TIMEZONE).setHours(hour, minute, 0, 0)),
          TIMEZONE,
        );
        const slotEnd = addMinutes(slotStart, totalDuration);

        const isInFuture = isAfter(slotStart, minAdvanceTime);
        const isNotTooFar = isBefore(slotStart, maxAdvanceTime);
        const fitsWorkingDay =
          (isAfter(slotStart, workStart) || slotStart.getTime() === workStart.getTime()) &&
          (isBefore(slotEnd, workEnd) || slotEnd.getTime() === workEnd.getTime());

        if (!isInFuture || !isNotTooFar || !fitsWorkingDay) {
          continue;
        }

        const isException = exceptions.some(
          (e) => isBefore(slotStart, new Date(e.end_at)) && isAfter(slotEnd, new Date(e.start_at)),
        );

        const sameSessionBookings = bookedSlots.filter(
          (booking) =>
            booking.service_id === serviceId &&
            new Date(booking.start_at).getTime() === slotStart.getTime() &&
            new Date(booking.end_at).getTime() === slotEnd.getTime(),
        );

        const hasOtherConflict = bookedSlots.some((booking) => {
          const bookingStart = new Date(booking.start_at);
          const bookingEnd = new Date(booking.end_at);
          const overlaps = isBefore(slotStart, bookingEnd) && isAfter(slotEnd, bookingStart);
          const sameSession =
            booking.service_id === serviceId &&
            bookingStart.getTime() === slotStart.getTime() &&
            bookingEnd.getTime() === slotEnd.getTime();
          return overlaps && !sameSession;
        });

        const remainingSpots = capacity - sameSessionBookings.length;
        if (!isException && !hasOtherConflict && remainingSpots > 0) {
          slots.push({
            start: format(toZonedTime(slotStart, TIMEZONE), 'HH:mm'),
            end: format(toZonedTime(slotEnd, TIMEZONE), 'HH:mm'),
            remainingSpots,
            capacity,
          });
        }
      }

      return slots;
    }

    let cursor = workStart;

    while (isBefore(addMinutes(cursor, totalDuration), workEnd) || 
           addMinutes(cursor, totalDuration).getTime() === workEnd.getTime()) {
      const slotEnd = addMinutes(cursor, totalDuration);

      // Провери дали слотът е в позволения диапазон
      const isInFuture = isAfter(cursor, minAdvanceTime);
      const isNotTooFar = isBefore(cursor, maxAdvanceTime);

      if (isInFuture && isNotTooFar) {
        // Провери дали слотът се засича с вече заета резервация
        const isBooked = bookedSlots.some(
          (b) => isBefore(cursor, b.end_at) && isAfter(slotEnd, b.start_at),
        );

        // Провери дали попада в изключение (отпуск и т.н.)
        const isException = exceptions.some(
          (e) => isBefore(cursor, new Date(e.end_at)) && isAfter(slotEnd, new Date(e.start_at)),
        );

        if (!isBooked && !isException) {
          slots.push({
            start: format(toZonedTime(cursor, TIMEZONE), 'HH:mm'),
            end: format(toZonedTime(slotEnd, TIMEZONE), 'HH:mm'),
          });
        }
      }

      cursor = addMinutes(cursor, 30); // Слотове на 30 минути
    }

    return slots;
  }

  /**
   * Създава нова резервация
   */
  async create(
    tenant: Tenant,
    dto: CreateAppointmentDto,
    options: {
      forceConfirmed?: boolean;
      askClient?: boolean;
      bookedBy?: AppointmentBookedBy;
      publicBaseUrl?: string;
    } = {},
  ) {
    const minAdvanceBookingHours = Number((tenant as any).minAdvanceBookingHours ?? 1);
    const requiresConfirmation = Boolean((tenant as any).requiresConfirmation ?? false);

    // 1. Валидация на услугата
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);

    const services = await this.prisma.queryInSchema<{
      id: string;
      duration_minutes: number;
      price: number;
      name: string;
      requires_confirmation: boolean;
      buffer_before_min: number;
      buffer_after_min: number;
      booking_mode: string;
      slot_capacity: number;
      group_days: string[] | null;
      group_time_slots: string[] | null;
    }[]>(
      tenant.schemaName,
      `SELECT * FROM services WHERE id = $1::uuid AND is_public = true`,
      [dto.serviceId],
    );
    if (!services.length) throw new NotFoundException('Услугата не е намерена');
    const service = services[0];

    // 2. Изчисли края на резервацията
    const startAt = new Date(dto.startAt);
    const endAt = addMinutes(startAt, service.duration_minutes + service.buffer_before_min + service.buffer_after_min);

    // 3. Провери/създай клиент
    const clientId = await this.findOrCreateClient(tenant.schemaName, dto);

    // 4. Провери конфликти (atomic check)
    if (service.booking_mode === 'group') {
      const dayOfWeek = format(toZonedTime(startAt, TIMEZONE), 'EEE').toLowerCase();
      const allowedDays = service.group_days || [];
      const allowedTimes = service.group_time_slots || [];
      const startTime = format(toZonedTime(startAt, TIMEZONE), 'HH:mm');

      if (!allowedDays.includes(dayOfWeek) || !allowedTimes.includes(startTime)) {
        throw new BadRequestException('Тази тренировка може да се резервира само в предварително зададените дни и часове.');
      }

      const overlaps = await this.prisma.queryInSchema<{ service_id: string; start_at: Date; end_at: Date }[]>(
        tenant.schemaName,
        `
        SELECT service_id, start_at, end_at FROM appointments
        WHERE staff_id = $1::uuid
          AND status NOT IN ('cancelled', 'no_show')
          AND (start_at, end_at) OVERLAPS ($2::timestamptz, $3::timestamptz)
        `,
        [dto.staffId, startAt.toISOString(), endAt.toISOString()],
      );

      const sameSessionBookings = overlaps.filter(
        (booking) =>
          booking.service_id === dto.serviceId &&
          new Date(booking.start_at).getTime() === startAt.getTime() &&
          new Date(booking.end_at).getTime() === endAt.getTime(),
      );

      const hasOtherConflict = overlaps.some((booking) => {
        const bookingStart = new Date(booking.start_at);
        const bookingEnd = new Date(booking.end_at);
        const sameSession =
          booking.service_id === dto.serviceId &&
          bookingStart.getTime() === startAt.getTime() &&
          bookingEnd.getTime() === endAt.getTime();
        return !sameSession;
      });

      if (hasOtherConflict) {
        throw new ConflictException('Треньорът е зает в този интервал. Избери друг слот.');
      }

      const capacity = Math.max(Number(service.slot_capacity || 1), 1);
      if (sameSessionBookings.length >= capacity) {
        throw new ConflictException('Няма свободни места за тази тренировка.');
      }
    } else {
      const conflicts = await this.prisma.queryInSchema<unknown[]>(
        tenant.schemaName,
        `
        SELECT id FROM appointments
        WHERE staff_id = $1::uuid
          AND status NOT IN ('cancelled', 'no_show')
          AND (start_at, end_at) OVERLAPS ($2::timestamptz, $3::timestamptz)
        `,
        [dto.staffId, startAt.toISOString(), endAt.toISOString()],
      );

      if (conflicts.length > 0) {
        throw new ConflictException('Избраният час вече е зает. Моля, изберете друг.');
      }
    }

    // 5. Провери напред/назад лимити
    const minStart = addHours(new Date(), minAdvanceBookingHours);
    if (isBefore(startAt, minStart)) {
      throw new BadRequestException(
        `Резервации се приемат минимум ${minAdvanceBookingHours} час(а) предварително.`,
      );
    }

    // 6. Определи статуса
    const status = options.askClient
      ? AppointmentStatus.PROPOSAL_PENDING
      : options.forceConfirmed
        ? AppointmentStatus.CONFIRMED
        : requiresConfirmation || service.requires_confirmation
          ? AppointmentStatus.PENDING
          : AppointmentStatus.CONFIRMED;

    const intakeData = {
      ...(dto.intakeData || {}),
      ...(dto.publicBaseUrl ? { publicBaseUrl: dto.publicBaseUrl.trim().replace(/\/$/, '') } : {}),
      stateMeta: this.buildOwnerStateMeta(
        null,
        status,
        options.askClient
          ? 'proposal_sent'
          : status === AppointmentStatus.PENDING
            ? 'requested'
            : 'booked_direct',
      ),
      ...(options.askClient
        ? {
            proposal: this.buildProposalMetadata({
              kind: 'admin_inquiry',
              publicBaseUrl: options.publicBaseUrl,
              originalStatus: null,
              originalStartAt: null,
              originalEndAt: null,
            }),
          }
        : {}),
    };

    // 7. Създай резервацията
    const rows = await this.prisma.queryInSchema<{ id: string }[]>(
      tenant.schemaName,
      `
      INSERT INTO appointments (
        client_id, staff_id, service_id,
        start_at, end_at, status,
        price, currency, booked_by,
        client_notes, intake_data
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10, $11::jsonb)
      RETURNING id
      `,
      [
        clientId,
        dto.staffId,
        dto.serviceId,
        startAt.toISOString(),
        endAt.toISOString(),
        status,
        service.price,
        'EUR',
        options.bookedBy ?? 'client',
        dto.notes || null,
        JSON.stringify(intakeData),
      ],
    );

    const appointmentId = rows[0].id;

    // 8. Постави в notification queue
    if (status === AppointmentStatus.PROPOSAL_PENDING) {
      await this.processNotificationNow(
        NotificationJobType.BOOKING_PROPOSAL,
        {
          tenantId: tenant.id,
          tenantSchemaName: tenant.schemaName,
          appointmentId,
          clientId,
        },
        {
          tenantSlug: tenant.slug,
          appointmentId,
          context: 'create-proposal',
          delay: 0,
        },
      );
    } else {
      await this.scheduleNotifications(tenant, appointmentId, clientId, status, startAt);
    }

    this.logger.log(`Appointment ${appointmentId} created for tenant ${tenant.slug}`);
    return { id: appointmentId, status, startAt, endAt };
  }

  async proposeAlternative(
    tenant: Tenant,
    appointmentId: string,
    dto: { startAt: string; publicBaseUrl?: string },
  ) {
    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        a.id,
        a.client_id,
        a.staff_id,
        a.service_id,
        a.start_at,
        a.end_at,
        a.status,
        a.intake_data,
        sv.duration_minutes,
        sv.buffer_before_min,
        sv.buffer_after_min
      FROM appointments a
      JOIN services sv ON sv.id = a.service_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!appointment) {
      throw new NotFoundException('Резервацията не е намерена.');
    }

    if (![AppointmentStatus.PENDING, AppointmentStatus.PROPOSAL_PENDING].includes(appointment.status)) {
      throw new BadRequestException('Контра оферта може да се изпрати само за непотвърдена заявка.');
    }

    const startAt = new Date(dto.startAt);
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Невалиден нов час.');
    }

    const totalDuration =
      Number(appointment.duration_minutes) +
      Number(appointment.buffer_before_min || 0) +
      Number(appointment.buffer_after_min || 0);
    const endAt = addMinutes(startAt, totalDuration);

    await this.assertNoConflict(
      tenant.schemaName,
      appointment.staff_id,
      startAt,
      endAt,
      appointment.id,
    );

    const intakeData = this.parseIntakeData(appointment.intake_data);
    const existingProposal = intakeData.proposal;
    const proposal = this.buildProposalMetadata({
      kind: 'counter_offer',
      publicBaseUrl: dto.publicBaseUrl || existingProposal?.publicBaseUrl || undefined,
      originalStatus: (existingProposal?.originalStatus as AppointmentStatus | null) ?? appointment.status,
      originalStartAt: existingProposal?.originalStartAt || new Date(appointment.start_at).toISOString(),
      originalEndAt: existingProposal?.originalEndAt || new Date(appointment.end_at).toISOString(),
    });

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE appointments
      SET start_at = $1::timestamptz,
          end_at = $2::timestamptz,
          status = $3,
          intake_data = $4::jsonb,
          updated_at = NOW()
      WHERE id = $5::uuid
      `,
      [
        startAt.toISOString(),
        endAt.toISOString(),
        AppointmentStatus.PROPOSAL_PENDING,
        JSON.stringify({
          ...intakeData,
          proposal,
          stateMeta: this.buildOwnerStateMeta(appointment.status, AppointmentStatus.PROPOSAL_PENDING, 'proposal_sent'),
        }),
        appointment.id,
      ],
    );

    await this.processNotificationNow(
      NotificationJobType.BOOKING_PROPOSAL,
      {
        tenantId: tenant.id,
        tenantSchemaName: tenant.schemaName,
        appointmentId: appointment.id,
        clientId: appointment.client_id,
      },
      {
        tenantSlug: tenant.slug,
        appointmentId: appointment.id,
        context: 'propose-alternative',
        delay: 0,
      },
    );

    return {
      id: appointment.id,
      status: AppointmentStatus.PROPOSAL_PENDING,
      startAt,
      endAt,
    };
  }

  async respondToProposal(tenant: Tenant, appointmentId: string, decision: ProposalDecision) {
    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT id, client_id, status, start_at, end_at, intake_data
      FROM appointments
      WHERE id = $1::uuid
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!appointment) {
      throw new NotFoundException('Резервацията не е намерена.');
    }

    if (appointment.status !== AppointmentStatus.PROPOSAL_PENDING) {
      throw new BadRequestException('Това предложение вече не е активно.');
    }

    const intakeData = this.parseIntakeData(appointment.intake_data);
    const proposal = intakeData.proposal;

    if (!proposal) {
      throw new BadRequestException('Липсват данни за предложението.');
    }

    if (decision === 'accept') {
      const nextIntake = {
        ...intakeData,
        proposal: {
          ...proposal,
          ownerAlertState: 'proposal_accepted' as const,
          lastDecision: 'accept' as const,
        },
        stateMeta: this.buildOwnerStateMeta(appointment.status, AppointmentStatus.CONFIRMED, 'proposal_accepted'),
      };

      await this.prisma.queryInSchema(
        tenant.schemaName,
        `
        UPDATE appointments
        SET status = $1,
            intake_data = $2::jsonb,
            updated_at = NOW()
        WHERE id = $3::uuid
        `,
        [
          AppointmentStatus.CONFIRMED,
          JSON.stringify(nextIntake),
          appointment.id,
        ],
      );

      await this.scheduleRemindersOnly(
        tenant,
        appointment.id,
        appointment.client_id,
        new Date(appointment.start_at),
      );

      return {
        id: appointment.id,
        status: AppointmentStatus.CONFIRMED,
        ownerAlertState: 'proposal_accepted',
      };
    }

    const originalStatus = (proposal.originalStatus as AppointmentStatus | null) || AppointmentStatus.CANCELLED;
    const revertStatus =
      proposal.kind === 'counter_offer' && proposal.originalStartAt && proposal.originalEndAt
        ? originalStatus
        : AppointmentStatus.CANCELLED;
    const nextStartAt =
      proposal.kind === 'counter_offer' && proposal.originalStartAt
        ? proposal.originalStartAt
        : new Date(appointment.start_at).toISOString();
    const nextEndAt =
      proposal.kind === 'counter_offer' && proposal.originalEndAt
        ? proposal.originalEndAt
        : new Date(appointment.end_at).toISOString();

    const nextIntake = {
      ...intakeData,
      proposal: {
        ...proposal,
        ownerAlertState: 'proposal_rejected' as const,
        lastDecision: 'reject' as const,
      },
      stateMeta: this.buildOwnerStateMeta(
        appointment.status,
        revertStatus,
        revertStatus === AppointmentStatus.CANCELLED ? 'proposal_rejected' : 'proposal_sent',
      ),
    };

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE appointments
      SET status = $1,
          start_at = $2::timestamptz,
          end_at = $3::timestamptz,
          cancellation_reason = $4,
          cancelled_by = $5,
          cancelled_at = CASE WHEN $1 = 'cancelled' THEN NOW() ELSE NULL END,
          intake_data = $6::jsonb,
          updated_at = NOW()
      WHERE id = $7::uuid
      `,
      [
        revertStatus,
        nextStartAt,
        nextEndAt,
        revertStatus === AppointmentStatus.CANCELLED ? 'Клиентът отказа предложението.' : null,
        revertStatus === AppointmentStatus.CANCELLED ? 'client' : null,
        JSON.stringify(nextIntake),
        appointment.id,
      ],
    );

    return {
      id: appointment.id,
      status: revertStatus,
      ownerAlertState: 'proposal_rejected',
    };
  }

  async respondToProposalByToken(
    tenantSlug: string,
    token: string,
    decision: ProposalDecision,
  ) {
    const tenants = await this.prisma.$queryRawUnsafe<Array<{ id: string; slug: string; schema_name: string }>>(
      `SELECT id, slug, schema_name FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
      tenantSlug,
    );

    if (!tenants.length) {
      throw new NotFoundException('Бизнесът не е намерен.');
    }

    const tenant = tenants[0];
    const tokenField = decision === 'accept' ? 'acceptToken' : 'rejectToken';
    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schema_name,
      `
      SELECT id
      FROM appointments
      WHERE intake_data->'proposal'->>$1 = $2
      LIMIT 1
      `,
      [tokenField, token],
    );

    if (!appointment) {
      throw new NotFoundException('Линкът за предложението не е валиден.');
    }

    return this.respondToProposal(
      {
        id: tenant.id,
        slug: tenant.slug,
        schemaName: tenant.schema_name,
      } as Tenant,
      appointment.id,
      decision,
    );
  }

  async clearOwnerAlert(tenant: Tenant, appointmentId: string) {
    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `SELECT intake_data FROM appointments WHERE id = $1::uuid LIMIT 1`,
      [appointmentId],
    );

    if (!appointment) {
      throw new NotFoundException('Резервацията не е намерена.');
    }

    const intakeData = this.parseIntakeData(appointment.intake_data);
    if (!intakeData.proposal?.ownerAlertState && !intakeData.ownerActionAlert) {
      return { updated: true };
    }

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE appointments
      SET intake_data = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      [
        JSON.stringify({
          ...intakeData,
          ownerActionAlert: '',
          proposal: {
            ...intakeData.proposal,
            ownerAlertState: '',
          },
        }),
        appointmentId,
      ],
    );

    return { updated: true };
  }

  /**
   * Потвърждение / Отмяна / No-show от администратора
   */
  async updateStatus(
    tenant: Tenant,
    appointmentId: string,
    newStatus: AppointmentStatus,
    reason?: string,
    cancelledBy?: 'client' | 'owner',
  ) {
    const appointments = await this.prisma.queryInSchema<{ id: string; client_id: string; status: string; start_at: Date; intake_data: unknown }[]>(
      tenant.schemaName,
      `SELECT id, client_id, status, start_at, intake_data FROM appointments WHERE id = $1::uuid`,
      [appointmentId],
    );

    if (!appointments.length) throw new NotFoundException('Резервацията не е намерена');
    const appointment = appointments[0];

    // Валидации на state machine
    this.validateStatusTransition(appointment.status as AppointmentStatus, newStatus);

    const updateFields: Record<string, unknown> = { status: newStatus, updated_at: 'NOW()' };

    if (newStatus === AppointmentStatus.CANCELLED) {
      updateFields.cancellation_reason = reason;
      updateFields.cancelled_by = cancelledBy || 'owner';
      updateFields.cancelled_at = new Date().toISOString();
    }

    if (newStatus === AppointmentStatus.NO_SHOW) {
      // Увеличи no_show_count на клиента
      await this.prisma.queryInSchema(
        tenant.schemaName,
        `UPDATE clients SET no_show_count = no_show_count + 1 WHERE id = $1::uuid`,
        [appointment.client_id],
      );
    }

    const intakeData = this.parseIntakeData(appointment.intake_data);
    const nextIntakeData =
      newStatus === AppointmentStatus.CANCELLED && cancelledBy === 'client'
        ? { ...intakeData, ownerActionAlert: 'client_cancelled' as const }
        : { ...intakeData, ownerActionAlert: '' as const };
    const transitionKind = this.resolveOwnerStateKind(
      appointment.status as AppointmentStatus,
      newStatus,
      cancelledBy,
    );
    const resolvedIntakeData = {
      ...nextIntakeData,
      stateMeta: this.buildOwnerStateMeta(appointment.status, newStatus, transitionKind),
    };

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `UPDATE appointments SET status = $1, cancellation_reason = $2, 
       cancelled_by = $3, cancelled_at = $4::timestamptz, intake_data = $5::jsonb, updated_at = NOW()
       WHERE id = $6::uuid`,
      [
        newStatus,
        updateFields.cancellation_reason || null,
        updateFields.cancelled_by || null,
        updateFields.cancelled_at || null,
        JSON.stringify(resolvedIntakeData),
        appointmentId,
      ],
    );

    // Изпрати известие за промяната
    await this.processNotificationNow(
      newStatus === AppointmentStatus.CANCELLED
        ? (cancelledBy === 'client'
            ? NotificationJobType.BOOKING_CANCELLED_CLIENT
            : NotificationJobType.BOOKING_CANCELLED_BUSINESS)
        : 'status-changed',
      {
        tenantId: tenant.id,
        tenantSchemaName: tenant.schemaName,
        appointmentId,
        clientId: appointment.client_id,
        previousStatus: appointment.status,
        newStatus,
        reason,
        cancelledBy,
      },
      {
        tenantSlug: tenant.slug,
        appointmentId,
        context: 'status-change',
      },
    );

    return { id: appointmentId, status: newStatus };
  }

  async rescheduleAppointment(
    tenant: Tenant,
    appointmentId: string,
    startAtIso: string,
    staffId?: string,
  ) {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);

    const [appointment] = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        a.id,
        a.client_id,
        a.staff_id,
        a.service_id,
        a.status,
        a.intake_data,
        sv.duration_minutes,
        sv.buffer_before_min,
        sv.buffer_after_min,
        sv.booking_mode
      FROM appointments a
      JOIN services sv ON sv.id = a.service_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [appointmentId],
    );

    if (!appointment) {
      throw new NotFoundException('Резервацията не е намерена.');
    }

    if (
      [AppointmentStatus.CANCELLED, AppointmentStatus.COMPLETED, AppointmentStatus.NO_SHOW].includes(
        appointment.status,
      )
    ) {
      throw new BadRequestException('Този запис не може да бъде преместен.');
    }

    if (appointment.booking_mode === 'group') {
      throw new BadRequestException('Груповите сесии не могат да се местят с drag/drop.');
    }

    const nextStaffId = staffId || appointment.staff_id;
    const nextStartAt = new Date(startAtIso);
    if (Number.isNaN(nextStartAt.getTime())) {
      throw new BadRequestException('Невалиден нов час.');
    }

    const totalDuration =
      Number(appointment.duration_minutes || 0) +
      Number(appointment.buffer_before_min || 0) +
      Number(appointment.buffer_after_min || 0);
    const nextEndAt = addMinutes(nextStartAt, totalDuration);

    const dayOfWeek = format(toZonedTime(nextStartAt, TIMEZONE), 'EEE').toLowerCase();
    const [staffRow] = await this.prisma.queryInSchema<
      { working_hours: Record<string, { open: string; close: string; isOpen: boolean }> }[]
    >(
      tenant.schemaName,
      `SELECT working_hours FROM staff WHERE id = $1::uuid AND is_active = true LIMIT 1`,
      [nextStaffId],
    );

    if (!staffRow) {
      throw new NotFoundException('Специалистът не е намерен.');
    }

    const daySchedule = staffRow.working_hours?.[dayOfWeek];
    if (!daySchedule?.isOpen) {
      throw new ConflictException('Специалистът не работи в този ден.');
    }

    const [openHour, openMin] = daySchedule.open.split(':').map(Number);
    const [closeHour, closeMin] = daySchedule.close.split(':').map(Number);
    const workStart = fromZonedTime(
      new Date(toZonedTime(nextStartAt, TIMEZONE).setHours(openHour, openMin, 0, 0)),
      TIMEZONE,
    );
    const workEnd = fromZonedTime(
      new Date(toZonedTime(nextStartAt, TIMEZONE).setHours(closeHour, closeMin, 0, 0)),
      TIMEZONE,
    );

    if (
      (isBefore(nextStartAt, workStart) && nextStartAt.getTime() !== workStart.getTime()) ||
      (isAfter(nextEndAt, workEnd) && nextEndAt.getTime() !== workEnd.getTime())
    ) {
      throw new ConflictException('Новият час е извън работното време на специалиста.');
    }

    const exceptionConflicts = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT id
      FROM staff_exceptions
      WHERE staff_id = $1::uuid
        AND start_at < $3::timestamptz
        AND end_at > $2::timestamptz
      LIMIT 1
      `,
      [nextStaffId, nextStartAt.toISOString(), nextEndAt.toISOString()],
    );

    if (exceptionConflicts.length) {
      throw new ConflictException('Новият час попада в блокиран интервал.');
    }

    const appointmentConflicts = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT id
      FROM appointments
      WHERE id <> $1::uuid
        AND staff_id = $2::uuid
        AND status NOT IN ('cancelled', 'no_show')
        AND (start_at, end_at) OVERLAPS ($3::timestamptz, $4::timestamptz)
      LIMIT 1
      `,
      [appointmentId, nextStaffId, nextStartAt.toISOString(), nextEndAt.toISOString()],
    );

    if (appointmentConflicts.length) {
      throw new ConflictException('Специалистът вече е зает в този интервал.');
    }

    const intakeData = this.parseIntakeData(appointment.intake_data);
    const unchangedState =
      appointment.status === AppointmentStatus.PROPOSAL_PENDING
        ? 'proposal_sent'
        : appointment.status === AppointmentStatus.PENDING
          ? 'requested'
          : 'approved';

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE appointments
      SET staff_id = $1::uuid,
          start_at = $2::timestamptz,
          end_at = $3::timestamptz,
          intake_data = $4::jsonb,
          updated_at = NOW()
      WHERE id = $5::uuid
      `,
      [
        nextStaffId,
        nextStartAt.toISOString(),
        nextEndAt.toISOString(),
        JSON.stringify({
          ...intakeData,
          stateMeta: this.buildOwnerStateMeta(appointment.status, appointment.status, unchangedState),
        }),
        appointmentId,
      ],
    );

    return {
      id: appointmentId,
      staffId: nextStaffId,
      startAt: nextStartAt,
      endAt: nextEndAt,
      status: appointment.status,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async findOrCreateClient(schemaName: string, dto: CreateAppointmentDto): Promise<string> {
    const normalizedPhone = normalizeBulgarianPhone(dto.clientPhone);
    const phoneVariants = buildBulgarianPhoneVariants(normalizedPhone);
    const submittedName = this.sanitizeClientSubmittedName(dto.clientName);
    const fallbackName = submittedName || this.buildAutoClientName(normalizedPhone);
    const fallbackSalutation = this.getDefaultSalutation(fallbackName);

    const existing = await this.prisma.queryInSchema<{ id: string; name: string; profile_data: unknown }[]>(
      schemaName,
      `SELECT id, name, profile_data
       FROM clients
       WHERE phone = ANY($1::text[])
       LIMIT 1`,
      [phoneVariants],
    );

    if (existing.length) {
      const profileData = this.parseClientProfileData(existing[0].profile_data);
      const currentName = existing[0].name?.trim() || '';
      const isOwnerControlled = profileData.nameSource === 'owner';
      const canRepairClientSubmittedName =
        !isOwnerControlled &&
        Boolean(submittedName) &&
        this.isGenericOrGeneratedClientName(currentName, profileData.originalClientName);

      if (canRepairClientSubmittedName) {
        const repairedName = submittedName as string;
        await this.prisma.queryInSchema(
          schemaName,
          `UPDATE clients
           SET name = $1,
               notifications_consent = true,
               consent_given_at = COALESCE(consent_given_at, NOW()),
               profile_data = COALESCE(profile_data, '{}'::jsonb) || jsonb_build_object(
                 'salutation', $2::text,
                 'nameSource', 'client_submitted',
                 'originalClientName', $1::text
               ),
               updated_at = NOW()
           WHERE id = $3::uuid`,
          [repairedName, this.getDefaultSalutation(repairedName), existing[0].id],
        );
      } else {
        await this.prisma.queryInSchema(
          schemaName,
          `UPDATE clients
           SET notifications_consent = true,
               consent_given_at = COALESCE(consent_given_at, NOW())
           WHERE id = $1::uuid`,
          [existing[0].id],
        );
      }

      return existing[0].id;
    }

    const created = await this.prisma.queryInSchema<{ id: string }[]>(
      schemaName,
      `INSERT INTO clients (name, phone, email, notifications_consent, consent_given_at, profile_data)
       VALUES ($1, $2, $3, $4, NOW(), $5::jsonb) RETURNING id`,
      [
        fallbackName,
        normalizedPhone,
        dto.clientEmail || null,
        true,
        JSON.stringify({
          salutation: fallbackSalutation,
          nameSource: 'client_submitted',
          originalClientName: submittedName || null,
        }),
      ],
    );

    return created[0].id;
  }

  private getDefaultSalutation(name: string) {
    const firstName = name.trim().split(/\s+/)[0] || '';
    return firstName || name.trim();
  }

  private sanitizeClientSubmittedName(name: string | undefined | null) {
    const cleaned = (name || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return null;

    const normalized = cleaned.toLocaleLowerCase('bg-BG');
    const genericLabels = new Set([
      'пълно име',
      'две имена',
      'име',
      'вашето име',
      'твоето име',
      'full name',
      'name',
      'your name',
      'first and last name',
    ]);

    if (genericLabels.has(normalized)) {
      return null;
    }

    return cleaned;
  }

  private buildAutoClientName(phone: string) {
    return `Клиент ${phone.slice(-4)}`;
  }

  private parseClientProfileData(value: unknown): ClientProfileData {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value || '{}') as ClientProfileData;
      } catch {
        return {};
      }
    }
    if (typeof value === 'object') {
      return value as ClientProfileData;
    }
    return {};
  }

  private isGenericOrGeneratedClientName(name: string, originalClientName?: string) {
    const normalizedName = name.trim().toLocaleLowerCase('bg-BG');
    const normalizedOriginal = (originalClientName || '').trim().toLocaleLowerCase('bg-BG');

    if (!normalizedName) return true;
    if (/^клиент\s+\d{4}$/.test(normalizedName)) return true;
    if (/^\+359\d{9}$/.test(name.trim())) return true;

    const genericLabels = new Set([
      'пълно име',
      'две имена',
      'име',
      'вашето име',
      'твоето име',
      'full name',
      'name',
      'your name',
      'first and last name',
    ]);

    return genericLabels.has(normalizedName) || genericLabels.has(normalizedOriginal);
  }

  private async scheduleNotifications(
    tenant: Tenant,
    appointmentId: string,
    clientId: string,
    status: AppointmentStatus,
    startAt: Date,
  ) {
    const reminderHours = Array.isArray((tenant as any).reminderHours)
      ? (tenant as any).reminderHours
      : [24, 2];

    const baseData = {
      tenantId: tenant.id,
      tenantSchemaName: tenant.schemaName,
      appointmentId,
      clientId,
    };

    // Незабавно потвърждение
    await this.processNotificationNow(
      NotificationJobType.BOOKING_CONFIRMED,
      { ...baseData, status },
      {
        tenantSlug: tenant.slug,
        appointmentId,
        context: 'booking-confirmed',
        delay: 0,
      },
    );

    // Reminder 24ч преди
    const reminder24h = addHours(startAt, -24).getTime() - Date.now();
    if (reminder24h > 0 && reminderHours.includes(24)) {
      await this.safeAddNotificationJob(
        NotificationJobType.REMINDER_24H,
        baseData,
        {
          tenantSlug: tenant.slug,
          appointmentId,
          context: 'reminder-24h',
          delay: reminder24h,
          jobId: `reminder-24h-${appointmentId}`,
        },
      );
    }

    // Reminder 2ч преди
    const reminder2h = addHours(startAt, -2).getTime() - Date.now();
    if (reminder2h > 0 && reminderHours.includes(2)) {
      await this.safeAddNotificationJob(
        NotificationJobType.REMINDER_2H,
        baseData,
        {
          tenantSlug: tenant.slug,
          appointmentId,
          context: 'reminder-2h',
          delay: reminder2h,
          jobId: `reminder-2h-${appointmentId}`,
        },
      );
    }
  }

  private async scheduleRemindersOnly(
    tenant: Tenant,
    appointmentId: string,
    clientId: string,
    startAt: Date,
  ) {
    const reminderHours = Array.isArray((tenant as any).reminderHours)
      ? (tenant as any).reminderHours
      : [24, 2];

    const baseData = {
      tenantId: tenant.id,
      tenantSchemaName: tenant.schemaName,
      appointmentId,
      clientId,
    };

    const reminder24h = addHours(startAt, -24).getTime() - Date.now();
    if (reminder24h > 0 && reminderHours.includes(24)) {
      await this.safeAddNotificationJob(
        NotificationJobType.REMINDER_24H,
        baseData,
        {
          tenantSlug: tenant.slug,
          appointmentId,
          context: 'proposal-reminder-24h',
          delay: reminder24h,
          jobId: `reminder-24h-${appointmentId}`,
        },
      );
    }

    const reminder2h = addHours(startAt, -2).getTime() - Date.now();
    if (reminder2h > 0 && reminderHours.includes(2)) {
      await this.safeAddNotificationJob(
        NotificationJobType.REMINDER_2H,
        baseData,
        {
          tenantSlug: tenant.slug,
          appointmentId,
          context: 'proposal-reminder-2h',
          delay: reminder2h,
          jobId: `reminder-2h-${appointmentId}`,
        },
      );
    }
  }

  private async processNotificationNow(
    name: string,
    data: unknown,
    meta: { tenantSlug: string; appointmentId: string; context: string; delay?: number; jobId?: string },
  ) {
    try {
      await this.notificationProcessor.process({
        id: `inline-${name}-${Date.now()}`,
        name,
        data,
      } as any);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Immediate notification failed (${meta.context}) for appointment ${meta.appointmentId} in tenant ${meta.tenantSlug}: ${message}`,
      );
    }
  }

  private async safeAddNotificationJob(
    name: string,
    data: unknown,
    meta: { tenantSlug: string; appointmentId: string; context: string; delay?: number; jobId?: string },
  ) {
    try {
      await this.notificationQueue.add(
        name,
        data,
        {
          ...(meta.delay !== undefined ? { delay: meta.delay } : {}),
          ...(meta.jobId ? { jobId: meta.jobId } : {}),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Notification dispatch failed (${meta.context}) for appointment ${meta.appointmentId} in tenant ${meta.tenantSlug}: ${message}`,
      );
    }
  }

  private buildProposalMetadata(input: {
    kind: ProposalKind;
    publicBaseUrl?: string | null;
    originalStatus: AppointmentStatus | null;
    originalStartAt: string | null;
    originalEndAt: string | null;
  }): ProposalMetadata {
    return {
      kind: input.kind,
      publicBaseUrl: input.publicBaseUrl?.trim().replace(/\/$/, '') || null,
      acceptToken: randomUUID(),
      rejectToken: randomUUID(),
      originalStatus: input.originalStatus,
      originalStartAt: input.originalStartAt,
      originalEndAt: input.originalEndAt,
      requestedAt: new Date().toISOString(),
      ownerAlertState: '',
    };
  }

  private buildOwnerStateMeta(
    fromStatus: string | null,
    toStatus: string,
    transitionKind: OwnerStateKind,
  ): OwnerStateMeta {
    return {
      transitionKind,
      fromStatus,
      toStatus,
      updatedAt: new Date().toISOString(),
    };
  }

  private resolveOwnerStateKind(
    current: AppointmentStatus,
    next: AppointmentStatus,
    cancelledBy?: 'client' | 'owner',
  ): OwnerStateKind {
    if (next === AppointmentStatus.CONFIRMED && current === AppointmentStatus.PROPOSAL_PENDING) {
      return 'proposal_accepted';
    }

    if (next === AppointmentStatus.CONFIRMED) {
      return 'approved';
    }

    if (next === AppointmentStatus.CANCELLED && cancelledBy === 'client') {
      return 'cancelled_by_client';
    }

    if (next === AppointmentStatus.CANCELLED && cancelledBy === 'owner') {
      if (current === AppointmentStatus.PENDING || current === AppointmentStatus.PROPOSAL_PENDING) {
        return 'rejected';
      }
      return 'cancelled_by_owner';
    }

    if (next === AppointmentStatus.COMPLETED) {
      return 'completed';
    }

    if (next === AppointmentStatus.NO_SHOW) {
      return 'no_show';
    }

    if (next === AppointmentStatus.PROPOSAL_PENDING) {
      return 'proposal_sent';
    }

    if (next === AppointmentStatus.PENDING) {
      return 'requested';
    }

    return 'booked_direct';
  }

  private parseIntakeData(raw: unknown): IntakeDataWithProposal {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as IntakeDataWithProposal;
      } catch {
        return {};
      }
    }
    if (typeof raw === 'object') {
      return raw as IntakeDataWithProposal;
    }
    return {};
  }

  private async assertNoConflict(
    schemaName: string,
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ) {
    const conflicts = await this.prisma.queryInSchema<unknown[]>(
      schemaName,
      `
      SELECT id FROM appointments
      WHERE staff_id = $1::uuid
        AND status NOT IN ('cancelled', 'no_show')
        ${excludeAppointmentId ? 'AND id <> $4::uuid' : ''}
        AND (start_at, end_at) OVERLAPS ($2::timestamptz, $3::timestamptz)
      `,
      excludeAppointmentId
        ? [staffId, startAt.toISOString(), endAt.toISOString(), excludeAppointmentId]
        : [staffId, startAt.toISOString(), endAt.toISOString()],
    );

    if (conflicts.length > 0) {
      throw new ConflictException('Избраният час вече е зает. Моля, изберете друг.');
    }
  }

  private validateStatusTransition(current: AppointmentStatus, next: AppointmentStatus) {
    const allowed: Record<AppointmentStatus, AppointmentStatus[]> = {
      [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.PROPOSAL_PENDING],
      [AppointmentStatus.PROPOSAL_PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED, AppointmentStatus.PENDING],
      [AppointmentStatus.CONFIRMED]: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
      [AppointmentStatus.COMPLETED]: [],
      [AppointmentStatus.CANCELLED]: [],
      [AppointmentStatus.NO_SHOW]: [],
    };

    if (!allowed[current]?.includes(next)) {
      throw new BadRequestException(`Не може да се смени статус от '${current}' на '${next}'`);
    }
  }
}
