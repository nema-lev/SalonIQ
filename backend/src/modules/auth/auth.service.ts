// auth.service.ts
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly jwtService: JwtService,
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
