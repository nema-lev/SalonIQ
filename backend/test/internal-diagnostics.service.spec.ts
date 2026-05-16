import { ConfigService } from '@nestjs/config';
import { InternalDiagnosticsService } from '../src/modules/internal-diagnostics/internal-diagnostics.service';

jest.mock('pg', () => ({
  Client: jest.fn(),
}));

const { Client } = require('pg') as { Client: jest.Mock };
const mockedClient = Client;

function queueReadOnlyReportResults(query: jest.Mock) {
  query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN READ ONLY
    .mockResolvedValueOnce({ rows: [{ schema_name: 'tenant_demo_business' }] })
    .mockResolvedValueOnce({ rows: [{ exists: true }] })
    .mockResolvedValueOnce({ rows: [] }) // service columns
    .mockResolvedValueOnce({ rows: [{ exists: false }] }) // table exists
    .mockResolvedValueOnce({ rows: [] }) // active appointments
    .mockResolvedValueOnce({ rows: [] }) // legacy overlaps
    .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
}

describe('InternalDiagnosticsService', () => {
  beforeEach(() => {
    mockedClient.mockReset();
  });

  it('runs the existing report path inside BEGIN READ ONLY and does not issue write queries', async () => {
    const query = jest.fn();
    const connect = jest.fn().mockResolvedValue(undefined);
    const end = jest.fn().mockResolvedValue(undefined);
    queueReadOnlyReportResults(query);
    mockedClient.mockImplementation(() => ({ connect, query, end }));

    const config = {
      getOrThrow: jest.fn().mockReturnValue('postgresql://example'),
      get: jest.fn(),
    } as unknown as ConfigService;
    const service = new InternalDiagnosticsService(config);

    await expect(
      service.runCalendarAllocationBackfillReport('tenant_demo_business'),
    ).resolves.toMatchObject({
      mode: 'READ_ONLY',
      tenants: [
        {
          schemaName: 'tenant_demo_business',
          readiness: 'BLOCKED_BY_SCHEMA',
        },
      ],
    });

    const statements = query.mock.calls.map(([statement]) => String(statement).trim());
    expect(statements[0]).toBe('BEGIN READ ONLY');
    expect(statements[statements.length - 1]).toBe('ROLLBACK');
    expect(
      statements.some((statement) =>
        /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(statement),
      ),
    ).toBe(false);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(end).toHaveBeenCalledTimes(1);
  });
});
