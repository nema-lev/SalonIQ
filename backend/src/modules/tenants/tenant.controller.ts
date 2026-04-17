import {
  Body,
  Controller,
  Get,
  Headers,
  Query,
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
import { resolveTenantCandidate } from '../../common/utils/tenant-resolution';
import { TelegramService } from '../notifications/telegram.service';
import { buildBulgarianPhoneVariants, normalizeBulgarianPhone } from '../../common/utils/phone';

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

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  showBusinessNameInPortal?: boolean;
}

class UpdateNotificationSettingsDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enableTelegramNotifications?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  enableSmsNotifications?: boolean;

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

  @IsOptional()
  @IsString()
  @MaxLength(255)
  coverText?: string;

  @IsOptional()
  @IsIn(['rounded', 'circle'])
  logoShape?: 'rounded' | 'circle';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  poweredByText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serviceCategories?: string[];
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

class ClientTelegramLinkDto {
  @IsString()
  @MinLength(1)
  tenantSlug: string;

  @IsString()
  @MinLength(3)
  clientPhone: string;
}

class UpdateServiceCategoriesDto {
  @IsArray()
  @IsString({ each: true })
  serviceCategories: string[];
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
    const currentTheme = this.parseTheme(current.theme_config);
    const nextTheme = {
      ...currentTheme,
      ...(dto.showBusinessNameInPortal !== undefined
        ? { showBusinessNameInPortal: dto.showBusinessNameInPortal }
        : {}),
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET business_name = $1,
          description = $2,
          address = $3,
          city = $4,
          phone = $5,
          email = $6,
          website = $7,
          google_maps_url = $8,
          theme_config = $9::jsonb,
          updated_at = NOW()
      WHERE id = $10::uuid
      `,
      dto.businessName.trim(),
      this.nullable(dto.description),
      this.nullable(dto.address),
      this.nullable(dto.city),
      this.nullable(dto.phone),
      this.nullable(dto.email),
      this.nullable(dto.website),
      this.nullable(dto.googleMapsUrl),
      JSON.stringify(nextTheme),
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
      ...(dto.enableTelegramNotifications !== undefined ? { enableTelegramNotifications: dto.enableTelegramNotifications } : {}),
      ...(dto.enableSmsNotifications !== undefined ? { enableSmsNotifications: dto.enableSmsNotifications } : {}),
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
      enableTelegramNotifications: currentTheme.enableTelegramNotifications ?? true,
      enableSmsNotifications: currentTheme.enableSmsNotifications ?? Boolean(current.sms_api_key && current.sms_sender_id),
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
        enableTelegramNotifications: currentTheme.enableTelegramNotifications ?? true,
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
        enableTelegramNotifications: currentTheme.enableTelegramNotifications ?? true,
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
      enableTelegramNotifications: currentTheme.enableTelegramNotifications ?? true,
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
      logoUrl: this.resolveThemeAsset(dto.logoUrl, currentTheme.logoUrl),
      coverImageUrl: this.resolveThemeAsset(dto.coverImageUrl, currentTheme.coverImageUrl),
      faviconUrl: this.resolveThemeAsset(dto.faviconUrl, currentTheme.faviconUrl),
      coverText: this.nullable(dto.coverText),
      logoShape: dto.logoShape || currentTheme.logoShape || 'rounded',
      poweredByText: currentTheme.poweredByText || 'Powered by SalonIQ',
      serviceCategories: this.normalizeServiceCategories(dto.serviceCategories ?? currentTheme.serviceCategories),
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

    await this.applyThemeColorsToServices(tenant.schemaName, nextTheme);

    return { updated: true, theme: nextTheme };
  }

  @Patch('settings/service-categories')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови списъка с категории за услугите' })
  async updateServiceCategories(
    @CurrentTenant() tenant: any,
    @Body() dto: UpdateServiceCategoriesDto,
  ) {
    const current = await this.getTenantRowById(tenant.id);
    const currentTheme = this.parseTheme(current.theme_config);
    const nextTheme = {
      ...currentTheme,
      serviceCategories: this.normalizeServiceCategories(dto.serviceCategories),
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
      updated: true,
      serviceCategories: nextTheme.serviceCategories,
    };
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
      telegramBotUsername: botProfile.username,
      telegramBotFirstName: botProfile.firstName || null,
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

  @Post('telegram/client-link')
  @ApiOperation({ summary: 'Генерирай client Telegram deep link за public booking flow' })
  async createClientTelegramLink(@Body() dto: ClientTelegramLinkDto) {
    const tenantSlug = dto.tenantSlug.trim();
    const clientPhone = normalizeBulgarianPhone(dto.clientPhone);

    if (!tenantSlug) {
      throw new BadRequestException('Липсва tenant slug.');
    }

    if (!clientPhone) {
      throw new BadRequestException('Липсва валиден телефон.');
    }

    const tenants = await this.prisma.$queryRawUnsafe<any[]>(
      `SELECT id, slug, schema_name, telegram_bot_token, theme_config FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`,
      tenantSlug,
    );

    if (!tenants.length) {
      throw new NotFoundException('Бизнесът не е намерен.');
    }

    const tenant = tenants[0];
    const theme = this.parseTheme(tenant.theme_config);
    if (!tenant.telegram_bot_token) {
      throw new BadRequestException('За този бизнес няма свързан Telegram бот.');
    }

    if ((theme.enableTelegramNotifications ?? true) !== true) {
      throw new BadRequestException('Telegram известията са изключени за този бизнес.');
    }

    const botProfile = await this.telegramService.getBotProfile(tenant.telegram_bot_token);
    if (!botProfile.ok || !botProfile.username) {
      throw new BadRequestException(
        botProfile.description || 'Telegram Bot Token-ът е невалиден.',
      );
    }

    const phoneVariants = buildBulgarianPhoneVariants(clientPhone);
    const linkedRows = await this.prisma.queryInSchema<{ telegram_chat_id: string | null }[]>(
      tenant.schema_name,
      `SELECT telegram_chat_id
       FROM clients
       WHERE phone = ANY($1::text[])
       LIMIT 1`,
      [phoneVariants],
    );

    return {
      botUsername: botProfile.username,
      botLink: `https://t.me/${botProfile.username}?start=phone_${clientPhone.replace(/^\+/, '')}`,
      normalizedPhone: clientPhone,
      linkedChatId: linkedRows[0]?.telegram_chat_id || null,
    };
  }

  @Get('client-quick-search')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Бързи подсказки за клиент по име или телефон в публичния booking flow' })
  async clientQuickSearch(
    @CurrentTenant() tenant: any,
    @Query('q') rawQuery?: string,
  ) {
    const query = (rawQuery || '').trim();
    const digitQuery = query.replace(/\D/g, '');

    if (query.length < 2 && digitQuery.length < 6) {
      return [];
    }

    const phoneVariants = buildBulgarianPhoneVariants(query);
    const phonePatterns = [query, digitQuery, ...phoneVariants]
      .filter(Boolean)
      .map((value) => `%${value}%`);

    const rows = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        id,
        name,
        phone,
        email,
        total_visits,
        last_visit_at,
        COALESCE(NULLIF(profile_data->>'originalClientName', ''), NULL) as original_client_name
      FROM clients
      WHERE name ILIKE $1
         OR phone ILIKE ANY($2::text[])
      ORDER BY total_visits DESC, last_visit_at DESC NULLS LAST, updated_at DESC
      LIMIT 6
      `,
      [`%${query}%`, phonePatterns],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      totalVisits: Number(row.total_visits || 0),
      originalClientName: row.original_client_name,
    }));
  }

  @Get('client-upcoming')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Провери предстоящите часове на клиент по телефон' })
  async clientUpcoming(
    @CurrentTenant() tenant: any,
    @Query('phone') rawPhone?: string,
    @Query('deviceToken') deviceToken?: string,
  ) {
    const normalizedPhone = normalizeBulgarianPhone(rawPhone || '');
    if (!normalizedPhone) {
      throw new BadRequestException('Липсва валиден телефон.');
    }
    const normalizedDeviceToken = (deviceToken || '').trim();
    if (!normalizedDeviceToken) {
      throw new BadRequestException('Липсва device token.');
    }

    const phoneVariants = buildBulgarianPhoneVariants(normalizedPhone);
    const rows = await this.prisma.queryInSchema<any[]>(
      tenant.schemaName,
      `
      SELECT
        a.id,
        a.start_at,
        a.end_at,
        a.status,
        sv.name as service_name,
        s.name as staff_name
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      JOIN services sv ON sv.id = a.service_id
      JOIN staff s ON s.id = a.staff_id
      WHERE c.phone = ANY($1::text[])
        AND COALESCE(a.intake_data->>'clientDeviceToken', '') = $2::text
        AND a.start_at >= NOW()
        AND a.status NOT IN ('cancelled', 'completed', 'no_show')
      ORDER BY a.start_at ASC
      LIMIT 12
      `,
      [phoneVariants, normalizedDeviceToken],
    );

    return {
      phone: normalizedPhone,
      appointments: rows.map((row) => ({
        id: row.id,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status,
        serviceName: row.service_name,
        staffName: row.staff_name,
      })),
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
    @Query('tenant') queryTenantSlug: string,
  ) {
    const expectedKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');
    if (internalKey !== expectedKey) {
      throw new UnauthorizedException('Невалиден вътрешен ключ.');
    }

    const candidate = resolveTenantCandidate({
      host: forwardedHost,
      appDomain: this.config.get<string>('APP_DOMAIN', 'saloniq.bg'),
      headerSlug: tenantSlug,
      defaultTenantSlug: this.config.get<string>('DEFAULT_TENANT_SLUG', ''),
      queryTenantSlug,
    });

    if (!candidate) {
      throw new BadRequestException(
        'Не може да се определи бизнесът. Задай host, X-Tenant-Slug или DEFAULT_TENANT_SLUG.',
      );
    }

    try {
      let query: string;
      let param: string;

      if (candidate.type === 'slug') {
        param = candidate.value;
        query = `SELECT * FROM public.tenants WHERE slug = $1 AND is_active = true LIMIT 1`;
      } else {
        param = candidate.value;
        query = `SELECT * FROM public.tenants WHERE custom_domain = $1 AND is_active = true LIMIT 1`;
      }

      const rows = await this.prisma.$queryRawUnsafe<any[]>(query, param);

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
      plan: tenant.plan,
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
      enableTelegramNotifications: theme.enableTelegramNotifications ?? true,
      enableSmsNotifications: theme.enableSmsNotifications ?? Boolean(tenant.sms_api_key && tenant.sms_sender_id),
      notificationTemplates,
      theme: {
        primaryColor: theme.primaryColor || '#7c3aed',
        secondaryColor: theme.secondaryColor || '#a855f7',
        accentColor: theme.accentColor || '#f59e0b',
        fontFamily: theme.fontFamily || 'Inter',
        logoUrl: theme.logoUrl || null,
        faviconUrl: theme.faviconUrl || null,
        coverImageUrl: theme.coverImageUrl || null,
        coverText: theme.coverText || null,
        logoShape: theme.logoShape || 'rounded',
        borderRadius: theme.borderRadius || 'rounded',
        surfaceStyle: theme.surfaceStyle || 'light',
        poweredByText: theme.poweredByText || 'Powered by SalonIQ',
        serviceCategories: this.normalizeServiceCategories(theme.serviceCategories),
      },
      showBusinessNameInPortal: theme.showBusinessNameInPortal ?? true,
    };
  }

  private nullable(value: string | undefined | null) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }

  private normalizeServiceCategories(value: unknown) {
    if (!Array.isArray(value)) return [];

    const unique = new Set<string>();
    for (const entry of value) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      unique.add(trimmed.slice(0, 80));
    }

    return [...unique];
  }

  private async applyThemeColorsToServices(schemaName: string, theme: any) {
    await this.prisma.ensureServiceGroupColumns(schemaName);

    const categories = this.normalizeServiceCategories(theme?.serviceCategories);
    const palette = this.buildThemeCategoryPalette(
      typeof theme?.primaryColor === 'string' ? theme.primaryColor : '#7c3aed',
      typeof theme?.secondaryColor === 'string' ? theme.secondaryColor : '#a855f7',
    );

    const services = await this.prisma.queryInSchema<{ id: string; category: string | null }[]>(
      schemaName,
      `
      SELECT id, category
      FROM services
      WHERE color_mode = 'theme'
      `,
      [],
    );

    for (const service of services) {
      const color = this.resolveCategoryColor(service.category, categories, palette);
      await this.prisma.queryInSchema(
        schemaName,
        `
        UPDATE services
        SET color = $1::text,
            updated_at = NOW()
        WHERE id = $2::uuid
        `,
        [color, service.id],
      );
    }
  }

  private resolveCategoryColor(category: string | null, categories: string[], palette: string[]) {
    const normalizedCategory = typeof category === 'string' ? category.trim() : '';
    if (!normalizedCategory) {
      return palette[0];
    }

    const nextCategories = this.normalizeServiceCategories([...categories, normalizedCategory]);
    const index = nextCategories.findIndex((entry) => entry === normalizedCategory);
    return palette[Math.max(index, 0) % palette.length];
  }

  private buildThemeCategoryPalette(primary: string, secondary: string) {
    const primaryHsl = this.hexToHsl(primary) || { h: 265, s: 74, l: 55 };
    const secondaryHsl = this.hexToHsl(secondary) || { h: 290, s: 68, l: 62 };
    const hues = [
      primaryHsl.h,
      secondaryHsl.h,
      primaryHsl.h + 18,
      secondaryHsl.h - 18,
      primaryHsl.h + 36,
      secondaryHsl.h + 24,
      primaryHsl.h - 24,
      secondaryHsl.h + 46,
      primaryHsl.h + 58,
      secondaryHsl.h - 42,
    ];

    return hues.map((hue, index) =>
      this.hslToHex({
        h: this.normalizeHue(hue),
        s: this.clamp(primaryHsl.s + (index % 2 === 0 ? 2 : -4), 58, 78),
        l: this.clamp(54 + ((index % 4) - 1.5) * 4, 42, 66),
      }),
    );
  }

  private resolveThemeAsset(value: string | undefined | null, currentValue: string | null | undefined) {
    if (value === '__REMOVE_ASSET__') return null;
    if (value === undefined) return currentValue ?? null;
    const normalized = this.nullable(value);
    if (normalized === null) {
      return currentValue ?? null;
    }
    return normalized;
  }

  private hexToHsl(hex: string) {
    const rgb = this.parseHex(hex);
    if (!rgb) return null;
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    const l = (max + min) / 2;
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

    if (delta !== 0) {
      if (max === r) h = ((g - b) / delta) % 6;
      else if (max === g) h = (b - r) / delta + 2;
      else h = (r - g) / delta + 4;
    }

    return {
      h: this.normalizeHue(h * 60),
      s: Math.round(s * 100),
      l: Math.round(l * 100),
    };
  }

  private hslToHex({ h, s, l }: { h: number; s: number; l: number }) {
    const saturation = s / 100;
    const lightness = l / 100;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];

    return `#${[r, g, b]
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  private parseHex(value: string) {
    const normalized = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(normalized)) {
      return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16),
      };
    }
    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
      return {
        r: parseInt(`${normalized[1]}${normalized[1]}`, 16),
        g: parseInt(`${normalized[2]}${normalized[2]}`, 16),
        b: parseInt(`${normalized[3]}${normalized[3]}`, 16),
      };
    }
    return null;
  }

  private normalizeHue(value: number) {
    const normalized = value % 360;
    return normalized < 0 ? normalized + 360 : normalized;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
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
