// auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
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
    // Намери собственика по email
    const owners = await this.prisma.$queryRaw<
      { id: string; tenant_id: string; password_hash: string; name: string; role: string; schema_name: string; business_name: string }[]
    >`
      SELECT o.id, o.tenant_id, o.password_hash, o.name, o.role,
             t.schema_name, t.business_name, t.slug
      FROM public.tenant_owners o
      JOIN public.tenants t ON t.id = o.tenant_id
      WHERE o.email = ${email} AND t.is_active = true
      LIMIT 1
    `;

    if (!owners.length) {
      throw new UnauthorizedException('Невалиден email или парола.');
    }

    const owner = owners[0];
    const isValid = await bcrypt.compare(password, owner.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Невалиден email или парола.');
    }

    const payload = {
      sub: owner.id,
      tenantId: owner.tenant_id,
      schemaName: owner.schema_name,
      role: owner.role,
    };

    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      owner: {
        id: owner.id,
        name: owner.name,
        role: owner.role,
        businessName: owner.business_name,
      },
    };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}
