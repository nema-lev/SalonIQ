import { Controller, Get, Headers, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

@ApiTags('tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantController {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Връща конфигурацията на tenant-а.
   * Извиква се от Next.js SSR (layout.tsx) при всяка заявка.
   * Защитен с вътрешен API ключ — не е публичен!
   */
  @Get('config')
  @ApiOperation({ summary: 'Tenant конфигурация за SSR (вътрешен endpoint)' })
  async getConfig(
    @Headers('x-forwarded-host') forwardedHost: string,
    @Headers('x-internal-key') internalKey: string,
  ) {
    // Провери вътрешния ключ
    const expectedKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
    if (internalKey !== expectedKey) {
      throw new UnauthorizedException('Невалиден вътрешен ключ.');
    }

    const appDomain = this.config.get<string>('APP_DOMAIN', 'saloniq.bg');
    const hostname = forwardedHost?.split(':')[0] || '';

    let query: string;
    let param: string;

    if (hostname.endsWith(`.${appDomain}`)) {
      // Поддомейн
      param = hostname.replace(`.${appDomain}`, '');
      query = `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`;
    } else {
      // Custom domain
      param = hostname;
      query = `SELECT * FROM public.tenants WHERE custom_domain = $1 AND is_active = true LIMIT 1`;
    }

    const rows = await this.prisma.$queryRawUnsafe<any[]>(query, param);
    if (!rows.length) throw new NotFoundException('Бизнесът не е намерен.');

    const t = rows[0];
    const theme = t.theme_config || {};

    // Върни само публичните данни (без bot token, secrets и т.н.)
    return {
      id: t.id,
      slug: t.slug,
      businessName: t.business_name,
      businessType: t.business_type,
      description: t.description,
      address: t.address,
      city: t.city,
      phone: t.phone,
      email: t.email,
      website: t.website,
      googleMapsUrl: t.google_maps_url,
      workingHours: t.working_hours,
      requiresConfirmation: t.requires_confirmation,
      cancellationHours: t.cancellation_hours,
      minAdvanceBookingHours: t.min_advance_booking_hours,
      maxAdvanceBookingDays: t.max_advance_booking_days,
      theme: {
        primaryColor: theme.primaryColor || '#7c3aed',
        secondaryColor: theme.secondaryColor || '#a855f7',
        accentColor: theme.accentColor || '#f59e0b',
        fontFamily: theme.fontFamily || 'Inter',
        logoUrl: theme.logoUrl || null,
        faviconUrl: theme.faviconUrl || null,
        coverImageUrl: theme.coverImageUrl || null,
        borderRadius: theme.borderRadius || 'rounded',
      },
    };
  }
}
