import {
  Controller, Get, Post, Patch, Body, Param, UseGuards,
  ParseUUIDPipe, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';
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
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, description, category, duration_minutes,
              price, currency, color, staff_ids, display_order
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
    return this.prisma.queryInSchema(
      tenant.schemaName,
      `SELECT id, name, description, category, duration_minutes,
              price, currency, color, staff_ids, is_public, display_order
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
    const rows = await this.prisma.queryInSchema<{ id: string }[]>(
      tenant.schemaName,
      `INSERT INTO services (name, description, category, duration_minutes, price, color, is_public)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [dto.name, dto.description||null, dto.category||null,
       dto.duration_minutes, dto.price ?? null, dto.color||'#8b5cf6', dto.is_public??true],
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
    await this.prisma.queryInSchema(
      tenant.schemaName,
      `UPDATE services SET name=$1, description=$2, category=$3,
       duration_minutes=$4, price=$5, color=$6, is_public=$7, updated_at=NOW()
       WHERE id=$8`,
      [dto.name, dto.description||null, dto.category||null,
       dto.duration_minutes, dto.price ?? null, dto.color||'#8b5cf6',
       dto.is_public??true, id],
    );
    return { id };
  }
}
