import {
  IsString,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsBoolean,
  IsObject,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeBulgarianPhone } from '../../../common/utils/phone';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'ID на услугата' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден serviceId' },
  )
  serviceId: string;

  @ApiProperty({ description: 'ID на служителя' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден staffId' },
  )
  staffId: string;

  @ApiProperty({ description: 'Начало на часа (ISO 8601)', example: '2025-04-15T10:30:00+03:00' })
  @IsISO8601()
  startAt: string;

  @ApiProperty({ description: 'Две имена на клиента' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  clientName: string;

  @ApiProperty({ description: 'Телефон (задължителен за известявания)', example: '+359888123456' })
  @IsString()
  @Matches(/^(?:\+359\d{9}|0\d{9})$/, { message: 'Невалиден телефонен номер' })
  @Transform(({ value }) => normalizeBulgarianPhone(value))
  clientPhone: string;

  @ApiPropertyOptional({ description: 'Email адрес' })
  @IsEmail({}, { message: 'Невалиден email' })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  clientEmail?: string;

  @ApiPropertyOptional({ description: 'Бележки от клиента' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Данни от intake форм (алергии, предпочитания и т.н.)' })
  @IsObject()
  @IsOptional()
  intakeData?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Transactional известията са задължителни и по подразбиране са включени' })
  @IsBoolean()
  @IsOptional()
  consentGiven?: boolean;

  @ApiPropertyOptional({ description: 'Изпрати предложение към клиента вместо директно потвърждение (admin only)' })
  @IsBoolean()
  @IsOptional()
  askClient?: boolean;

  @ApiPropertyOptional({ description: 'Публичният base URL на приложението за SMS/Telegram линкове (admin only)' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  publicBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Локален идентификатор на устройството за публичен клиентски portal lookup' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  deviceToken?: string;
}
