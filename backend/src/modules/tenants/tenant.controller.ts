import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Patch,
  Post,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import {
  IsBoolean,
  IsEmail,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { getNotificationTemplates } from '../notifications/template.utils';
import { TelegramService } from '../notifications/telegram.service';

class UpdateGeneralSettingsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  businessName: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  phone?: string;

  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' ? undefined : trimmed;
  })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  googleMapsUrl?: string;
}

class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  telegramChatId?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  smsApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  smsSenderId?: string;

  @IsOptional()
  @IsArray()
  @IsIn([2, 24], { each: true })
  reminderHours?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bookingPendingTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bookingConfirmedTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reminder24hTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reminder2hTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cancellationTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ownerNewBookingTemplate?: string;
}

class UpdateBookingSettingsDto {
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  requiresConfirmation: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationHours: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(72)
  minAdvanceBookingHours: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxAdvanceBookingDays: number;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowRandomStaffSelection: boolean;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowClientCancellation: boolean;

  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  collectClientEmail: boolean;
}

class UpdateThemeSettingsDto {
  @Matches(/^#[0-9a-f]{6}$/i)
  primaryColor: string;

  @Matches(/^#[0-9a-f]{6}$/i)
  secondaryColor: string;

  @IsOptional()
  @Matches(/^#[0-9a-f]{6}$/i)
  accentColor?: string;

  @IsIn(['sharp', 'rounded', 'pill'])
  borderRadius: 'sharp' | 'rounded' | 'pill';

  @IsOptional()
  @IsIn(['light', 'graphite', 'dark'])
  surfaceStyle?: 'light' | 'graphite' | 'dark';

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsString()
  faviconUrl?: string;
}

class TelegramWebhookActionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  publicBaseUrl?: string;

  @IsOptional()
  @IsString()
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;
}

@ApiTags('tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantController {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  @Patch('settings/general')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови основната информация за бизнеса' })
  async updateGeneral(
    @CurrentTenant() tenant: any,
    @Body() dto: UpdateGeneralSettingsDto,
  ) {
    const current = await this.getTenantRowById(tenant.id);

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET business_name = $1,
          business_type = $2,
          description = $3,
          address = $4,
          city = $5,
          phone = $6,
          email = $7,
          website = $8,
          google_maps_url = $9,
          updated_at = NOW()
      WHERE id = $10::uuid
      `,
      dto.businessName.trim(),
      current.business_type,
      this.nullable(dto.description),
      this.nullable(dto.address),
      this.nullable(dto.city),
      this.nullable(dto.phone),
      this.nullable(dto.email),
      this.nullable(dto.website),
      this.nullable(dto.googleMapsUrl),
      tenant.id,
    );

    return { updated: true };
  }

  @Patch('settings/notifications')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови настройките за Telegram и SMS' })
  async updateNotifications(
    @CurrentTenant() tenant: any,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    const current = await this.getTenantRowById(tenant.id);
    const currentTheme = this.parseTheme(current.theme_config);
    const nextTheme = {
      ...currentTheme,
      notificationTemplates: {
        ...getNotificationTemplates(currentTheme),
        ...(dto.bookingPendingTemplate !== undefined ? { bookingPending: dto.bookingPendingTemplate.trim() } : {}),
        ...(dto.bookingConfirmedTemplate !== undefined ? { bookingConfirmed: dto.bookingConfirmedTemplate.trim() } : {}),
        ...(dto.reminder24hTemplate !== undefined ? { reminder24h: dto.reminder24hTemplate.trim() } : {}),
        ...(dto.reminder2hTemplate !== undefined ? { reminder2h: dto.reminder2hTemplate.trim() } : {}),
        ...(dto.cancellationTemplate !== undefined ? { cancellation: dto.cancellationTemplate.trim() } : {}),
        ...(dto.ownerNewBookingTemplate !== undefined ? { ownerNewBooking: dto.ownerNewBookingTemplate.trim() } : {}),
      },
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET telegram_bot_token = $1,
          telegram_chat_id = $2,
          sms_api_key = $3,
          sms_sender_id = $4,
          reminder_hours = $5,
          theme_config = $6::jsonb,
          updated_at = NOW()
      WHERE id = $7::uuid
      `,
      dto.telegramBotToken === undefined || dto.telegramBotToken === ''
        ? current.telegram_bot_token
        : dto.telegramBotToken.trim(),
      dto.telegramChatId === undefined || dto.telegramChatId === ''
        ? current.telegram_chat_id
        : dto.telegramChatId.trim(),
      dto.smsApiKey === undefined || dto.smsApiKey === ''
        ? current.sms_api_key
        : dto.smsApiKey.trim(),
      dto.smsSenderId === undefined || dto.smsSenderId === ''
        ? current.sms_sender_id
        : dto.smsSenderId.trim(),
      dto.reminderHours ?? current.reminder_hours,
      JSON.stringify(nextTheme),
      tenant.id,
    );

