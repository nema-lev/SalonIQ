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
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

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

  @Post('admin')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Създай резервация директно от admin панела' })
  async createByAdmin(
    @Body() dto: CreateAppointmentDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.createByAdmin(tenant, dto);
  }

  @Post(':id/proposal')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Изпрати контра оферта към клиента за нов час' })
  async proposeAlternative(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { startAt: string; publicBaseUrl?: string },
    @CurrentTenant() tenant: Tenant,
  ) {
    if (!dto?.startAt) {
      throw new BadRequestException('Липсва новият час за предложението.');
    }

    return this.appointmentsService.proposeAlternative(tenant, id, dto);
  }

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

  @Get('upcoming')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Следващи резервации независимо от датата' })
  async findUpcoming(
    @CurrentTenant() tenant: Tenant,
    @Query('limit') limit?: string,
    @Query('mode') mode?: 'all' | 'attention' | 'pending',
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit || 10), 1), 50);
    return this.appointmentsService.findUpcoming(tenant, parsedLimit, mode || 'all');
  }

  @Patch(':id/owner-alert-read')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Маркирай клиентския отговор като видян от собственика' })
  async clearOwnerAlert(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.appointmentsService.clearOwnerAlert(tenant, id);
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

  @Get('proposal/:slug/respond')
  @ApiOperation({ summary: 'Приеми или откажи предложение чрез публичен линк' })
  async respondToProposalByLink(
    @Param('slug') slug: string,
    @Query('token') token: string,
    @Query('decision') decision: 'accept' | 'reject',
    @Res() res: Response,
  ) {
    if (!token || !['accept', 'reject'].includes(decision)) {
      throw new BadRequestException('Невалиден линк за предложение.');
    }

    const result = await this.appointmentsService.respondToProposalByToken(slug, token, decision);
    const isAccepted = result.ownerAlertState === 'proposal_accepted';
    const message = isAccepted
      ? 'Предложението е прието успешно.'
      : 'Предложението е отказано успешно.';

    res
      .status(200)
      .contentType('text/html; charset=utf-8')
      .send(`<!doctype html>
<html lang="bg">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SalonIQ</title>
    <style>
      body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f6fb;color:#111827;margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh}
      .card{max-width:420px;width:100%;background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:28px;box-shadow:0 24px 60px rgba(17,24,39,.08)}
      h1{font-size:24px;line-height:1.2;margin:0 0 12px}
      p{font-size:15px;line-height:1.6;color:#4b5563;margin:0}
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${isAccepted ? 'Часът е потвърден' : 'Предложението е отказано'}</h1>
      <p>${message}</p>
    </div>
  </body>
</html>`);
  }
}
