import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AuthService } from '../auth/auth.service';
import { PlatformService } from './platform.service';

class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class UpdatePlatformTenantDto {
  @IsOptional()
  @IsIn(['SALON', 'BARBERSHOP', 'HAIR_SALON', 'NAIL_STUDIO', 'SPA', 'DENTAL', 'MASSAGE', 'BEAUTY', 'OTHER'])
  businessType?: string;

  @IsOptional()
  @IsIn(['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'])
  planStatus?: string;

  @IsOptional()
  @IsDateString()
  planRenewsAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword: string;
}

@ApiTags('platform')
@Controller({ path: 'platform', version: '1' })
export class PlatformController {
  constructor(
    private readonly authService: AuthService,
    private readonly platformService: PlatformService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход за platform super admin' })
  login(@Body() dto: PlatformLoginDto) {
    return this.authService.loginPlatform(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Данни за текущия platform super admin' })
  me() {
    return this.authService.getCurrentPlatformAdmin();
  }

  @Get('tenants')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Списък с всички бизнеси и кратко обобщение' })
  listTenants() {
    return this.platformService.listTenants();
  }

  @Patch('tenants/:id')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Промени тип бизнес, платено до и активност' })
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlatformTenantDto,
  ) {
    return this.platformService.updateTenant(id, dto);
  }

  @Post('tenants/:id/impersonate')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Влез като owner в избрания бизнес' })
  impersonate(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformService.impersonateTenant(id);
  }

  @Post('tenants/:id/reset-owner-password')
  @UseGuards(JwtAuthGuard, PlatformAdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Задай нова временна парола на owner акаунта' })
  resetOwnerPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.platformService.resetTenantOwnerPassword(id, dto.newPassword);
  }
}
