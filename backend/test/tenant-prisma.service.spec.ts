import { TenantPrismaService } from '../src/common/prisma/tenant-prisma.service';

type TenantPrismaServiceHarness = TenantPrismaService & {
  $executeRawUnsafe: jest.Mock;
  $queryRawUnsafe: jest.Mock;
};

function createService(): TenantPrismaServiceHarness {
  const service = Object.create(TenantPrismaService.prototype) as TenantPrismaServiceHarness;

  service.$executeRawUnsafe = jest.fn().mockResolvedValue(undefined);
  service.$queryRawUnsafe = jest.fn();
  (service as any).logger = {
    log: jest.fn(),
  };

  return service;
}

describe('TenantPrismaService calendar allocation compatibility', () => {
  it('uses idempotent DDL so allocation infrastructure can be ensured repeatedly', async () => {
    const service = createService();

    await service.ensureCalendarAllocationsTable('tenant_demo_business');
    await service.ensureCalendarAllocationsTable('tenant_demo_business');

    const statements = service.$executeRawUnsafe.mock.calls.map(([statement]) =>
      String(statement),
    );

    expect(statements.filter((statement) =>
      statement.includes('CREATE EXTENSION IF NOT EXISTS btree_gist'),
    )).toHaveLength(2);
    expect(statements.filter((statement) =>
      statement.includes('CREATE TABLE IF NOT EXISTS "tenant_demo_business".calendar_allocations'),
    )).toHaveLength(2);
    expect(statements.filter((statement) =>
      statement.includes('CREATE INDEX IF NOT EXISTS "idx_tenant_demo_business_calendar_allocations_'),
    )).toHaveLength(8);
    expect(statements.filter((statement) =>
      statement.includes("c.conname = 'calendar_allocations_no_active_exclusive_overlap'"),
    )).toHaveLength(2);
    expect(statements.filter((statement) =>
      statement.includes('ADD CONSTRAINT calendar_allocations_no_active_exclusive_overlap'),
    )).toHaveLength(2);
  });

  it('upgrades every tenant schema already present in the database on startup', async () => {
    const service = createService();
    service.$queryRawUnsafe.mockResolvedValue([
      { schema_name: 'tenant_alpha' },
      { schema_name: 'tenant_beta' },
    ]);
    const ensureSpy = jest
      .spyOn(service, 'ensureCalendarAllocationsTable')
      .mockResolvedValue(undefined);

    await service.ensureExistingTenantCalendarAllocations();

    expect(service.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.tenants t'),
    );
    expect(ensureSpy).toHaveBeenNthCalledWith(1, 'tenant_alpha');
    expect(ensureSpy).toHaveBeenNthCalledWith(2, 'tenant_beta');
    expect((service as any).logger.log).toHaveBeenCalledWith(
      'Calendar allocation infrastructure ensured for 2 existing tenant schema(s)',
    );
  });

  it('rejects unsafe schema names before building tenant DDL', async () => {
    const service = createService();

    await expect(
      service.ensureCalendarAllocationsTable('tenant-demo-business'),
    ).rejects.toThrow('Invalid schema name: tenant-demo-business');
    expect(service.$executeRawUnsafe).not.toHaveBeenCalled();
  });
});
