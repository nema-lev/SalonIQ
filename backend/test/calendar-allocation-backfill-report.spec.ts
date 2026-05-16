const {
  inspectTenant,
  runReadOnlyReport,
} = require('../scripts/calendar-allocation-backfill-report');

const SCHEMA = 'tenant_demo_business';
const REQUIRED_INDEXES = [
  'idx_tenant_demo_business_calendar_allocations_resource',
  'idx_tenant_demo_business_calendar_allocations_occupied_interval',
  'idx_tenant_demo_business_calendar_allocations_source',
  'idx_tenant_demo_business_calendar_allocations_status',
];

function createInspectionClient(results: unknown[]) {
  return {
    query: jest.fn(),
  } as { query: jest.Mock };
}

function queueInspectionResults(client: { query: jest.Mock }, overrides: Record<string, unknown> = {}) {
  const values = {
    serviceColumns: [
      { column_name: 'booking_mode' },
      { column_name: 'buffer_before_min' },
      { column_name: 'buffer_after_min' },
    ],
    tableExists: [{ exists: true }],
    constraintExists: [{ exists: true }],
    indexes: REQUIRED_INDEXES.map((indexname) => ({ indexname })),
    activeAppointments: [],
    missingAllocations: [],
    terminalAllocations: [],
    orphanAllocations: [],
    duplicateAllocations: [],
    legacyOverlaps: [],
    bufferOnlyConflicts: [],
    allocationOverlaps: [],
    ...overrides,
  };

  client.query
    .mockResolvedValueOnce({ rows: values.serviceColumns })
    .mockResolvedValueOnce({ rows: values.tableExists })
    .mockResolvedValueOnce({ rows: values.constraintExists })
    .mockResolvedValueOnce({ rows: values.indexes })
    .mockResolvedValueOnce({ rows: values.activeAppointments })
    .mockResolvedValueOnce({ rows: values.missingAllocations })
    .mockResolvedValueOnce({ rows: values.terminalAllocations })
    .mockResolvedValueOnce({ rows: values.orphanAllocations })
    .mockResolvedValueOnce({ rows: values.duplicateAllocations })
    .mockResolvedValueOnce({ rows: values.allocationOverlaps })
    .mockResolvedValueOnce({ rows: values.legacyOverlaps })
    .mockResolvedValueOnce({ rows: values.bufferOnlyConflicts });
}

describe('calendar allocation backfill dry-run report', () => {
  it('identifies missing allocation, orphan allocation, and terminal appointment with active allocation', async () => {
    const client = createInspectionClient([]);
    queueInspectionResults(client, {
      activeAppointments: [
        {
          appointment_id: 'appointment-active',
          staff_id: 'staff-1',
          service_id: 'service-1',
          status: 'confirmed',
          start_at: '2026-05-20 07:00:00+00',
          end_at: '2026-05-20 08:00:00+00',
        },
      ],
      missingAllocations: [
        {
          appointment_id: 'appointment-active',
          staff_id: 'staff-1',
          service_id: 'service-1',
          status: 'confirmed',
          start_at: '2026-05-20 07:00:00+00',
          end_at: '2026-05-20 08:00:00+00',
        },
      ],
      terminalAllocations: [
        {
          appointment_id: 'appointment-terminal',
          appointment_status: 'completed',
          allocation_id: 'allocation-terminal',
          allocation_status: 'booked',
        },
      ],
      orphanAllocations: [
        {
          allocation_id: 'allocation-orphan',
          source_id: 'appointment-missing',
          staff_id: 'staff-1',
          status: 'held',
        },
      ],
    });

    const report = await inspectTenant(client, SCHEMA, { btreeGistInstalled: true });

    expect(report.activeAppointmentsMissingAllocations).toHaveLength(1);
    expect(report.terminalAppointmentsWithActiveAllocations).toHaveLength(1);
    expect(report.orphanAllocations).toHaveLength(1);
    expect(report.readiness).toBe('NEEDS_MANUAL_REVIEW');
  });

  it('identifies overlapping legacy appointments and buffer-only conflicts', async () => {
    const client = createInspectionClient([]);
    queueInspectionResults(client, {
      legacyOverlaps: [
        {
          first_appointment_id: 'appointment-1',
          second_appointment_id: 'appointment-2',
          staff_id: 'staff-1',
        },
      ],
      bufferOnlyConflicts: [
        {
          first_appointment_id: 'appointment-3',
          second_appointment_id: 'appointment-4',
          staff_id: 'staff-1',
        },
      ],
    });

    const report = await inspectTenant(client, SCHEMA, { btreeGistInstalled: true });

    expect(report.overlappingLegacyAppointmentPairs).toHaveLength(1);
    expect(report.bufferOnlyConflictPairs).toHaveLength(1);
    expect(report.readiness).toBe('BLOCKED_BY_OVERLAPS');
  });

  it('classifies a clean tenant as READY_FOR_BACKFILL even when active appointments still need backfill allocations', async () => {
    const client = createInspectionClient([]);
    queueInspectionResults(client, {
      activeAppointments: [
        {
          appointment_id: 'appointment-active',
          staff_id: 'staff-1',
          service_id: 'service-1',
          status: 'confirmed',
          start_at: '2026-05-20 07:00:00+00',
          end_at: '2026-05-20 08:00:00+00',
        },
      ],
      missingAllocations: [
        {
          appointment_id: 'appointment-active',
          staff_id: 'staff-1',
          service_id: 'service-1',
          status: 'confirmed',
          start_at: '2026-05-20 07:00:00+00',
          end_at: '2026-05-20 08:00:00+00',
        },
      ],
    });

    const report = await inspectTenant(client, SCHEMA, { btreeGistInstalled: true });

    expect(report.activeAppointmentsMissingAllocations).toHaveLength(1);
    expect(report.readiness).toBe('READY_FOR_BACKFILL');
  });

  it('uses a read-only transaction and does not issue write queries', async () => {
    const client = createInspectionClient([]);
    client.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN READ ONLY
      .mockResolvedValueOnce({ rows: [{ schema_name: SCHEMA }] })
      .mockResolvedValueOnce({ rows: [{ exists: true }] });
    queueInspectionResults(client);
    client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    await runReadOnlyReport(client);

    const statements = client.query.mock.calls.map(([statement]) => String(statement).trim());
    expect(statements[0]).toBe('BEGIN READ ONLY');
    expect(statements[statements.length - 1]).toBe('ROLLBACK');
    expect(
      statements.some((statement) =>
        /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(statement),
      ),
    ).toBe(false);
  });
});
