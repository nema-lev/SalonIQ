import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { addMinutes, isBefore, isAfter, addHours, startOfDay, endOfDay, format } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { AppointmentStatus, NotificationJobType } from '../../common/types/enums';
import type { Tenant } from '@prisma/client';

const TIMEZONE = 'Europe/Sofia';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private readonly prisma: TenantPrismaService,
    @InjectQueue('notifications') private readonly notificationQueue: Queue,
  ) {}

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
        ${staffId ? 'AND a.staff_id = $3' : ''}
      ORDER BY a.start_at ASC
      `,
      staffId ? [dayStart, dayEnd, staffId] : [dayStart, dayEnd],
    );

    return rows;
  }

  /**
   * Получава свободните слотове за конкретна дата, услуга и служител
   */
  async getAvailableSlots(
    tenant: Tenant,
    serviceId: string,
    staffId: string,
    date: Date,
  ): Promise<{ start: string; end: string }[]> {
    // 1. Вземи услугата
    const services = await this.prisma.queryInSchema<{ duration_minutes: number; buffer_before_min: number; buffer_after_min: number }[]>(
      tenant.schemaName,
      `SELECT duration_minutes, buffer_before_min, buffer_after_min FROM services WHERE id = $1`,
      [serviceId],
    );

    if (!services.length) throw new NotFoundException('Услугата не е намерена');
    const service = services[0];
    const totalDuration = service.duration_minutes + service.buffer_before_min + service.buffer_after_min;

    // 2. Вземи работното време на служителя за този ден
    const dayOfWeek = format(toZonedTime(date, TIMEZONE), 'EEE').toLowerCase(); // mon, tue, ...
    const staffRows = await this.prisma.queryInSchema<{ working_hours: Record<string, { open: string; close: string; isOpen: boolean }> }[]>(
      tenant.schemaName,
      `SELECT working_hours FROM staff WHERE id = $1 AND is_active = true`,
      [staffId],
    );

    if (!staffRows.length) throw new NotFoundException('Служителят не е намерен');

    const daySchedule = staffRows[0].working_hours[dayOfWeek];
    if (!daySchedule?.isOpen) return []; // Почивен ден

    // 3. Намери заетите интервали за деня
    const zonedDate = toZonedTime(date, TIMEZONE);
    const dayStart = fromZonedTime(startOfDay(zonedDate), TIMEZONE);
    const dayEnd = fromZonedTime(endOfDay(zonedDate), TIMEZONE);

    const bookedSlots = await this.prisma.queryInSchema<{ start_at: Date; end_at: Date }[]>(
      tenant.schemaName,
      `
      SELECT start_at, end_at FROM appointments
      WHERE staff_id = $1
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
      WHERE staff_id = $1
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

    const minAdvanceTime = addHours(new Date(), tenant.minAdvanceBookingHours);
    const maxAdvanceTime = addHours(new Date(), tenant.maxAdvanceBookingDays * 24);

    const slots: { start: string; end: string }[] = [];
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
  async create(tenant: Tenant, dto: CreateAppointmentDto) {
    // 1. Валидация на услугата
    const services = await this.prisma.queryInSchema<{ id: string; duration_minutes: number; price: number; name: string; requires_confirmation: boolean; buffer_before_min: number; buffer_after_min: number }[]>(
      tenant.schemaName,
      `SELECT * FROM services WHERE id = $1 AND is_public = true`,
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
    const conflicts = await this.prisma.queryInSchema<unknown[]>(
      tenant.schemaName,
      `
      SELECT id FROM appointments
      WHERE staff_id = $1
        AND status NOT IN ('cancelled', 'no_show')
        AND (start_at, end_at) OVERLAPS ($2::timestamptz, $3::timestamptz)
      `,
      [dto.staffId, startAt.toISOString(), endAt.toISOString()],
    );

    if (conflicts.length > 0) {
      throw new ConflictException('Избраният час вече е зает. Моля, изберете друг.');
    }

    // 5. Провери напред/назад лимити
    const minStart = addHours(new Date(), tenant.minAdvanceBookingHours);
    if (isBefore(startAt, minStart)) {
      throw new BadRequestException(
        `Резервации се приемат минимум ${tenant.minAdvanceBookingHours} час(а) предварително.`,
      );
    }

    // 6. Определи статуса
    const status = tenant.requiresConfirmation || service.requires_confirmation
      ? AppointmentStatus.PENDING
      : AppointmentStatus.CONFIRMED;

    // 7. Създай резервацията
    const rows = await this.prisma.queryInSchema<{ id: string }[]>(
      tenant.schemaName,
      `
      INSERT INTO appointments (
        client_id, staff_id, service_id,
        start_at, end_at, status,
        price, currency, booked_by,
        client_notes, intake_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        'BGN',
        'client',
        dto.notes || null,
        JSON.stringify(dto.intakeData || {}),
      ],
    );

    const appointmentId = rows[0].id;

    // 8. Постави в notification queue
    await this.scheduleNotifications(tenant, appointmentId, clientId, status, startAt);

    this.logger.log(`Appointment ${appointmentId} created for tenant ${tenant.slug}`);
    return { id: appointmentId, status, startAt, endAt };
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
    const appointments = await this.prisma.queryInSchema<{ id: string; client_id: string; status: string; start_at: Date }[]>(
      tenant.schemaName,
      `SELECT id, client_id, status, start_at FROM appointments WHERE id = $1`,
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
        `UPDATE clients SET no_show_count = no_show_count + 1 WHERE id = $1`,
        [appointment.client_id],
      );
    }

    await this.prisma.queryInSchema(
      tenant.schemaName,
      `UPDATE appointments SET status = $1, cancellation_reason = $2, 
       cancelled_by = $3, cancelled_at = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        newStatus,
        updateFields.cancellation_reason || null,
        updateFields.cancelled_by || null,
        updateFields.cancelled_at || null,
        appointmentId,
      ],
    );

    // Изпрати известие за промяната
    await this.notificationQueue.add('status-changed', {
      tenantId: tenant.id,
      tenantSchemaName: tenant.schemaName,
      appointmentId,
      clientId: appointment.client_id,
      newStatus,
      reason,
    });

    return { id: appointmentId, status: newStatus };
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async findOrCreateClient(schemaName: string, dto: CreateAppointmentDto): Promise<string> {
    const existing = await this.prisma.queryInSchema<{ id: string }[]>(
      schemaName,
      `SELECT id FROM clients WHERE phone = $1 LIMIT 1`,
      [dto.clientPhone],
    );

    if (existing.length) return existing[0].id;

    const created = await this.prisma.queryInSchema<{ id: string }[]>(
      schemaName,
      `INSERT INTO clients (name, phone, email, notifications_consent, consent_given_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      [dto.clientName, dto.clientPhone, dto.clientEmail || null, dto.consentGiven ?? true],
    );

    return created[0].id;
  }

  private async scheduleNotifications(
    tenant: Tenant,
    appointmentId: string,
    clientId: string,
    status: AppointmentStatus,
    startAt: Date,
  ) {
    const baseData = {
      tenantId: tenant.id,
      tenantSchemaName: tenant.schemaName,
      appointmentId,
      clientId,
    };

    // Незабавно потвърждение
    await this.notificationQueue.add(
      NotificationJobType.BOOKING_CONFIRMED,
      { ...baseData, status },
      { delay: 0 },
    );

    // Reminder 24ч преди
    const reminder24h = addHours(startAt, -24).getTime() - Date.now();
    if (reminder24h > 0 && tenant.reminderHours.includes(24)) {
      await this.notificationQueue.add(
        NotificationJobType.REMINDER_24H,
        baseData,
        { delay: reminder24h, jobId: `reminder-24h-${appointmentId}` },
      );
    }

    // Reminder 2ч преди
    const reminder2h = addHours(startAt, -2).getTime() - Date.now();
    if (reminder2h > 0 && tenant.reminderHours.includes(2)) {
      await this.notificationQueue.add(
        NotificationJobType.REMINDER_2H,
        baseData,
        { delay: reminder2h, jobId: `reminder-2h-${appointmentId}` },
      );
    }
  }

  private validateStatusTransition(current: AppointmentStatus, next: AppointmentStatus) {
    const allowed: Record<AppointmentStatus, AppointmentStatus[]> = {
      [AppointmentStatus.PENDING]: [AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
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
