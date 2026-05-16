import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type PgClient = {
  connect: () => Promise<void>;
  query: (statement: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  end: () => Promise<void>;
};

const { Client } = require('pg') as {
  Client: new (options: { connectionString: string }) => PgClient;
};

type CalendarAllocationBackfillReport = {
  generatedAt: string;
  mode: 'READ_ONLY';
  tenants: unknown[];
};

type CalendarAllocationBackfillReportModule = {
  runReadOnlyReport: (
    client: Pick<PgClient, 'query'>,
    options: { schemaName: string },
  ) => Promise<CalendarAllocationBackfillReport>;
};

const calendarAllocationBackfillReport =
  require('../../../scripts/calendar-allocation-backfill-report') as CalendarAllocationBackfillReportModule;

@Injectable()
export class InternalDiagnosticsService {
  constructor(private readonly config: ConfigService) {}

  isEnabled() {
    return this.config.get<string>('ENABLE_INTERNAL_DIAGNOSTICS') === 'true';
  }

  async runCalendarAllocationBackfillReport(schemaName: string) {
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
    });

    await client.connect();
    try {
      return await calendarAllocationBackfillReport.runReadOnlyReport(client, {
        schemaName,
      });
    } finally {
      await client.end();
    }
  }
}
