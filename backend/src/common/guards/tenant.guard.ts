import {
  Injectable,
  CanActivate,
  ExecutionContext,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Request } from 'express';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { getNotificationTemplates } from '../../modules/notifications/template.utils';

/**
 * TenantGuard — резолвира tenant от:
 * 1. Поддомейн: demo-business.saloniq.bg → slug = 'demo-business'
 * 2. Custom domain: booking.example.com
 * 3. Header X-Tenant-Slug (за локална разработка)
 * 4. Query param ?tenant=slug (за тестове)
 *
 * Добавя tenant обекта към request-а за ползване в controllers/services.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly tenantCache = new Map<string, { data: any; expiresAt: number }>();
  private readonly CACHE_TTL = 0;

  constructor(private readonly prisma: TenantPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { tenant: any }>();

    const slug = this.extractSlug(request);
    if (!slug) {
      throw new BadRequestException('Не може да се определи бизнесът от заявката.');
    }

    const tenant = await this.resolveTenant(slug);
    if (!tenant) {
      throw new NotFoundException(`Бизнесът '${slug}' не е намерен.`);
    }

    const hasAuthenticatedAdminRequest = Boolean(request.headers.authorization);
    if (hasAuthenticatedAdminRequest) {
      this.assertAdminAccessAllowed(tenant);
    }

    // Прикачи tenant към request-а
    request.tenant = tenant;
    return true;
  }

  private extractSlug(request: Request): string | null {
    // 1. X-Tenant-Slug header (dev/testing)
    const headerSlug = request.headers['x-tenant-slug'] as string;
    if (headerSlug) return headerSlug.toLowerCase();

    // 2. Query param ?tenant=slug
    const querySlug = request.query['tenant'] as string;
    if (querySlug) return querySlug.toLowerCase();

    // 3. Поддомейн или custom domain
    const host = (request.headers['x-forwarded-host'] || request.headers.host || '') as string;
    const hostname = host.split(':')[0]; // Махни порта

    if (!hostname) return null;

    const appDomain = process.env.APP_DOMAIN || 'saloniq.bg';

    // Поддомейн: demo-business.saloniq.bg
    if (hostname.endsWith(`.${appDomain}`)) {
      return hostname.replace(`.${appDomain}`, '');
    }

    // Custom domain: резолвирай от базата
    return hostname; // ще го потърсим по custom_domain
  }

  private async resolveTenant(slugOrDomain: string): Promise<any> {
    const cacheKey = slugOrDomain;
    const cached = this.tenantCache.get(cacheKey);

    if (cached && this.CACHE_TTL > 0 && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    const appDomain = process.env.APP_DOMAIN || 'saloniq.bg';
    const isSlug = !slugOrDomain.includes('.');

    let query: string;
    let params: string[];

    if (isSlug || slugOrDomain.endsWith(`.${appDomain}`)) {
      const slug = slugOrDomain.replace(`.${appDomain}`, '');
      query = `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`;
      params = [slug];
    } else {
      // Custom domain
      query = `SELECT * FROM public.tenants WHERE custom_domain = $1 AND is_active = true LIMIT 1`;
      params = [slugOrDomain];
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
