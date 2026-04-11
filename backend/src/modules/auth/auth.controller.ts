import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class PlatformLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  newPassword?: string;
}

class RecoveryRequestDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  publicBaseUrl?: string;
}

class RecoveryVerifyDto {
  @IsString()
  @MinLength(10)
  token: string;
}

class RecoveryResetDto {
  @IsString()
  @MinLength(10)
  token: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход за собственик на бизнес' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('platform/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход за platform super admin' })
  loginPlatform(@Body() dto: PlatformLoginDto) {
    return this.authService.loginPlatform(dto.email, dto.password);
  }

  @Post('recovery/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Заяви recovery линк за owner вход през Telegram' })
  requestRecovery(@Body() dto: RecoveryRequestDto) {
    return this.authService.requestOwnerRecovery(dto.email, dto.publicBaseUrl);
  }

  @Post('recovery/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Провери валидността на owner recovery token' })
  verifyRecovery(@Body() dto: RecoveryVerifyDto) {
    return this.authService.verifyOwnerRecoveryToken(dto.token);
  }

  @Post('recovery/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Смени owner паролата чрез recovery token' })
  resetRecovery(@Body() dto: RecoveryResetDto) {
    return this.authService.resetOwnerPasswordByRecoveryToken(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Данни за текущия собственик' })
  me(@Req() req: Request & { user: { id: string } }) {
    return this.authService.getCurrentOwner(req.user.id);
  }

  @Get('platform/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Данни за текущия platform admin' })
  platformMe() {
    return this.authService.getCurrentPlatformAdmin();
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обнови име, login email и парола на текущия собственик' })
  updateProfile(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateCurrentOwner(req.user.id, dto);
  }
}
