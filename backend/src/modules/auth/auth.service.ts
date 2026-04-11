// auth.service.ts
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { TelegramService } from '../notifications/telegram.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  async login(email: string, password: string) {
    const owners = await this.prisma.$queryRaw<
      {
        id: string;
        tenant_id: string;
        password_hash: string;
        name: string;
        role: string;
        schema_name: string;
        business_name: string;
        slug: string;
        is_active: boolean;
        plan_status: string;
        plan_renews_at: Date | null;
      }[]
    >`
      SELECT o.id, o.tenant_id, o.password_hash, o.name, o.role,
             t.schema_name, t.business_name, t.slug, t.is_active, t.plan_status, t.plan_renews_at
      FROM public.tenant_owners o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE o.email = ${email}
      LIMIT 1
    `;

    if (!owners.length) {
      throw new UnauthorizedException('Невалиден email или парола.');
    }

    const owner = owners[0];
    this.assertTenantOwnerAccess(owner);
    const isValid = await bcrypt.compare(password, owner.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Невалиден email или парола.');
    }

    return this.buildLoginResponse({
      id: owner.id,
      tenantId: owner.tenant_id,
      schemaName: owner.schema_name,
      tenantSlug: owner.slug,
      role: owner.role,
      name: owner.name,
      businessName: owner.business_name,
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async getCurrentOwner(ownerId: string) {
    const owners = await this.prisma.$queryRaw<
      {
        id: string;
        name: string;
        email: string;
        role: string;
        tenant_id: string;
        is_active: boolean;
        plan_status: string;
        plan_renews_at: Date | null;
      }[]
    >`
      SELECT o.id, o.name, o.email, o.role, o.tenant_id, t.is_active, t.plan_status, t.plan_renews_at
      FROM public.tenant_owners o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE o.id = ${ownerId}::uuid
      LIMIT 1
    `;

    if (!owners.length) {
      throw new NotFoundException('Собственикът не е намерен.');
    }

    const owner = owners[0];
    this.assertTenantOwnerAccess(owner);
    return {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      role: owner.role,
      tenantId: owner.tenant_id,
    };
  }

  async loginPlatform(email: string, password: string) {
    const platformEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    const platformPassword = process.env.SUPER_ADMIN_PASSWORD || '';

    if (!platformEmail || !platformPassword) {
      throw new BadRequestException('Super admin достъпът не е конфигуриран.');
    }

    if (email.trim().toLowerCase() !== platformEmail || password !== platformPassword) {
      throw new UnauthorizedException('Невалиден email или парола.');
    }

    const accessToken = this.jwtService.sign({
      sub: 'platform-super-admin',
      role: 'SUPER_ADMIN',
      scope: 'platform',
    });

    return {
      accessToken,
      admin: {
        email: platformEmail,
        role: 'SUPER_ADMIN',
      },
    };
  }

  getCurrentPlatformAdmin() {
    const platformEmail = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
    return {
      email: platformEmail || null,
      role: 'SUPER_ADMIN',
    };
  }

  issueImpersonationToken(owner: {
    id: string;
    tenant_id: string;
    schema_name: string;
    role: string;
    business_name: string;
    slug: string;
    name: string;
  }) {
    const payload = {
      sub: owner.id,
      tenantId: owner.tenant_id,
      schemaName: owner.schema_name,
      role: owner.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      owner: {
        id: owner.id,
        name: owner.name,
        role: owner.role,
        businessName: owner.business_name,
        tenantSlug: owner.slug,
      },
    };
  }

  async requestOwnerRecovery(email: string, publicBaseUrl?: string) {
    const rows = await this.prisma.$queryRaw<
      {
        owner_id: string;
        owner_email: string;
        tenant_id: string;
        slug: string;
        business_name: string;
        telegram_bot_token: string | null;
        telegram_chat_id: string | null;
        theme_config: unknown;
      }[]
    >`
      SELECT
        o.id AS owner_id,
        o.email AS owner_email,
        t.id AS tenant_id,
        t.slug,
        t.business_name,
        t.telegram_bot_token,
        t.telegram_chat_id,
        t.theme_config
      FROM public.tenant_owners o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE o.email = ${email.trim().toLowerCase()}
      ORDER BY o.created_at ASC
      LIMIT 1
    `;

    if (!rows.length) {
      return { accepted: true };
    }

    const owner = rows[0];
    const theme = this.parseTheme(owner.theme_config);
    const telegramEnabled = theme.enableTelegramNotifications ?? true;

    if (!telegramEnabled || !owner.telegram_bot_token || !owner.telegram_chat_id) {
      return { accepted: true };
    }

    const token = `${owner.tenant_id}.${randomBytes(32).toString('hex')}`;
    const tokenHash = this.hashRecoveryToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const nextTheme = {
      ...theme,
      ownerRecoveryTokenHash: tokenHash,
      ownerRecoveryExpiresAt: expiresAt,
      ownerRecoveryOwnerId: owner.owner_id,
      ownerRecoveryOwnerEmail: owner.owner_email,
    };

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET theme_config = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      JSON.stringify(nextTheme),
      owner.tenant_id,
    );

    const resetUrl = this.buildOwnerRecoveryLink(owner.slug, publicBaseUrl, token);
    await this.telegramService.sendOwnerPasswordRecovery(
      owner.telegram_bot_token,
      owner.telegram_chat_id,
      owner.business_name,
      resetUrl,
    );

    return { accepted: true };
  }

  async verifyOwnerRecoveryToken(token: string) {
    const recovery = await this.loadOwnerRecoverySession(token);
    return {
      valid: true,
      businessName: recovery.businessName,
      ownerEmail: this.maskEmail(recovery.ownerEmail),
      expiresAt: recovery.expiresAt.toISOString(),
    };
  }

  async resetOwnerPasswordByRecoveryToken(token: string, newPassword: string) {
    const recovery = await this.loadOwnerRecoverySession(token);
    const nextPasswordHash = await this.hashPassword(newPassword);
    const clearedTheme = { ...recovery.theme };

    delete clearedTheme.ownerRecoveryTokenHash;
    delete clearedTheme.ownerRecoveryExpiresAt;
    delete clearedTheme.ownerRecoveryOwnerId;
    delete clearedTheme.ownerRecoveryOwnerEmail;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenant_owners
      SET password_hash = $1,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      nextPasswordHash,
      recovery.ownerId,
    );

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenants
      SET theme_config = $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid
      `,
      JSON.stringify(clearedTheme),
      recovery.tenantId,
    );

    return {
      reset: true,
      ownerEmail: this.maskEmail(recovery.ownerEmail),
    };
  }

  async updateCurrentOwner(
    ownerId: string,
    dto: {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    const owners = await this.prisma.$queryRaw<
      { id: string; name: string; email: string; password_hash: string }[]
    >`
      SELECT id, name, email, password_hash
      FROM public.tenant_owners
      WHERE id = ${ownerId}::uuid
      LIMIT 1
    `;

    if (!owners.length) {
      throw new NotFoundException('Собственикът не е намерен.');
    }

    const current = owners[0];
    const nextName = dto.name?.trim() || current.name;
    const nextEmail = dto.email?.trim().toLowerCase() || current.email;
    const wantsSensitiveChange =
      (dto.email && nextEmail !== current.email) || Boolean(dto.newPassword);

    if (wantsSensitiveChange && !dto.currentPassword) {
      throw new BadRequestException('За смяна на email или парола въведете текущата парола.');
    }

    if (dto.newPassword && dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('Новата парола трябва да е различна от текущата.');
    }

    if (wantsSensitiveChange) {
      const isValid = await bcrypt.compare(dto.currentPassword!, current.password_hash);
      if (!isValid) {
        throw new UnauthorizedException('Текущата парола е грешна.');
      }
    }

    if (nextEmail !== current.email) {
      const existing = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM public.tenant_owners
        WHERE email = ${nextEmail}
          AND id <> ${ownerId}::uuid
        LIMIT 1
      `;

      if (existing.length) {
        throw new BadRequestException('Този email вече се използва.');
      }
    }

    const nextPasswordHash = dto.newPassword
      ? await this.hashPassword(dto.newPassword)
      : current.password_hash;

    await this.prisma.$executeRawUnsafe(
      `
      UPDATE public.tenant_owners
      SET name = $1,
          email = $2,
          password_hash = $3,
          updated_at = NOW()
      WHERE id = $4::uuid
      `,
      nextName,
      nextEmail,
      nextPasswordHash,
      ownerId,
    );

    return {
      updated: true,
      owner: {
        id: ownerId,
        name: nextName,
        email: nextEmail,
      },
    };
  }

  private buildLoginResponse(owner: {
    id: string;
    tenantId: string;
    schemaName: string;
    tenantSlug: string;
    role: string;
    name: string;
    businessName: string;
  }) {
    const payload = {
      sub: owner.id,
      tenantId: owner.tenantId,
      schemaName: owner.schemaName,
      role: owner.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      owner: {
        id: owner.id,
        name: owner.name,
        role: owner.role,
        businessName: owner.businessName,
        tenantSlug: owner.tenantSlug,
      },
    };
  }

  private parseTheme(themeConfig: unknown): Record<string, any> {
    if (typeof themeConfig === 'string') {
      return JSON.parse(themeConfig || '{}');
    }

    if (themeConfig && typeof themeConfig === 'object') {
      return themeConfig as Record<string, any>;
    }

    return {};
  }

  private hashRecoveryToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildOwnerRecoveryLink(tenantSlug: string, publicBaseUrl?: string, token?: string) {
    const cleanedOrigin = (publicBaseUrl || '').trim().replace(/\/+$/, '');

    if (cleanedOrigin) {
      return `${cleanedOrigin}/admin/reset-password?token=${encodeURIComponent(token || '')}`;
    }

    const appDomain = this.configService.get<string>('APP_DOMAIN', 'saloniq.bg');
    return `https://${tenantSlug}.${appDomain}/admin/reset-password?token=${encodeURIComponent(token || '')}`;
  }

  private async loadOwnerRecoverySession(token: string) {
    const [tenantId] = token.split('.', 1);
    if (!tenantId || !/^[0-9a-fA-F-]{36}$/.test(tenantId)) {
      throw new UnauthorizedException('Невалиден recovery token.');
    }

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        business_name: string;
        theme_config: unknown;
      }[]
    >`
      SELECT id, business_name, theme_config
      FROM public.tenants
      WHERE id = ${tenantId}::uuid
      LIMIT 1
    `;

    if (!rows.length) {
      throw new UnauthorizedException('Невалиден recovery token.');
    }

    const tenant = rows[0];
    const theme = this.parseTheme(tenant.theme_config);
    const storedHash = typeof theme.ownerRecoveryTokenHash === 'string' ? theme.ownerRecoveryTokenHash : '';
    const ownerId = typeof theme.ownerRecoveryOwnerId === 'string' ? theme.ownerRecoveryOwnerId : '';
    const ownerEmail = typeof theme.ownerRecoveryOwnerEmail === 'string' ? theme.ownerRecoveryOwnerEmail : '';
    const expiresAtRaw = typeof theme.ownerRecoveryExpiresAt === 'string' ? theme.ownerRecoveryExpiresAt : '';
    const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

    if (!storedHash || !ownerId || !ownerEmail || !expiresAt || Number.isNaN(expiresAt.getTime())) {
      throw new UnauthorizedException('Recovery token-ът вече не е валиден.');
    }

    if (expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Recovery token-ът е изтекъл.');
    }

    if (storedHash !== this.hashRecoveryToken(token)) {
      throw new UnauthorizedException('Невалиден recovery token.');
    }

    return {
      tenantId: tenant.id,
      businessName: tenant.business_name,
      ownerId,
      ownerEmail,
      expiresAt,
      theme,
    };
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    if (!local || !domain) {
      return email;
    }

    const visible = local.length <= 2 ? local[0] : local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
  }

  private assertTenantOwnerAccess(tenant: {
    is_active: boolean;
    plan_status: string;
    plan_renews_at: Date | null;
  }) {
    if (!tenant.is_active) {
      throw new ForbiddenException('Достъпът е спрян от платформата.');
    }

    const planStatus = tenant.plan_status;
    const renewsAt = tenant.plan_renews_at ? new Date(tenant.plan_renews_at) : null;
    const isExpired = Boolean(renewsAt && renewsAt.getTime() < Date.now());

    if (planStatus === 'PAST_DUE' || planStatus === 'CANCELLED' || isExpired) {
      throw new HttpException('Услугата не е платена.', 402);
    }
  }
}
