import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Tenant } from '@prisma/client';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { TenantOwnerAdminGuard } from '../../common/guards/tenant-owner-admin.guard';
import { InternalDiagnosticsService } from './internal-diagnostics.service';

@ApiTags('internal-diagnostics')
@Controller({ path: 'internal/diagnostics', version: '1' })
export class InternalDiagnosticsController {
  constructor(private readonly internalDiagnosticsService: InternalDiagnosticsService) {}

  @Get('calendar-allocation-backfill-report')
  @UseGuards(JwtAuthGuard, TenantGuard, TenantOwnerAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Read-only Calendar allocation backfill readiness report for the authenticated tenant' })
  @ApiQuery({
    name: 'schema',
    required: false,
    description: 'Optional tenant schema filter; must match the authenticated tenant schema.',
  })
  async getCalendarAllocationBackfillReport(
    @CurrentTenant() tenant: Tenant & { schemaName: string },
    @Query('schema') requestedSchema?: string,
  ) {
    if (!this.internalDiagnosticsService.isEnabled()) {
      throw new NotFoundException('Diagnostics endpoint is disabled.');
    }

    const schemaName = requestedSchema?.trim() || tenant.schemaName;
    if (schemaName !== tenant.schemaName) {
      throw new ForbiddenException('Diagnostics schema filter must match the authenticated tenant.');
    }

    return this.internalDiagnosticsService.runCalendarAllocationBackfillReport(schemaName);
  }
}