    return { updated: true, notificationTemplates: nextTheme.notificationTemplates };
  }

  @Get('settings/notifications')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Върни защитените настройки за Telegram и SMS' })
  async getNotificationsSettings(@CurrentTenant() tenant: any) {
    const current = await this.getTenantRowById(tenant.id);
    const currentTheme = this.parseTheme(current.theme_config);

    return {
      telegramBotToken: current.telegram_bot_token || '',
      telegramChatId: current.telegram_chat_id || '',
      smsApiKey: current.sms_api_key || '',
      smsSenderId: current.sms_sender_id || '',
      reminderHours: current.reminder_hours || [24, 2],
      notificationTemplates: getNotificationTemplates(currentTheme),
    };
  }

  @Post('settings/notifications/telegram/status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Провери текущия Telegram setup статус' })
  async getTelegramStatus(
    @CurrentTenant() tenant: any,
    @Body() dto: TelegramWebhookActionDto,
  ) {
    const current = await this.persistTelegramCredentialsFromAction(tenant.id, dto);
    const currentTheme = this.parseTheme(current.theme_config);
    const botToken = current.telegram_bot_token;
    const chatId = current.telegram_chat_id || null;
    const publicBaseUrl = dto.publicBaseUrl?.trim().replace(/\/$/, '') || null;
    const expectedWebhookUrl = publicBaseUrl
      ? `${publicBaseUrl}/api/v1/webhooks/telegram/${tenant.slug}`
      : null;
    const rawOwnerSetupExpiresAt =
      typeof currentTheme.telegramOwnerSetupExpiresAt === 'string'
        ? currentTheme.telegramOwnerSetupExpiresAt
        : null;
    const ownerSetupExpiresAt = rawOwnerSetupExpiresAt
      ? new Date(rawOwnerSetupExpiresAt)
      : null;
    const ownerSetupPending = Boolean(
      typeof currentTheme.telegramOwnerSetupToken === 'string' &&
      currentTheme.telegramOwnerSetupToken &&
      ownerSetupExpiresAt &&
      Number.isFinite(ownerSetupExpiresAt.getTime()) &&
      ownerSetupExpiresAt.getTime() > Date.now(),
    );

    if (!botToken) {
      return {
        hasBotToken: false,
        botProfile: null,
        linkedChatId: chatId,
        ownerChatLinked: Boolean(chatId),
        ownerSetupPending,
        ownerSetupExpiresAt: ownerSetupExpiresAt?.toISOString() || null,
        expectedWebhookUrl,
        webhook: {
          connected: false,
          webhookUrl: '',
          pendingUpdateCount: 0,
          lastErrorMessage: undefined,
        },
      };
    }

    const botProfile = await this.telegramService.getBotProfile(botToken);

    if (!botProfile.ok) {
      return {
        hasBotToken: true,
        botProfile,
        linkedChatId: chatId,
        ownerChatLinked: Boolean(chatId),
        ownerSetupPending,
        ownerSetupExpiresAt: ownerSetupExpiresAt?.toISOString() || null,
        expectedWebhookUrl,
        webhook: {
          connected: false,
          webhookUrl: '',
          pendingUpdateCount: 0,
          lastErrorMessage: undefined,
        },
      };
    }

    const info = await this.telegramService.getWebhookInfo(botToken);

    return {
      hasBotToken: true,
      botProfile,
      linkedChatId: chatId,
      ownerChatLinked: Boolean(chatId),
      ownerSetupPending,
      ownerSetupExpiresAt: ownerSetupExpiresAt?.toISOString() || null,
      expectedWebhookUrl,
      webhook: {
        connected: Boolean(
          info.ok &&
          info.url &&
          (!expectedWebhookUrl || info.url === expectedWebhookUrl),
        ),
        webhookUrl: info.url || '',
        pendingUpdateCount: info.pendingUpdateCount,
        lastErrorMessage: info.lastErrorMessage,
      },
    };
  }

  @Patch('settings/booking')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови booking правилата' })
  async updateBooking(
    @CurrentTenant() tenant: any,
    @Body() dto: UpdateBookingSettingsDto,
  ) {
    const current = await this.getTenantRowById(tenant.id);
    const currentTheme = this.parseTheme(current.theme_config);
    const nextTheme = {
      ...currentTheme,
      allowRandomStaffSelection: dto.allowRandomStaffSelection,
      allowClientCancellation: dto.allowClientCancellation,
      collectClientEmail: dto.collectClientEmail,
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET requires_confirmation = $1,
          cancellation_hours = $2,
          min_advance_booking_hours = $3,
          max_advance_booking_days = $4,
          theme_config = $5::jsonb,
          updated_at = NOW()
      WHERE id = $6::uuid
      `,
      dto.requiresConfirmation,
      dto.cancellationHours,
      dto.minAdvanceBookingHours,
      dto.maxAdvanceBookingDays,
      JSON.stringify(nextTheme),
      tenant.id,
    );

    return { updated: true };
  }

  @Patch('settings/theme')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови визуалната тема на бизнеса' })
  async updateTheme(
    @CurrentTenant() tenant: any,
    @Body() dto: UpdateThemeSettingsDto,
  ) {
    const current = await this.getTenantRowById(tenant.id);
    const currentTheme = this.parseTheme(current.theme_config);

    const nextTheme = {
      ...currentTheme,
      primaryColor: dto.primaryColor,
      secondaryColor: dto.secondaryColor,
      accentColor: dto.accentColor || currentTheme.accentColor || dto.primaryColor,
      borderRadius: dto.borderRadius,
      surfaceStyle: dto.surfaceStyle || currentTheme.surfaceStyle || 'light',
      logoUrl: this.nullable(dto.logoUrl),
      coverImageUrl: this.nullable(dto.coverImageUrl),
      faviconUrl: this.nullable(dto.faviconUrl),
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET theme_config = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      JSON.stringify(nextTheme),
      tenant.id,
    );

    return { updated: true, theme: nextTheme };
  }

  @Post('settings/notifications/webhook/connect')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Задай Telegram webhook за текущия tenant' })
  async connectTelegramWebhook(
    @CurrentTenant() tenant: any,
    @Body() dto: TelegramWebhookActionDto,
  ) {
    const current = await this.persistTelegramCredentialsFromAction(tenant.id, dto);
    const botToken = current.telegram_bot_token;

    if (!botToken) {
      throw new BadRequestException('Липсва Bot Token.');
    }

    if (!dto.publicBaseUrl) {
      throw new BadRequestException('Липсва публичен адрес на приложението.');
    }

    const publicBaseUrl = dto.publicBaseUrl.trim().replace(/\/$/, '');
    const webhookUrl = `${publicBaseUrl}/api/v1/webhooks/telegram/${tenant.slug}`;
    const result = await this.telegramService.setWebhook(botToken, webhookUrl);

    if (!result.ok) {
      throw new BadRequestException(
        result.description || 'Telegram не прие webhook URL-а.',
      );
    }

    const info = await this.telegramService.getWebhookInfo(botToken);
    return {
      connected: info.ok && info.url === webhookUrl,
      webhookUrl,
      info,
    };
  }

  @Post('settings/notifications/webhook/disconnect')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Премахни Telegram webhook за текущия tenant' })
  async disconnectTelegramWebhook(@CurrentTenant() tenant: any) {
    const current = await this.getTenantRowById(tenant.id);
    const botToken = current.telegram_bot_token;

    if (!botToken) {
      throw new BadRequestException('Липсва Bot Token.');
    }

    const result = await this.telegramService.setWebhook(botToken, '');
    if (!result.ok) {
      throw new BadRequestException(
        result.description || 'Telegram не позволи премахване на webhook-а.',
      );
    }

    const info = await this.telegramService.getWebhookInfo(botToken);
    return {
      connected: Boolean(info.url),
      webhookUrl: info.url || '',
      info,
    };
  }

  @Post('settings/notifications/webhook/info')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Провери текущия Telegram webhook' })
  async getTelegramWebhookInfo(
    @CurrentTenant() tenant: any,
    @Body() dto: TelegramWebhookActionDto,
  ) {
    const current = await this.persistTelegramCredentialsFromAction(tenant.id, dto);
    const botToken = current.telegram_bot_token;

    if (!botToken) {
      throw new BadRequestException('Липсва Bot Token.');
    }

    const info = await this.telegramService.getWebhookInfo(botToken);
    return {
      connected: Boolean(info.url),
      webhookUrl: info.url || '',
      info,
    };
  }

  @Post('settings/notifications/telegram/owner-link')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Генерирай защитен deep link за owner setup на Telegram бота' })
  async createTelegramOwnerLink(
    @CurrentTenant() tenant: any,
    @Body() dto: TelegramWebhookActionDto,
  ) {
    const current = await this.persistTelegramCredentialsFromAction(tenant.id, dto);
    const botToken = current.telegram_bot_token;

    if (!botToken) {
      throw new BadRequestException('Липсва Bot Token.');
    }

    const botProfile = await this.telegramService.getBotProfile(botToken);
    if (!botProfile.ok || !botProfile.username) {
      throw new BadRequestException(
        botProfile.description || 'Telegram Bot Token-ът е невалиден.',
      );
    }

    const currentTheme = this.parseTheme(current.theme_config);
    const setupToken = randomBytes(16).toString('hex');
    const nextTheme = {
      ...currentTheme,
      telegramOwnerSetupToken: setupToken,
      telegramOwnerSetupExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET theme_config = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      JSON.stringify(nextTheme),
      tenant.id,
    );

    return {
      botUsername: botProfile.username,
      botLink: `https://t.me/${botProfile.username}?start=owner_setup_${setupToken}`,
      expiresAt: nextTheme.telegramOwnerSetupExpiresAt,
      linkedChatId: current.telegram_chat_id || null,
    };
  }

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
    @Headers('x-tenant-slug') tenantSlug: string,
  ) {
    const expectedKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
    if (internalKey !== expectedKey) {
      throw new UnauthorizedException('Невалиден вътрешен ключ.');
    }

    const appDomain = this.config.get<string>('APP_DOMAIN', 'saloniq.bg');
    const hostname = forwardedHost?.split(':')[0] || '';

    try {
      if (tenantSlug) {
        const rows = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
          tenantSlug,
        );

        if (!rows.length) throw new NotFoundException('Бизнесът не е намерен.');

        return this.serializeTenant(rows[0]);
      }

      let query: string;
      let param: string;

      if (hostname.endsWith(`.${appDomain}`)) {
        param = hostname.replace(`.${appDomain}`, '');
        query = `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`;
      } else {
        param = hostname;
        query = `SELECT * FROM public.tenants WHERE custom_domain = $1 AND is_active = true LIMIT 1`;
      }

      let rows = await this.prisma.$queryRawUnsafe<any[]>(query, param);

      if (!rows.length && tenantSlug) {
        rows = await this.prisma.$queryRawUnsafe<any[]>(
          `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
          tenantSlug,
        );
      }

      if (!rows.length) throw new NotFoundException('Бизнесът не е намерен.');

      return this.serializeTenant(rows[0]);
    } catch (error) {
      throw error;
    }
  }

  private async getTenantRowById(tenantId: string) {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM public.tenants WHERE id = $1::uuid LIMIT 1`,
      tenantId,
    );

    if (!rows.length) {
      throw new NotFoundException('Бизнесът не е намерен.');
    }

    return rows[0];
  }

  private parseTheme(themeConfig: unknown) {
    if (typeof themeConfig === 'string') {
      return JSON.parse(themeConfig || '{}');
    }
    return themeConfig || {};
  }

  private serializeTenant(tenant: any) {
    const theme = this.parseTheme(tenant.theme_config);
    const notificationTemplates = getNotificationTemplates(theme);

    return {
      id: tenant.id,
      slug: tenant.slug,
      businessName: tenant.business_name,
      businessType: tenant.business_type,
      description: tenant.description,
      address: tenant.address,
      city: tenant.city,
      phone: tenant.phone,
      email: tenant.email,
      website: tenant.website,
      googleMapsUrl: tenant.google_maps_url,
      workingHours: tenant.working_hours,
      requiresConfirmation: tenant.requires_confirmation,
      cancellationHours: tenant.cancellation_hours,
      reminderHours: tenant.reminder_hours || [24, 2],
      minAdvanceBookingHours: tenant.min_advance_booking_hours,
      maxAdvanceBookingDays: tenant.max_advance_booking_days,
      allowRandomStaffSelection: theme.allowRandomStaffSelection ?? true,
      allowClientCancellation: theme.allowClientCancellation ?? true,
      collectClientEmail: theme.collectClientEmail ?? true,
      notificationTemplates,
      theme: {
        primaryColor: theme.primaryColor || '#7c3aed',
        secondaryColor: theme.secondaryColor || '#a855f7',
        accentColor: theme.accentColor || '#f59e0b',
        fontFamily: theme.fontFamily || 'Inter',
        logoUrl: theme.logoUrl || null,
        faviconUrl: theme.faviconUrl || null,
        coverImageUrl: theme.coverImageUrl || null,
        borderRadius: theme.borderRadius || 'rounded',
        surfaceStyle: theme.surfaceStyle || 'light',
      },
    };
  }

  private nullable(value: string | undefined | null) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  private async persistTelegramCredentialsFromAction(
    tenantId: string,
    dto: Pick<TelegramWebhookActionDto, 'telegramBotToken' | 'telegramChatId'>,
  ) {
    const current = await this.getTenantRowById(tenantId);
    const nextBotToken = this.nullable(dto.telegramBotToken) ?? current.telegram_bot_token;
    const nextChatId = this.nullable(dto.telegramChatId) ?? current.telegram_chat_id;

    if (nextBotToken !== current.telegram_bot_token || nextChatId !== current.telegram_chat_id) {
      await this.prisma.$executeRawUnsafe(
        `
        UPDATE public.tenants
        SET telegram_bot_token = $1,
            telegram_chat_id = $2,
            updated_at = NOW()
        WHERE id = $3::uuid
        `,
        nextBotToken,
        nextChatId,
        tenantId,
      );
    }

    return {
      ...current,
      telegram_bot_token: nextBotToken,
      telegram_chat_id: nextChatId,
    };
  }
}
