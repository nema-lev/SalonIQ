import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

@ApiTags('staff')
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Публичен списък на активния персонал (по избор: за конкретна услуга) */
  @Get()
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Активен персонал (по избор филтриран по услуга)' })
  async findAll(
    @CurrentTenant() tenant: any,
    @Query('serviceId') serviceId?: string,
  ) {
    if (serviceId) {
      // Само служители, предлагащи конкретна услуга
      return this.prisma.queryInSchema(
        tenant.schemaName,
        `SELECT s.id, s.name, s.avatar_url, s.bio, s.specialties, s.color
         FROM staff s
         JOIN services sv ON sv.id = $1 AND s.id = ANY(sv.staff_ids)
         WHERE s.is_active = true AND s.accepts_online = true
         ORDER BY s.name ASC`,
        [serviceId],
      );
    }

    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, avatar_url, bio, specialties, color
       FROM staff
       WHERE is_active = true AND accepts_online = true
       ORDER BY name ASC`,
      [],
    );
  }
}
