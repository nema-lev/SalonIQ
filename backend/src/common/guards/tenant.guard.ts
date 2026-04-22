import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { getNotificationTemplates } from '../../modules/notifications/template.utils';
import { resolveTenantCandidate } from '../utils/tenant-resolution';

/**
 * TenantGuard — резолвира tenant от:
 * 1. Custom domain / поддомейн от host-а
 * 2. Header X-Tenant-Slug (за preview/dev fallback)
 * 3. DEFAULT_TENANT_SLUG от средата
 * 4. Query param ?tenant=slug (последен test hook)
 *
 * Добавя tenant обекта към request-а за ползване в controllers/services.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly tenantCache = new Map<string, { data: any; expiresAt: number }>();
  private readonly CACHE_TTL = 0;

  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { tenant: any }>();

    const candidate = this.extractTenantCandidate(request);
    if (!candidate) {
      throw new BadRequestException(
        'Не може да се определи бизнесът от заявката. Задай валиден host, X-Tenant-Slug или DEFAULT_TENANT_SLUG.',
      );
    }

    const tenant = await this.resolveTenant(candidate);
    if (!tenant) {
      throw new NotFoundException(`Бизнесът '${candidate.value}' не е намерен.`);
    }

    const hasAuthenticatedAdminRequest = Boolean(request.headers.authorization);
    if (hasAuthenticatedAdminRequest) {
      this.assertAdminAccessAllowed(tenant);
    }

    // Прикачи tenant към request-а
    request.tenant = tenant;
    return true;
  }

  private extractTenantCandidate(request: Request) {
    return resolveTenantCandidate({
      host: (request.headers['x-forwarded-host'] || request.headers.host || '') as string,
      appDomain: this.config.get<string>('APP_DOMAIN', 'saloniq.bg'),
      headerSlug: request.headers['x-tenant-slug'] as string,
      defaultTenantSlug: this.config.get<string>('DEFAULT_TENANT_SLUG', ''),
      queryTenantSlug: request.query['tenant'] as string,
      originHost: request.headers.origin as string,
      referer: request.headers.referer as string,
      authenticatedTenantId: (request as Request & { user?: { tenantId?: string } }).user?.tenantId,
      platformHosts: this.config.get<string>('BACKEND_HOST', ''),
    });
  }

  private async resolveTenant(candidate: { type: 'tenant-id' | 'slug' | 'custom-domain'; value: string }): Promise<any> {
    const cacheKey = `${candidate.type}:${candidate.value}`;
    const cached = this.tenantCache.get(cacheKey);

    if (cached && this.CACHE_TTL > 0 && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    let query: string;
    let params: string[];

    if (candidate.type === 'tenant-id') {
      query = `SELECT * FROM public.tenants WHERE id = $1::uuid AND is_active = true LIMIT 1`;
      params = [candidate.value];
    } else if (candidate.type === 'slug') {
      query = `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`;
      params = [candidate.value];
    } else {
      query = `SELECT * FROM public.tenants WHERE custom_domain = $1 AND is_active = true LIMIT 1`;
      params = [candidate.value];
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, ...params);

    if (!rows.length) return null;

    const tenant = rows[0];
    const themeConfig =
      typeof tenant.theme_config === 'string'
        ? JSON.parse(tenant.theme_config || '{}')
        : (tenant.theme_config || {});

    // Преобразувай snake_case → camelCase за полетата
    const normalized = {
      id: tenant.id,
      slug: tenant.slug,
      schemaName: tenant.schema_name,
      businessName: tenant.business_name,
      businessType: tenant.business_type,
      plan: tenant.plan,
      address: tenant.address,
      phone: tenant.phone,
      telegramBotToken: tenant.telegram_bot_token,
      telegramChatId: tenant.telegram_chat_id,
      themeConfig,
      requiresConfirmation: tenant.requires_confirmation,
      cancellationHours: tenant.cancellation_hours,
      reminderHours: tenant.reminder_hours,
      minAdvanceBookingHours: tenant.min_advance_booking_hours,
      maxAdvanceBookingDays: tenant.max_advance_booking_days,
      planStatus: tenant.plan_status,
      planRenewsAt: tenant.plan_renews_at,
      isActive: tenant.is_active,
      workingHours: tenant.working_hours,
      allowRandomStaffSelection: themeConfig.allowRandomStaffSelection ?? true,
      allowClientCancellation: themeConfig.allowClientCancellation ?? true,
      collectClientEmail: themeConfig.collectClientEmail ?? true,
      enableTelegramNotifications: themeConfig.enableTelegramNotifications ?? true,
      enableSmsNotifications: themeConfig.enableSmsNotifications ?? Boolean(tenant.sms_api_key && tenant.sms_sender_id),
      notificationTemplates: getNotificationTemplates(themeConfig),
    };

    if (this.CACHE_TTL > 0) {
      this.tenantCache.set(cacheKey, {
        data: normalized,
        expiresAt: Date.now() + this.CACHE_TTL,
      });
    }

    return normalized;
  }

  private assertAdminAccessAllowed(tenant: { isActive: boolean; planStatus: string; planRenewsAt: Date | string | null }) {
    if (!tenant.isActive) {
      throw new ForbiddenException('Достъпът е спрян от платформата.');
    }

    const renewsAt = tenant.planRenewsAt ? new Date(tenant.planRenewsAt) : null;
    const isExpired = Boolean(renewsAt && renewsAt.getTime() < Date.now());

    if (tenant.planStatus === 'PAST_DUE' || tenant.planStatus === 'CANCELLED' || isExpired) {
      throw new HttpException('Услугата не е платена.', 402);
    }
  }
}
