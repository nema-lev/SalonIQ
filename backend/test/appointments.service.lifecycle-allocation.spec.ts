import { BadRequestException, ConflictException } from '@nestjs/common';

import { AppointmentStatus } from '../src/common/types/enums';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';

const TENANT = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'demo-business',
  schemaName: 'tenant_demo_business',
  minAdvanceBookingHours: 1,
  reminderHours: [],
};

const APPOINTMENT_ID = '22222222-2222-4222-8222-222222222222';
const ALLOCATION_ID = '33333333-3333-4333-8333-333333333333';
const CLIENT_ID = '44444444-4444-4444-8444-444444444444';
const SERVICE_ID = '55555555-5555-4555-8555-555555555555';
const STAFF_ID = '66666666-6666-4666-8666-666666666666';
const NEXT_STAFF_ID = '77777777-7777-4777-8777-777777777777';
const START_AT = '2026-05-20T10:00:00+03:00';
const START_AT_UTC = '2026-05-20T07:00:00.000Z';
const END_AT_UTC = '2026-05-20T08:00:00.000Z';
const NEXT_START_AT = '2026-05-20T12:00:00+03:00';
const NEXT_START_AT_UTC = '2026-05-20T09:00:00.000Z';
const NEXT_END_AT_UTC = '2026-05-20T10:00:00.000Z';

const standardServiceRow = {
  id: SERVICE_ID,
  duration_minutes: 60,
  price: '45.00',
  name: 'Haircut',
  requires_confirmation: false,
  buffer_before_min: 0,
  buffer_after_min: 0,
  booking_mode: 'standard',
  slot_capacity: 1,
  group_days: [],
  group_time_slots: [],
};

const groupServiceRow = {
  ...standardServiceRow,
  booking_mode: 'group',
  group_days: ['wed'],
  group_time_slots: ['10:00'],
};

const existingClientRow = {
  id: CLIENT_ID,
  name: 'Maria Ivanova',
  profile_data: {},
};

const openStaffHours = {
  wed: { open: '09:00', close: '18:00', isOpen: true },
};

const createDto = {
  serviceId: SERVICE_ID,
  staffId: STAFF_ID,
  startAt: START_AT,
  clientName: 'Maria Ivanova',
  clientPhone: '+359888123456',
};

