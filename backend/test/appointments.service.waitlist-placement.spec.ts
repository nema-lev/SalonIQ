import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AppointmentStatus } from '../src/common/types/enums';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { PlaceWaitlistEntryDto } from '../src/modules/appointments/dto/place-waitlist-entry.dto';

const TENANT = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'demo-business',
  schemaName: 'tenant_demo_business',
};

const WAITLIST_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '33333333-3333-4333-8333-333333333333';
const ALLOCATION_ID = '77777777-7777-4777-8777-777777777777';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_ID = '66666666-6666-4666-8666-666666666666';
const START_AT = '2026-05-11T10:00:00+03:00';
const START_AT_UTC = '2026-05-11T07:00:00.000Z';
const END_AT_UTC = '2026-05-11T08:00:00.000Z';

const openWaitlist = {
  id: WAITLIST_ID,
  status: 'waiting',
  desired_date: '2026-05-11',
  desired_from: '09:00:00',
  desired_to: '12:00:00',
  notes: 'Prefers quiet room',
  booked_appointment_id: null,
  client_id: CLIENT_ID,
  client_name: 'Maria Ivanova',
  client_phone: '+359888123456',
  service_id: SERVICE_ID,
  preferred_staff_id: null,
};

const serviceRow = {
  id: SERVICE_ID,
  name: 'Haircut',
  price: '45.00',
  currency: 'EUR',
  duration_minutes: 60,
  buffer_before_min: 0,
  buffer_after_min: 0,
  requires_confirmation: false,
  booking_mode: 'standard',
  slot_capacity: 1,
  group_days: [],
  group_time_slots: [],
};

const staffRow = {
  id: STAFF_ID,
  name: 'Nadia',
  color: '#6366f1',
  working_hours: {
    mon: { open: '09:00', close: '18:00', isOpen: true },
  },
};

