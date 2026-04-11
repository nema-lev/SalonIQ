import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { buildBulgarianPhoneVariants, normalizeBulgarianPhone } from '../../common/utils/phone';

class ImportedClientDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class ImportClientsDto {
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ImportedClientDto)
  contacts!: ImportedClientDto[];
}

class UpdateClientDto {
  @IsString()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  salutation?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  is_blocked?: boolean;
}

@ApiTags('clients')
@Controller({ path: 'clients', version: '1' })
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ClientsController {
  constructor(private readonly prisma: TenantPrismaService) {}

  @Post('import')
  @ApiOperation({ summary: 'Импорт на клиенти от контакти/CSV' })
  async importClients(
    @CurrentTenant() tenant: any,
    @Body() dto: ImportClientsDto,
  ) {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const contact of dto.contacts) {
      const normalizedPhone = normalizeBulgarianPhone(contact.phone);
      const variants = buildBulgarianPhoneVariants(normalizedPhone);
      const name = contact.name?.trim() || normalizedPhone;
      const salutation = this.getDefaultSalutation(name);
      const email = contact.email?.trim().toLowerCase() || null;

      if (!/^\+359\d{9}$/.test(normalizedPhone)) {
        skipped += 1;
        continue;
      }

      const existing = await this.prisma.queryInSchema<{ id: string }[]>(
        tenant.schemaName,
        `
        SELECT id
        FROM clients
        WHERE phone = ANY($1::text[])
        LIMIT 1
        `,
        [variants],
      );

      if (existing.length) {
        await this.prisma.queryInSchema(
          tenant.schemaName,
          `
          UPDATE clients
          SET name = $1,
              phone = $2,
              email = COALESCE($3, email),
              profile_data = jsonb_set(
                COALESCE(profile_data, '{}'::jsonb),
                '{salutation}',
                to_jsonb(COALESCE(NULLIF(profile_data->>'salutation', ''), $5::text))
              ),
              updated_at = NOW()
          WHERE id = $4::uuid
          `,
          [name, normalizedPhone, email, existing[0].id, salutation],
        );
        updated += 1;
        continue;
      }

      await this.prisma.queryInSchema(
        tenant.schemaName,
        `
        INSERT INTO clients (
          name, phone, email,
          notifications_consent, marketing_consent, consent_given_at, profile_data
        )
        VALUES ($1, $2, $3, true, false, NOW(), $4::jsonb)
        `,
        [name, normalizedPhone, email, JSON.stringify({ salutation })],
      );
      created += 1;
    }

    return {
      created,
      updated,
      skipped,
      total: dto.contacts.length,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Всички клиенти с търсене' })
  async findAll(
    @CurrentTenant() tenant: any,
    @Query('q') search?: string,
  ) {
    if (search) {
      const phoneVariants = buildBulgarianPhoneVariants(search);
      const phonePatterns = [search, ...phoneVariants].map((value) => `%${value}%`);

      return this.prisma.queryInSchema(
        tenant.schemaName,
        `SELECT id, name, phone, email, total_visits, total_spent,
                no_show_count, is_blocked, last_visit_at, created_at,
                COALESCE(NULLIF(profile_data->>'salutation', ''), split_part(name, ' ', 1)) as salutation
         FROM clients
         WHERE name ILIKE $1 OR phone ILIKE ANY($2::text[])
         ORDER BY last_visit_at DESC NULLS LAST
         LIMIT 50`,
        [`%${search}%`, phonePatterns],
      );
    }
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, phone, email, total_visits, total_spent,
              no_show_count, is_blocked, last_visit_at, created_at,
              COALESCE(NULLIF(profile_data->>'salutation', ''), split_part(name, ' ', 1)) as salutation
       FROM clients
       ORDER BY last_visit_at DESC NULLS LAST, created_at DESC
       LIMIT 100`,
      [],
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Обнови клиентски профил' })
  async updateClient(
    @CurrentTenant() tenant: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    const salutation = dto.salutation?.trim() || this.getDefaultSalutation(dto.name);
    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE clients
      SET name = $1,
          email = $2,
          is_blocked = COALESCE($3, is_blocked),
          profile_data = jsonb_set(
            COALESCE(profile_data, '{}'::jsonb),
            '{salutation}',
            to_jsonb($4::text)
          ),
          updated_at = NOW()
      WHERE id = $5::uuid
      `,
      [dto.name.trim(), dto.email?.trim().toLowerCase() || null, dto.is_blocked ?? null, salutation, id],
    );

    return { id, salutation };
  }

  @Get(':id/appointments')
  @ApiOperation({ summary: 'История на посещенията на клиент' })
  async clientHistory(
    @CurrentTenant() tenant: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT a.id, a.start_at, a.end_at, a.status, a.price,
              sv.name as service_name, sv.color as service_color,
              s.name as staff_name
       FROM appointments a
       JOIN services sv ON sv.id = a.service_id
       JOIN staff s ON s.id = a.staff_id
       WHERE a.client_id = $1
       ORDER BY a.start_at DESC
       LIMIT 50`,
      [id],
    );
  }

  private getDefaultSalutation(name: string) {
    const firstName = name.trim().split(/\s+/)[0] || '';
    return firstName || name.trim();
  }
}
