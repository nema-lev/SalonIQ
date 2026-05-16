import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InternalDiagnosticsController } from '../src/modules/internal-diagnostics/internal-diagnostics.controller';
import { InternalDiagnosticsService } from '../src/modules/internal-diagnostics/internal-diagnostics.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantGuard } from '../src/common/guards/tenant.guard';
import { TenantOwnerAdminGuard } from '../src/common/guards/tenant-owner-admin.guard';

function createService(overrides: Partial<InternalDiagnosticsService> = {}) {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    runCalendarAllocationBackfillReport: jest.fn().mockResolvedValue({
      generatedAt: '2026-05-16T00:00:00.000Z',
      mode: 'READ_ONLY',
      tenants: [],
    }),
    ...overrides,
  } as unknown as InternalDiagnosticsService;
}

describe('InternalDiagnosticsController', () => {
  const tenant = {
    schemaName: 'tenant_demo_business',
  } as any;

  it('requires existing JWT, tenant, and OWNER/ADMIN guards', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InternalDiagnosticsController.prototype.getCalendarAllocationBackfillReport,
    );

    expect(guards).toEqual([JwtAuthGuard, TenantGuard, TenantOwnerAdminGuard]);
  });

  it('returns 404 while diagnostics are disabled', async () => {
    const service = createService({
      isEnabled: jest.fn().mockReturnValue(false),
    });
    const controller = new InternalDiagnosticsController(service);

    await expect(
      controller.getCalendarAllocationBackfillReport(tenant),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.runCalendarAllocationBackfillReport).not.toHaveBeenCalled();
  });

  it('returns the report for the authenticated tenant when diagnostics are enabled', async () => {
    const service = createService();
    const controller = new InternalDiagnosticsController(service);

    await expect(
      controller.getCalendarAllocationBackfillReport(tenant),
    ).resolves.toEqual({
      generatedAt: '2026-05-16T00:00:00.000Z',
      mode: 'READ_ONLY',
      tenants: [],
    });
    expect(service.runCalendarAllocationBackfillReport).toHaveBeenCalledWith('tenant_demo_business');
  });

  it('rejects cross-tenant schema filters', async () => {
    const service = createService();
    const controller = new InternalDiagnosticsController(service);

    await expect(
      controller.getCalendarAllocationBackfillReport(tenant, 'tenant_other_business'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.runCalendarAllocationBackfillReport).not.toHaveBeenCalled();
  });
});