function createService(tx: { $queryRawUnsafe: jest.Mock }) {
  const notificationQueue = { add: jest.fn() };
  const notificationProcessor = { process: jest.fn() };
  const prisma = {
    ensureWaitlistTable: jest.fn().mockResolvedValue(undefined),
    ensureServiceGroupColumns: jest.fn().mockResolvedValue(undefined),
    ensureCalendarAllocationsTable: jest.fn().mockResolvedValue(undefined),
    withTenantSchema: jest.fn(async (_schemaName: string, fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const service = new AppointmentsService(
    prisma as any,
    notificationQueue as any,
    notificationProcessor as any,
  );

  return { service, prisma, notificationQueue, notificationProcessor };
}

function expectNoInsertOrUpdate(tx: { $queryRawUnsafe: jest.Mock }) {
  const statements = tx.$queryRawUnsafe.mock.calls.map((call) => String(call[0]));
  expect(statements.some((statement) => statement.includes('INSERT INTO appointments'))).toBe(false);
  expect(statements.some((statement) => statement.includes('INSERT INTO calendar_allocations'))).toBe(false);
  expect(statements.some((statement) => statement.includes('UPDATE waitlist'))).toBe(false);
}

describe('AppointmentsService.placeWaitlistEntry', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-10T06:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects past placement startAt before opening the placement transaction', async () => {
    jest.setSystemTime(new Date('2026-05-11T08:30:00.000Z'));

    const tx = { $queryRawUnsafe: jest.fn() };
    const { service, prisma } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toThrow(new BadRequestException('Не може да запишете час в миналото.'));

    expect(prisma.withTenantSchema).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('creates an appointment, booked staff allocation, and booked waitlist row in one tenant transaction', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: START_AT_UTC,
            end_at: END_AT_UTC,
          },
        ])
        .mockResolvedValueOnce([{ id: ALLOCATION_ID }])
        .mockResolvedValueOnce([
          {
            id: WAITLIST_ID,
            status: 'booked',
            booked_appointment_id: APPOINTMENT_ID,
          },
        ]),
    };
    const { service, prisma, notificationQueue, notificationProcessor } = createService(tx);

    const result = await service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
      staffId: STAFF_ID,
      startAt: START_AT,
      durationMinutes: 60,
      idempotencyKey: 'calendar-v2-place:test-key',
      notifyClient: true,
    });

    expect(prisma.ensureWaitlistTable).toHaveBeenCalledWith(TENANT.schemaName);
    expect(prisma.ensureServiceGroupColumns).toHaveBeenCalledWith(TENANT.schemaName);
    expect(prisma.ensureCalendarAllocationsTable).toHaveBeenCalledWith(TENANT.schemaName);
    expect(prisma.withTenantSchema).toHaveBeenCalledWith(TENANT.schemaName, expect.any(Function));
    expect(result).toMatchObject({
      id: APPOINTMENT_ID,
      status: AppointmentStatus.CONFIRMED,
      startAt: START_AT_UTC,
      endAt: END_AT_UTC,
      waitlist: {
        id: WAITLIST_ID,
        status: 'booked',
        bookedAppointmentId: APPOINTMENT_ID,
      },
      notifications: {
        requested: true,
        sent: false,
      },
      idempotencyKey: 'calendar-v2-place:test-key',
    });
    expect(notificationProcessor.process).not.toHaveBeenCalled();
    expect(notificationQueue.add).not.toHaveBeenCalled();

    const insertCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO appointments'),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toBe(CLIENT_ID);
    expect(insertCall?.[2]).toBe(STAFF_ID);
    expect(insertCall?.[3]).toBe(SERVICE_ID);
    expect(insertCall?.[4]).toBe(START_AT_UTC);
    expect(insertCall?.[5]).toBe(END_AT_UTC);
    expect(insertCall?.[6]).toBe(AppointmentStatus.CONFIRMED);
    expect(insertCall?.[9]).toBe(openWaitlist.notes);

    const intakeData = JSON.parse(String(insertCall?.[10]));
    expect(intakeData.waitlistPlacement).toMatchObject({
      waitlistId: WAITLIST_ID,
      previousWaitlistStatus: 'waiting',
      desiredDate: '2026-05-11',
      desiredFrom: '09:00:00',
      desiredTo: '12:00:00',
      idempotencyKey: 'calendar-v2-place:test-key',
      notifyClientRequested: true,
    });

    const allocationInsertCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO calendar_allocations'),
    );
    expect(allocationInsertCall).toBeDefined();
    expect(allocationInsertCall?.[1]).toBe(APPOINTMENT_ID);
    expect(allocationInsertCall?.[2]).toBe(STAFF_ID);
    expect(allocationInsertCall?.[3]).toBe('booked');
    expect(allocationInsertCall?.[4]).toBe(START_AT_UTC);
    expect(allocationInsertCall?.[5]).toBe(END_AT_UTC);
    expect(allocationInsertCall?.[6]).toBe(START_AT_UTC);
    expect(allocationInsertCall?.[7]).toBe(END_AT_UTC);
    expect(allocationInsertCall?.[8]).toBe(0);
    expect(allocationInsertCall?.[9]).toBe(0);
    expect(JSON.parse(String(allocationInsertCall?.[10]))).toEqual({ waitlistId: WAITLIST_ID });
  });

  it('stores occupied interval boundaries expanded by service buffers', async () => {
    const bufferedService = {
      ...serviceRow,
      buffer_before_min: 15,
      buffer_after_min: 10,
    };
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([bufferedService])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: START_AT_UTC,
            end_at: END_AT_UTC,
          },
        ])
        .mockResolvedValueOnce([{ id: ALLOCATION_ID }])
        .mockResolvedValueOnce([
          {
            id: WAITLIST_ID,
            status: 'booked',
            booked_appointment_id: APPOINTMENT_ID,
          },
        ]),
    };
    const { service } = createService(tx);

    await service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
      staffId: STAFF_ID,
      startAt: START_AT,
    });

    const allocationInsertCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO calendar_allocations'),
    );
    expect(allocationInsertCall?.[4]).toBe(START_AT_UTC);
    expect(allocationInsertCall?.[5]).toBe(END_AT_UTC);
    expect(allocationInsertCall?.[6]).toBe('2026-05-11T06:45:00.000Z');
    expect(allocationInsertCall?.[7]).toBe('2026-05-11T08:10:00.000Z');
    expect(allocationInsertCall?.[8]).toBe(15);
    expect(allocationInsertCall?.[9]).toBe(10);
  });

  it('returns not found when the waitlist request does not exist', async () => {
    const tx = { $queryRawUnsafe: jest.fn().mockResolvedValueOnce([]) };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('rejects an already booked waitlist request without creating a duplicate appointment', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
        {
          ...openWaitlist,
          status: 'booked',
          booked_appointment_id: APPOINTMENT_ID,
        },
      ]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);
  });

  it('returns not found when the waitlist service is missing', async () => {
    const tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValueOnce([openWaitlist]).mockResolvedValueOnce([]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectNoInsertOrUpdate(tx);
  });

  it('returns not found when the target staff member is missing or inactive', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectNoInsertOrUpdate(tx);
  });

  it('rejects overlap against an existing active allocation', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: ALLOCATION_ID }]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);
  });

  it('rejects overlap against an existing appointment that has not been backfilled into allocations yet', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: APPOINTMENT_ID }]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);
  });

  it('allows adjacent half-open intervals when no occupied overlap exists', async () => {
    const adjacentStartAt = '2026-05-11T11:00:00+03:00';
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: '2026-05-11T08:00:00.000Z',
            end_at: '2026-05-11T09:00:00.000Z',
          },
        ])
        .mockResolvedValueOnce([{ id: ALLOCATION_ID }])
        .mockResolvedValueOnce([
          {
            id: WAITLIST_ID,
            status: 'booked',
            booked_appointment_id: APPOINTMENT_ID,
          },
        ]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: adjacentStartAt,
      }),
    ).resolves.toMatchObject({
      startAt: '2026-05-11T08:00:00.000Z',
      endAt: '2026-05-11T09:00:00.000Z',
    });

    const allocationConflictCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('FROM calendar_allocations'),
    );
    expect(String(allocationConflictCall?.[0])).toContain('occupied_start_at < $3::timestamptz');
    expect(String(allocationConflictCall?.[0])).toContain('occupied_end_at > $2::timestamptz');
  });

  it('rejects buffer-only overlap even when display intervals do not overlap', async () => {
    const bufferedService = {
      ...serviceRow,
      buffer_before_min: 15,
    };
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([bufferedService])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: APPOINTMENT_ID }]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: '2026-05-11T11:00:00+03:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);

    const legacyConflictCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('JOIN services sv'),
    );
    expect(legacyConflictCall?.[2]).toBe('2026-05-11T07:45:00.000Z');
    expect(legacyConflictCall?.[3]).toBe('2026-05-11T09:00:00.000Z');
  });

  it('rejects placement inside a blocked staff interval', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([{ id: '77777777-7777-4777-8777-777777777777' }]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);
  });

  it('rejects placement outside staff working hours', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([
          {
            ...staffRow,
            working_hours: {
              mon: { open: '12:00', close: '18:00', isOpen: true },
            },
          },
        ]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expectNoInsertOrUpdate(tx);
  });

  it('does not update the waitlist row when appointment creation fails', async () => {
    const insertFailure = new Error('insert failed');
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(insertFailure),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toThrow('insert failed');

    const statements = tx.$queryRawUnsafe.mock.calls.map((call) => String(call[0]));
    expect(statements.some((statement) => statement.includes('INSERT INTO appointments'))).toBe(true);
    expect(statements.some((statement) => statement.includes('UPDATE waitlist'))).toBe(false);
  });

  it('rejects a late double-placement attempt when the conditional waitlist update finds no open row', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: START_AT_UTC,
            end_at: END_AT_UTC,
          },
        ])
        .mockResolvedValueOnce([{ id: ALLOCATION_ID }])
        .mockResolvedValueOnce([]),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const statements = tx.$queryRawUnsafe.mock.calls.map((call) => String(call[0]));
    expect(statements.some((statement) => statement.includes('INSERT INTO appointments'))).toBe(true);
    expect(statements.some((statement) => statement.includes('INSERT INTO calendar_allocations'))).toBe(true);
    expect(statements.some((statement) => statement.includes('UPDATE waitlist'))).toBe(true);
  });

  it('maps a database exclusion-constraint race into a clean conflict error', async () => {
    const tx = {
      $queryRawUnsafe: jest
        .fn()
        .mockResolvedValueOnce([openWaitlist])
        .mockResolvedValueOnce([serviceRow])
        .mockResolvedValueOnce([staffRow])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: START_AT_UTC,
            end_at: END_AT_UTC,
          },
        ])
        .mockRejectedValueOnce({ code: '23P01' }),
    };
    const { service } = createService(tx);

    await expect(
      service.placeWaitlistEntry(TENANT as any, WAITLIST_ID, {
        staffId: STAFF_ID,
        startAt: START_AT,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const statements = tx.$queryRawUnsafe.mock.calls.map((call) => String(call[0]));
    expect(statements.some((statement) => statement.includes('UPDATE waitlist'))).toBe(false);
  });
});

describe('PlaceWaitlistEntryDto', () => {
  it('accepts the placement payload and defaults notifications off', async () => {
    const dto = plainToInstance(PlaceWaitlistEntryDto, {
      staffId: STAFF_ID,
      startAt: START_AT,
      durationMinutes: 60,
      idempotencyKey: 'calendar-v2-place:test-key',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.notifyClient).toBe(false);
  });

  it('rejects invalid ids, dates, duration, and idempotency key shape', async () => {
    const dto = plainToInstance(PlaceWaitlistEntryDto, {
      staffId: 'not-a-uuid',
      startAt: 'not-a-date',
      durationMinutes: 0,
      idempotencyKey: 'bad key',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining([
      'staffId',
      'startAt',
      'durationMinutes',
      'idempotencyKey',
    ]));
  });
});
