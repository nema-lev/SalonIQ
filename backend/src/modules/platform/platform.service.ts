import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { AuthService } from '../auth/auth.service';

type TenantListRow = {
  id: string;
  slug: string;
  schema_name: string;
  business_name: string;
  business_type: string;
  plan: string;
  plan_status: string;
  plan_renews_at: Date | null;
  is_active: boolean;
  created_at: Date;
  owner_name: string | null;
  owner_email: string | null;
  theme_config: unknown;
};

@Injectable()
export class PlatformService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly authService: AuthService,
  ) {}

  async listTenants() {
    const tenants = await this.prisma.$queryRaw<TenantListRow[]>`
      SELECT
        t.id,
        t.slug,
        t.schema_name,
        t.business_name,
        t.business_type,
        t.plan,
        t.plan_status,
        t.plan_renews_at,
        t.is_active,
        t.created_at,
        o.name AS owner_name,
        o.email AS owner_email,
        t.theme_config
      FROM public.tenants t
      LEFT JOIN LATERAL (
        SELECT name, email
        FROM public.tenant_owners
        WHERE tenant_id = t.id
        ORDER BY created_at ASC
        LIMIT 1
      ) o ON TRUE
      ORDER BY t.created_at DESC
    `;

    const enriched = await Promise.all(
      tenants.map(async (tenant) => {
        const summary = await this.getTenantSummarySafe(tenant.schema_name);
        if (!summary) {
          return null;
        }
        const access = this.resolveAccessState(tenant);

        return {
          id: tenant.id,
          slug: tenant.slug,
          businessName: tenant.business_name,
          businessType: tenant.business_type,
          plan: tenant.plan,
          planStatus: tenant.plan_status,
          planRenewsAt: tenant.plan_renews_at,
          isActive: tenant.is_active,
          owner: {
            name: tenant.owner_name,
            email: tenant.owner_email,
          },
          poweredByText: this.parseTheme(tenant.theme_config).poweredByText || 'Powered by SalonIQ',
          summary,
          access,
        };
      }),
    );

    return enriched.filter((tenant): tenant is NonNullable<typeof tenant> => Boolean(tenant));
  }

  async updateTenant(
    tenantId: string,
    dto: {
      businessType?: string;
      plan?: string;
      planStatus?: string;
      planRenewsAt?: string | null;
      isActive?: boolean;
      poweredByText?: string;
    },
  ) {
    const current = await this.getTenantById(tenantId);

    const planRenewsAt =
      dto.planRenewsAt === undefined
        ? current.plan_renews_at
        : dto.planRenewsAt
          ? new Date(dto.planRenewsAt)
          : null;

    if (planRenewsAt && Number.isNaN(planRenewsAt.getTime())) {
      throw new BadRequestException('Невалидна дата за платено до.');
    }

    const currentTheme = this.parseTheme(current.theme_config);
    const nextTheme = {
      ...currentTheme,
      ...(dto.poweredByText !== undefined ? { poweredByText: dto.poweredByText.trim() || 'Powered by SalonIQ' } : {}),
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET business_type = $1::public.business_type,
          plan = $2::public.subscription_plan,
          plan_status = $3::public.plan_status,
          plan_renews_at = $4,
          is_active = $5,
          theme_config = $6::jsonb,
          updated_at = NOW()
      WHERE id = $7::uuid
      `,
      dto.businessType ?? current.business_type,
      dto.plan ?? current.plan,
      dto.planStatus ?? current.plan_status,
      planRenewsAt,
      dto.isActive ?? current.is_active,
      JSON.stringify(nextTheme),
      tenantId,
    );

    return { updated: true };
  }

  async impersonateTenant(tenantId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        tenant_id: string;
        role: string;
        schema_name: string;
        business_name: string;
        slug: string;
        name: string;
      }[]
    >`
      SELECT
        o.id,
        o.tenant_id,
        o.role,
        t.schema_name,
        t.business_name,
        t.slug,
        o.name
      FROM public.tenant_owners o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE o.tenant_id = ${tenantId}::uuid
      ORDER BY o.created_at ASC
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException('Няма owner акаунт за този бизнес.');
    }

    return this.authService.issueImpersonationToken(rows[0]);
  }

  async resetTenantOwnerPassword(tenantId: string, newPassword: string) {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id
      FROM public.tenant_owners
      WHERE tenant_id = ${tenantId}::uuid
      ORDER BY created_at ASC
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException('Няма owner акаунт за този бизнес.');
    }

    const passwordHash = await this.authService.hashPassword(newPassword);

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenant_owners
      SET password_hash = $1,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      passwordHash,
      rows[0].id,
    );

    return { updated: true };
  }

  private async getTenantById(tenantId: string) {
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        plan: string;
        business_type: string;
        plan_status: string;
        plan_renews_at: Date | null;
        is_active: boolean;
        theme_config: unknown;
      }[]
    >`
      SELECT id, plan, business_type, plan_status, plan_renews_at, is_active, theme_config
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `;

    if (!rows.length) {
      throw new NotFoundException('Бизнесът не е намерен.');
    }

    return rows[0];
  }

  private async getTenantSummary(schemaName: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new BadRequestException('Невалидно schema име.');
    }

    const [services, staff, clients, appointments, pending, nextAppointment] = await Promise.all([
      this.countFromSchema(schemaName, 'services'),
      this.countFromSchema(schemaName, 'staff'),
      this.countFromSchema(schemaName, 'clients'),
      this.countFromSchema(schemaName, 'appointments'),
      this.countAppointmentsByStatus(schemaName, `status IN ('pending', 'proposal_pending')`),
      this.prisma.$queryRawUnsafe<{ start_at: Date | null }[]>(
        `SELECT start_at
         FROM ${schemaName}.appointments
         WHERE start_at >= NOW()
           AND status NOT IN ('cancelled', 'no_show')
         ORDER BY start_at ASC
         LIMIT 1`,
      ),
    ]);

    return {
      services,
      staff,
      clients,
      appointments,
      pending,
      nextAppointmentAt: nextAppointment[0]?.start_at ?? null,
    };
  }

  private async getTenantSummarySafe(schemaName: string) {
    const hasRequiredTables = await this.schemaHasRequiredTables(schemaName);
    if (!hasRequiredTables) {
      return null;
    }

    try {
      return await this.getTenantSummary(schemaName);
    } catch {
      return null;
    }
  }

  private async schemaHasRequiredTables(schemaName: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      return false;
    }

    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = ${schemaName}
        AND table_name IN ('services', 'staff', 'clients', 'appointments')
    `;

    return (rows[0]?.count ?? 0) === 4;
  }

  private async countFromSchema(schemaName: string, tableName: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM ${schemaName}.${tableName}`,
    );
    return rows[0]?.count ?? 0;
  }

  private async countAppointmentsByStatus(schemaName: string, conditionSql: string) {
    const rows = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*)::int AS count FROM ${schemaName}.appointments WHERE ${conditionSql}`,
    );
    return rows[0]?.count ?? 0;
  }

  private resolveAccessState(tenant: {
    is_active: boolean;
    plan_status: string;
    plan_renews_at: Date | null;
  }) {
    if (!tenant.is_active) {
      return { blocked: true, reason: 'suspended' as const };
    }

    const renewsAt = tenant.plan_renews_at ? new Date(tenant.plan_renews_at) : null;
    const expired = Boolean(renewsAt && renewsAt.getTime() < Date.now());
    if (tenant.plan_status === 'PAST_DUE' || tenant.plan_status === 'CANCELLED' || expired) {
      return { blocked: true, reason: 'unpaid' as const };
    }

    return { blocked: false, reason: null };
  }

  private parseTheme(themeConfig: unknown) {
    if (typeof themeConfig === 'string') {
      try {
        return JSON.parse(themeConfig || '{}');
      } catch {
        return {};
      }
    }

    if (themeConfig && typeof themeConfig === 'object') {
      return themeConfig as Record<string, unknown>;
    }

    return {};
  }
}
