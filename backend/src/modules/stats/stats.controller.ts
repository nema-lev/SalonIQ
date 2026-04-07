// stats.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

type Period = 'today' | 'week' | 'month' | 'year';

function getPeriodSql(period: Period): string {
  const map: Record<Period, string> = {
    today: "CURRENT_DATE",
    week:  "CURRENT_DATE - INTERVAL '7 days'",
    month: "DATE_TRUNC('month', CURRENT_DATE)",
    year:  "DATE_TRUNC('year', CURRENT_DATE)",
  };
  return map[period] ?? map.month;
}

@ApiTags('stats')
@Controller({ path: 'stats', version: '1' })
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class StatsController {
  constructor(private readonly prisma: TenantPrismaService) {}

  @Get()
  async getStats(
    @CurrentTenant() tenant: any,
    @Query('period') period: Period = 'month',
  ) {
    const since = getPeriodSql(period);
    const schema = tenant.schemaName;

    const [totals, topServices, topStaff, busyHours, clients] = await Promise.all([
      // Totals
      this.prisma.queryInSchema<any[]>(schema, `
        SELECT
          COUNT(*) FILTER (WHERE status != 'cancelled') as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
          COUNT(*) FILTER (WHERE status = 'no_show') as no_show,
          COALESCE(SUM(price) FILTER (WHERE status = 'completed'), 0) as revenue
        FROM appointments
        WHERE start_at >= ${since}
      `, []),

      // Top services
      this.prisma.queryInSchema<any[]>(schema, `
        SELECT sv.name, COUNT(a.id) as count,
               COALESCE(SUM(a.price) FILTER (WHERE a.status = 'completed'), 0) as revenue
        FROM appointments a
        JOIN services sv ON sv.id = a.service_id
        WHERE a.start_at >= ${since} AND a.status != 'cancelled'
        GROUP BY sv.name ORDER BY count DESC LIMIT 5
      `, []),

      // Top staff
      this.prisma.queryInSchema<any[]>(schema, `
        SELECT s.name, COUNT(a.id) as count,
               COALESCE(SUM(a.price) FILTER (WHERE a.status = 'completed'), 0) as revenue
        FROM appointments a
        JOIN staff s ON s.id = a.staff_id
        WHERE a.start_at >= ${since} AND a.status != 'cancelled'
        GROUP BY s.name ORDER BY count DESC
      `, []),

      // Busy hours
      this.prisma.queryInSchema<any[]>(schema, `
        SELECT EXTRACT(HOUR FROM start_at AT TIME ZONE 'Europe/Sofia')::int as hour,
               COUNT(*) as count
        FROM appointments
        WHERE start_at >= ${since} AND status NOT IN ('cancelled', 'no_show')
        GROUP BY hour ORDER BY hour
      `, []),

      // New vs returning clients
      this.prisma.queryInSchema<any[]>(schema, `
        SELECT
          COUNT(*) FILTER (WHERE total_visits = 1) as new_clients,
          COUNT(*) FILTER (WHERE total_visits > 1) as returning_clients
        FROM clients
        WHERE created_at >= ${since}
      `, []),
    ]);

    const t = totals[0];
    const total = Number(t?.total ?? 0);
    const noShow = Number(t?.no_show ?? 0);

    return {
      period,
      totalAppointments: total,
      completedAppointments: Number(t?.completed ?? 0),
      cancelledAppointments: Number(t?.cancelled ?? 0),
      noShowCount: noShow,
      noShowRate: total > 0 ? (noShow / total) * 100 : 0,
      totalRevenue: Number(t?.revenue ?? 0),
      newClients: Number(clients[0]?.new_clients ?? 0),
      returningClients: Number(clients[0]?.returning_clients ?? 0),
      topServices: topServices.map((s) => ({
        name: s.name,
        count: Number(s.count),
        revenue: Number(s.revenue),
      })),
      topStaff: topStaff.map((s) => ({
        name: s.name,
        count: Number(s.count),
        revenue: Number(s.revenue),
      })),
      busyHours: busyHours.map((h) => ({
        hour: Number(h.hour),
        count: Number(h.count),
      })),
    };
  }
}