function createService(options: {
  queryResults?: unknown[];
  txResults?: Array<unknown | Error>;
} = {}) {
  const tx = {
    $queryRawUnsafe: jest.fn(),
  };

  for (const result of options.txResults || []) {
    if (result instanceof Error) {
      tx.$queryRawUnsafe.mockRejectedValueOnce(result);
    } else {
      tx.$queryRawUnsafe.mockResolvedValueOnce(result);
    }
  }

  const queryInSchema = jest.fn();
  for (const result of options.queryResults || []) {
    queryInSchema.mockResolvedValueOnce(result);
  }

  const notificationQueue = { add: jest.fn() };
  const notificationProcessor = { process: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    ensureServiceGroupColumns: jest.fn().mockResolvedValue(undefined),
    ensureCalendarAllocationsTable: jest.fn().mockResolvedValue(undefined),
    queryInSchema,
    withTenantSchema: jest.fn(async (_schemaName: string, fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };

  const service = new AppointmentsService(
    prisma as any,
    notificationQueue as any,
    notificationProcessor as any,
  );

  return { service, prisma, tx, notificationQueue, notificationProcessor };
}

function standardCreateQueryResults(serviceRow = standardServiceRow) {
  return [[serviceRow], [existingClientRow], []];
}

function expectAllocationInsert(tx: { $queryRawUnsafe: jest.Mock }) {
  const insertCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
    String(call[0]).includes('INSERT INTO calendar_allocations'),
  );
  expect(insertCall).toBeDefined();
  return insertCall as unknown[];
}

describe('AppointmentsService standard appointment allocation lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-19T06:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects public exact-time create when the requested start is in the past', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create(TENANT as any, {
        ...createDto,
        startAt: '2026-05-19T08:45:00+03:00',
      } as any),
    ).rejects.toThrow(new BadRequestException('Не може да запишете час в миналото.'));

    expect(prisma.queryInSchema).not.toHaveBeenCalled();
  });

  it('rejects admin exact-time create when the requested start is in the past', async () => {
    const { service, prisma } = createService();

    await expect(
      service.createByAdmin(TENANT as any, {
        ...createDto,
        startAt: '2026-05-19T08:45:00+03:00',
      } as any),
    ).rejects.toThrow(new BadRequestException('Не може да запишете час в миналото.'));

    expect(prisma.queryInSchema).not.toHaveBeenCalled();
  });

  it('writes a booked allocation for public exact-time create', async () => {
    const { service, prisma, tx } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], [{ id: ALLOCATION_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).resolves.toMatchObject({
      id: APPOINTMENT_ID,
      status: AppointmentStatus.CONFIRMED,
    });

    expect(prisma.ensureCalendarAllocationsTable).toHaveBeenCalledWith(TENANT.schemaName);
    expect(prisma.withTenantSchema).toHaveBeenCalledWith(TENANT.schemaName, expect.any(Function));

    const allocationInsert = expectAllocationInsert(tx);
    expect(allocationInsert[1]).toBe(APPOINTMENT_ID);
    expect(allocationInsert[2]).toBe(STAFF_ID);
    expect(allocationInsert[3]).toBe('booked');
    expect(allocationInsert[4]).toBe(START_AT_UTC);
    expect(allocationInsert[5]).toBe(END_AT_UTC);
  });

  it('writes a booked allocation for admin exact-time create', async () => {
    const { service, tx } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], [{ id: ALLOCATION_ID }]],
    });

    await expect(service.createByAdmin(TENANT as any, createDto as any)).resolves.toMatchObject({
      id: APPOINTMENT_ID,
      status: AppointmentStatus.CONFIRMED,
    });

    expect(expectAllocationInsert(tx)[3]).toBe('booked');
  });

  it('writes a held allocation for pending exact-time create', async () => {
    const { service, tx } = createService({
      queryResults: standardCreateQueryResults({
        ...standardServiceRow,
        requires_confirmation: true,
      }),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], [{ id: ALLOCATION_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).resolves.toMatchObject({
      id: APPOINTMENT_ID,
      status: AppointmentStatus.PENDING,
    });

    expect(expectAllocationInsert(tx)[3]).toBe('held');
  });

  it('expands occupied interval by service buffers during create', async () => {
    const { service, tx } = createService({
      queryResults: standardCreateQueryResults({
        ...standardServiceRow,
        buffer_before_min: 15,
        buffer_after_min: 10,
      }),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], [{ id: ALLOCATION_ID }]],
    });

    await service.create(TENANT as any, createDto as any);

    const allocationInsert = expectAllocationInsert(tx);
    expect(allocationInsert[6]).toBe('2026-05-20T06:45:00.000Z');
    expect(allocationInsert[7]).toBe('2026-05-20T08:10:00.000Z');
    expect(allocationInsert[8]).toBe(15);
    expect(allocationInsert[9]).toBe(10);
  });

  it('rejects create on active allocation conflict', async () => {
    const { service } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[{ id: ALLOCATION_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects create on legacy appointment fallback conflict', async () => {
    const { service } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[], [{ id: APPOINTMENT_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('allows adjacent half-open create intervals when occupied intervals do not overlap', async () => {
    const { service, tx } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], [{ id: ALLOCATION_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).resolves.toMatchObject({
      id: APPOINTMENT_ID,
    });

    const allocationConflictCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('FROM calendar_allocations'),
    );
    expect(String(allocationConflictCall?.[0])).toContain('occupied_start_at < $3::timestamptz');
    expect(String(allocationConflictCall?.[0])).toContain('occupied_end_at > $2::timestamptz');
  });

  it('rejects create when only service buffers overlap', async () => {
    const { service, tx } = createService({
      queryResults: standardCreateQueryResults({
        ...standardServiceRow,
        buffer_before_min: 15,
      }),
      txResults: [[], [{ id: APPOINTMENT_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );

    const legacyConflictCall = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('JOIN services sv'),
    );
    expect(legacyConflictCall?.[2]).toBe('2026-05-20T06:45:00.000Z');
    expect(legacyConflictCall?.[3]).toBe(END_AT_UTC);
  });

  it('maps create allocation exclusion races to a clean conflict', async () => {
    const { service } = createService({
      queryResults: standardCreateQueryResults(),
      txResults: [[], [], [{ id: APPOINTMENT_ID }], Object.assign(new Error('race'), { code: '23P01' })],
    });

    await expect(service.create(TENANT as any, createDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keeps group-service create behavior unchanged and does not create a standard allocation', async () => {
    const { service, prisma, tx } = createService({
      queryResults: [[groupServiceRow], [existingClientRow], [], [], [{ id: APPOINTMENT_ID }]],
    });

    await expect(service.create(TENANT as any, createDto as any)).resolves.toMatchObject({
      id: APPOINTMENT_ID,
    });

    expect(prisma.ensureCalendarAllocationsTable).not.toHaveBeenCalled();
    expect(prisma.withTenantSchema).not.toHaveBeenCalled();
    expect(tx.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('promotes held allocation to booked when a pending appointment is confirmed', async () => {
    const { service, tx } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            status: AppointmentStatus.PENDING,
            start_at: START_AT_UTC,
            intake_data: {},
            booking_mode: 'standard',
          },
        ],
        [],
        [],
      ],
    });

    await expect(
      service.updateStatus(TENANT as any, APPOINTMENT_ID, AppointmentStatus.CONFIRMED),
    ).resolves.toEqual({ id: APPOINTMENT_ID, status: AppointmentStatus.CONFIRMED });

    const allocationUpdate = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('UPDATE calendar_allocations'),
    );
    expect(allocationUpdate?.[2]).toBe('booked');
  });

  it.each([
    AppointmentStatus.CANCELLED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.NO_SHOW,
  ])('deactivates allocation when appointment becomes %s', async (newStatus) => {
    const txResults =
      newStatus === AppointmentStatus.NO_SHOW
        ? [
            [
              {
                id: APPOINTMENT_ID,
                client_id: CLIENT_ID,
                status: AppointmentStatus.CONFIRMED,
                start_at: START_AT_UTC,
                intake_data: {},
                booking_mode: 'standard',
              },
            ],
            [],
            [],
            [],
          ]
        : [
            [
              {
                id: APPOINTMENT_ID,
                client_id: CLIENT_ID,
                status: AppointmentStatus.CONFIRMED,
                start_at: START_AT_UTC,
                intake_data: {},
                booking_mode: 'standard',
              },
            ],
            [],
            [],
          ];
    const { service, tx } = createService({ txResults });

    await expect(
      service.updateStatus(TENANT as any, APPOINTMENT_ID, newStatus),
    ).resolves.toEqual({ id: APPOINTMENT_ID, status: newStatus });

    const allocationUpdate = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('UPDATE calendar_allocations'),
    );
    expect(allocationUpdate?.[2]).toBe(newStatus);
  });

  it('allows terminal status transitions for an existing historical appointment', async () => {
    jest.setSystemTime(new Date('2026-05-21T06:00:00.000Z'));

    const { service } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            status: AppointmentStatus.CONFIRMED,
            start_at: START_AT_UTC,
            intake_data: {},
            booking_mode: 'standard',
          },
        ],
        [],
        [],
      ],
    });

    await expect(
      service.updateStatus(TENANT as any, APPOINTMENT_ID, AppointmentStatus.COMPLETED),
    ).resolves.toEqual({ id: APPOINTMENT_ID, status: AppointmentStatus.COMPLETED });
  });

  it('reschedules appointment and matching allocation atomically without leaving the old active slot', async () => {
    const { service, tx, notificationProcessor } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_ID,
            service_id: SERVICE_ID,
            status: AppointmentStatus.CONFIRMED,
            intake_data: {},
            duration_minutes: 60,
            buffer_before_min: 15,
            buffer_after_min: 10,
            booking_mode: 'standard',
          },
        ],
        [{ working_hours: openStaffHours }],
        [],
        [],
        [],
        [],
        [{ id: ALLOCATION_ID }],
      ],
    });

    await expect(
      service.rescheduleAppointment(TENANT as any, APPOINTMENT_ID, NEXT_START_AT, NEXT_STAFF_ID),
    ).resolves.toMatchObject({
      id: APPOINTMENT_ID,
      staffId: NEXT_STAFF_ID,
      startAt: new Date(NEXT_START_AT),
      endAt: new Date(NEXT_END_AT_UTC),
    });

    const allocationUpdate = tx.$queryRawUnsafe.mock.calls.find((call) =>
      String(call[0]).includes('UPDATE calendar_allocations'),
    );
    expect(allocationUpdate?.[2]).toBe(NEXT_STAFF_ID);
    expect(allocationUpdate?.[4]).toBe(NEXT_START_AT_UTC);
    expect(allocationUpdate?.[5]).toBe(NEXT_END_AT_UTC);
    expect(allocationUpdate?.[6]).toBe('2026-05-20T08:45:00.000Z');
    expect(allocationUpdate?.[7]).toBe('2026-05-20T10:10:00.000Z');
    expect(notificationProcessor.process).not.toHaveBeenCalled();
  });

  it('creates a missing legacy allocation during a safe reschedule', async () => {
    const { service, tx } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_ID,
            service_id: SERVICE_ID,
            status: AppointmentStatus.CONFIRMED,
            intake_data: {},
            duration_minutes: 60,
            buffer_before_min: 0,
            buffer_after_min: 0,
            booking_mode: 'standard',
          },
        ],
        [{ working_hours: openStaffHours }],
        [],
        [],
        [],
        [],
        [],
        [{ id: ALLOCATION_ID }],
      ],
    });

    await service.rescheduleAppointment(TENANT as any, APPOINTMENT_ID, NEXT_START_AT, NEXT_STAFF_ID);

    const allocationInsert = expectAllocationInsert(tx);
    expect(allocationInsert[1]).toBe(APPOINTMENT_ID);
    expect(JSON.parse(String(allocationInsert[10]))).toEqual({
      legacyRecoveredDuringReschedule: true,
    });
  });

  it('rejects reschedule on active allocation conflict', async () => {
    const { service } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_ID,
            service_id: SERVICE_ID,
            status: AppointmentStatus.CONFIRMED,
            intake_data: {},
            duration_minutes: 60,
            buffer_before_min: 0,
            buffer_after_min: 0,
            booking_mode: 'standard',
          },
        ],
        [{ working_hours: openStaffHours }],
        [],
        [{ id: ALLOCATION_ID }],
      ],
    });

    await expect(
      service.rescheduleAppointment(TENANT as any, APPOINTMENT_ID, NEXT_START_AT, NEXT_STAFF_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects reschedule on legacy appointment fallback conflict', async () => {
    const { service } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_ID,
            service_id: SERVICE_ID,
            status: AppointmentStatus.CONFIRMED,
            intake_data: {},
            duration_minutes: 60,
            buffer_before_min: 0,
            buffer_after_min: 0,
            booking_mode: 'standard',
          },
        ],
        [{ working_hours: openStaffHours }],
        [],
        [],
        [{ id: '88888888-8888-4888-8888-888888888888' }],
      ],
    });

    await expect(
      service.rescheduleAppointment(TENANT as any, APPOINTMENT_ID, NEXT_START_AT, NEXT_STAFF_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects reschedule when moving an appointment into the past', async () => {
    jest.setSystemTime(new Date('2026-05-20T10:30:00.000Z'));

    const { service, tx } = createService({
      txResults: [
        [
          {
            id: APPOINTMENT_ID,
            client_id: CLIENT_ID,
            staff_id: STAFF_ID,
            service_id: SERVICE_ID,
            status: AppointmentStatus.CONFIRMED,
            intake_data: {},
            duration_minutes: 60,
            buffer_before_min: 0,
            buffer_after_min: 0,
            booking_mode: 'standard',
          },
        ],
      ],
    });

    await expect(
      service.rescheduleAppointment(
        TENANT as any,
        APPOINTMENT_ID,
        '2026-05-20T12:15:00+03:00',
        NEXT_STAFF_ID,
      ),
    ).rejects.toThrow(new BadRequestException('Не може да запишете час в миналото.'));

    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
  });
});
