import { Controller, Get, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

@ApiTags('clients')
@Controller({ path: 'clients', version: '1' })
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ClientsController {
  constructor(private readonly prisma: TenantPrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Всички клиенти с търсене' })
  async findAll(
    @CurrentTenant() tenant: any,
    @Query('q') search?: string,
  ) {
    if (search) {
      return this.prisma.queryInSchema(
        tenant.schemaName,
        `SELECT id, name, phone, email, total_visits, total_spent,
                no_show_count, is_blocked, last_visit_at, created_at
         FROM clients
         WHERE name ILIKE $1 OR phone LIKE $2
         ORDER BY last_visit_at DESC NULLS LAST
         LIMIT 50`,
        [`%${search}%`, `%${search}%`],
      );
    }
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, phone, email, total_visits, total_spent,
              no_show_count, is_blocked, last_visit_at, created_at
       FROM clients
       ORDER BY last_visit_at DESC NULLS LAST, created_at DESC
       LIMIT 100`,
      [],
    );
  }

  @Get(':id/appointments')
  @ApiOperation({ summary: 'История на посещенията на клиент' })
  async clientHistory(
    @CurrentTenant() tenant: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT a.id, a.start_at, a.end_at, a.status, a.price,
              sv.name as service_name, sv.color as service_color,
              s.name as staff_name
       FROM appointments a
       JOIN services sv ON sv.id = a.service_id
       JOIN staff s ON s.id = a.staff_id
       WHERE a.client_id = $1
       ORDER BY a.start_at DESC
       LIMIT 50`,
      [id],
    );
  }
}
