import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class UpsertStaffDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-f]{6}$/i)
  color?: string;

  @IsOptional()
  @IsBoolean()
  accepts_online?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @IsOptional()
  @IsArray()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, { each: true })
  serviceIds?: string[];
}

@ApiTags('staff')
@Controller({ path: 'staff', version: '1' })
export class StaffController {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Публичен списък на активния персонал (по избор: за конкретна услуга) */
  @Get()
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Активен персонал (по избор филтриран по услуга)' })
  async findAll(
    @CurrentTenant() tenant: any,
    @Query('serviceId') serviceId?: string,
  ) {
    if (serviceId) {
      return this.prisma.queryInSchema(
        tenant.schemaName,
        `SELECT s.id, s.name, s.avatar_url, s.bio, s.specialties, s.color
         FROM staff s
         WHERE s.is_active = true AND s.accepts_online = true
           AND EXISTS (
             SELECT 1
             FROM services sv
             WHERE sv.id = $1::uuid
               AND s.id = ANY(sv.staff_ids)
           )
         ORDER BY s.name ASC`,
        [serviceId],
      );
    }

    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, avatar_url, bio, specialties, color
       FROM staff
       WHERE is_active = true AND accepts_online = true
       ORDER BY name ASC`,
      [],
    );
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Всички служители за admin панела' })
  async findAllForAdmin(@CurrentTenant() tenant: any) {
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `
      SELECT
        s.id,
        s.name,
        s.email,
        s.phone,
        s.avatar_url,
        s.bio,
        s.specialties,
        s.color,
        s.is_active,
        s.accepts_online,
        COALESCE(
          ARRAY(
            SELECT sv.id
            FROM services sv
            WHERE s.id = ANY(sv.staff_ids)
            ORDER BY sv.display_order ASC, sv.name ASC
          ),
          ARRAY[]::uuid[]
        ) as service_ids
      FROM staff s
      ORDER BY s.is_active DESC, s.name ASC
      `,
      [],
    );
  }

  @Post('admin')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Създай служител от admin панела' })
  async create(@CurrentTenant() tenant: any, @Body() dto: UpsertStaffDto) {
    const rows = await this.prisma.queryInSchema<{ id: string }[]>(
      tenant.schemaName,
      `
      INSERT INTO staff (
        name, email, phone, avatar_url, bio, specialties, color, accepts_online, is_active, working_hours
      )
      VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10::jsonb)
      RETURNING id
      `,
      [
        dto.name.trim(),
        this.nullable(dto.email),
        this.nullable(dto.phone),
        this.nullable(dto.avatar_url),
        this.nullable(dto.bio),
        dto.specialties || [],
        dto.color || '#7c3aed',
        dto.accepts_online ?? true,
        dto.is_active ?? true,
        JSON.stringify(this.defaultWorkingHours()),
      ],
    );

    await this.syncServiceAssignments(tenant.schemaName, rows[0].id, dto.serviceIds || []);
    return { id: rows[0].id };
  }

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови служител от admin панела' })
  async update(
    @CurrentTenant() tenant: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertStaffDto,
  ) {
    await this.prisma.queryInSchema(
      tenant.schemaName,
      `
      UPDATE staff
      SET name = $1,
          email = $2,
          phone = $3,
          avatar_url = $4,
          bio = $5,
          specialties = $6::text[],
          color = $7,
          accepts_online = $8,
          is_active = $9,
          updated_at = NOW()
      WHERE id = $10::uuid
      `,
      [
        dto.name.trim(),
        this.nullable(dto.email),
        this.nullable(dto.phone),
        this.nullable(dto.avatar_url),
        this.nullable(dto.bio),
        dto.specialties || [],
        dto.color || '#7c3aed',
        dto.accepts_online ?? true,
        dto.is_active ?? true,
        id,
      ],
    );

    await this.syncServiceAssignments(tenant.schemaName, id, dto.serviceIds || []);
    return { id };
  }

  private async syncServiceAssignments(schemaName: string, staffId: string, serviceIds: string[]) {
    await this.prisma.queryInSchema(
      schemaName,
      `
      UPDATE services
      SET staff_ids = array_remove(staff_ids, $1::uuid),
          updated_at = NOW()
      WHERE $1::uuid = ANY(staff_ids)
      `,
      [staffId],
    );

    if (!serviceIds.length) {
      return;
    }

    await this.prisma.queryInSchema(
      schemaName,
      `
      UPDATE services
      SET staff_ids = array_append(staff_ids, $1::uuid),
          updated_at = NOW()
      WHERE id = ANY($2::uuid[])
        AND NOT ($1::uuid = ANY(staff_ids))
      `,
      [staffId, serviceIds],
    );
  }

  private defaultWorkingHours() {
    return {
      mon: { open: '09:00', close: '18:00', isOpen: true },
      tue: { open: '09:00', close: '18:00', isOpen: true },
      wed: { open: '09:00', close: '18:00', isOpen: true },
      thu: { open: '09:00', close: '18:00', isOpen: true },
      fri: { open: '09:00', close: '18:00', isOpen: true },
      sat: { open: '10:00', close: '15:00', isOpen: true },
      sun: { open: '00:00', close: '00:00', isOpen: false },
    };
  }

  private nullable(value?: string | null) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
}
