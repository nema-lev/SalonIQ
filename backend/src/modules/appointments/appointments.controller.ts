import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { GetSlotsDto } from './dto/get-slots.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { AppointmentStatus } from '../../common/types/enums';
import type { Tenant } from '@prisma/client';

@ApiTags('appointments')
@Controller({ path: 'appointments', version: '1' })
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  // ─── Публични ендпойнти (за booking формата) ─────────────────────────────

  /**
   * Свободни слотове — публичен, throttle-нат
   */
  @Get('slots')
  @UseGuards(TenantGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Свободни часове за дата/услуга/служител' })
  async getAvailableSlots(
    @Query() dto: GetSlotsDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.getAvailableSlots(
      tenant,
      dto.serviceId,
      dto.staffId,
      new Date(dto.date),
    );
  }

  /**
   * Записване на час — публичен, throttle-нат
   */
  @Post()
  @UseGuards(TenantGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Запази час' })
  async create(
    @Body() dto: CreateAppointmentDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.create(tenant, dto);
  }

  // ─── Защитени ендпойнти (admin панел) ────────────────────────────────────

  /**
   * Всички резервации за ден (за календара в admin панела)
   */
  @Get()
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Резервации за ден' })
  @ApiQuery({ name: 'date', description: 'ISO дата (2025-04-15)', required: true })
  @ApiQuery({ name: 'staffId', description: 'Филтър по служител', required: false })
  async findByDate(
    @Query('date') date: string,
    @Query('staffId') staffId: string | undefined,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.findByDate(tenant, new Date(date), staffId);
  }

  /**
   * Смяна на статус (потвърждение/отмяна/no-show)
   */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Смени статус на резервация' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.updateStatus(
      tenant,
      id,
      dto.status as AppointmentStatus,
      dto.reason,
      dto.cancelledBy,
    );
  }
}
