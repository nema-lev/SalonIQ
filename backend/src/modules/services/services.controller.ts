import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max, IsIn, IsArray, IsInt, Matches } from 'class-validator';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { TenantPrismaService } from '../../common/prisma/tenant-prisma.service';

class UpsertServiceDto {
  @IsString() name: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() category?: string;
  @IsNumber() @Min(5) @Max(480) duration_minutes: number;
  @IsNumber() @Min(0) @IsOptional() price?: number;
  @IsString() @IsOptional() color?: string;
  @IsBoolean() @IsOptional() is_public?: boolean;
  @IsOptional() @IsIn(['standard', 'group']) booking_mode?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) slot_capacity?: number;
  @IsOptional() @IsArray() @IsIn(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], { each: true }) group_days?: string[];
  @IsOptional() @IsArray() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true }) group_time_slots?: string[];
  @IsOptional() @IsIn(['manual', 'theme']) color_mode?: string;
}

@ApiTags('services')
@Controller({ path: 'services', version: '1' })
export class ServicesController {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Публичен списък (само видими услуги) */
  @Get()
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Публични услуги' })
  async findPublic(@CurrentTenant() tenant: any) {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, description, category, duration_minutes,
              price, currency, color, color_mode, staff_ids, display_order,
              booking_mode, slot_capacity, group_days, group_time_slots
       FROM services WHERE is_public = true
       ORDER BY display_order ASC, name ASC`,
      [],
    );
  }

  /** Admin: всички услуги */
  @Get('admin')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Всички услуги (admin)' })
  async findAll(@CurrentTenant() tenant: any) {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, description, category, duration_minutes,
              price, currency, color, color_mode, staff_ids, is_public, display_order,
              booking_mode, slot_capacity, group_days, group_time_slots
       FROM services ORDER BY display_order ASC, name ASC`,
      [],
    );
  }

  /** Admin: създай услуга */
  @Post()
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentTenant() tenant: any, @Body() dto: UpsertServiceDto) {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);

    const rows = await this.prisma.queryInSchema<{ id: string }[]>(
      tenant.schemaName,
      `INSERT INTO services (
        name, description, category, duration_minutes, price, color, is_public,
        booking_mode, slot_capacity, group_days, group_time_slots, color_mode
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::text[],$11::text[],$12) RETURNING id`,
      [dto.name, dto.description||null, dto.category||null,
       dto.duration_minutes, dto.price ?? null, dto.color||'#8b5cf6', dto.is_public??true,
       dto.booking_mode || 'standard', dto.slot_capacity ?? 1, dto.group_days || [], dto.group_time_slots || [], dto.color_mode || 'manual'],
    );
    return { id: rows[0].id };
  }

  /** Admin: обнови услуга */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  async update(
    @CurrentTenant() tenant: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertServiceDto,
  ) {
    await this.prisma.ensureServiceGroupColumns(tenant.schemaName);
    await this.prisma.queryInSchema(
      tenant.schemaName,
      `UPDATE services SET name=$1, description=$2, category=$3,
       duration_minutes=$4, price=$5, color=$6, is_public=$7,
       booking_mode=$8, slot_capacity=$9, group_days=$10::text[], group_time_slots=$11::text[],
       color_mode=$12, updated_at=NOW()
       WHERE id=$13`,
      [dto.name, dto.description||null, dto.category||null,
       dto.duration_minutes, dto.price ?? null, dto.color||'#8b5cf6',
       dto.is_public??true, dto.booking_mode || 'standard', dto.slot_capacity ?? 1, dto.group_days || [], dto.group_time_slots || [], dto.color_mode || 'manual', id],
    );
    return { id };
  }
}
