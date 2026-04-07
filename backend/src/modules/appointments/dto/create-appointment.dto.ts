import {
  IsString,
  IsEmail,
  IsUUID,
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

export class CreateAppointmentDto {
  @ApiProperty({ description: 'ID на услугата' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ description: 'ID на служителя' })
  @IsUUID()
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
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, { message: 'Невалиден телефонен номер' })
  @Transform(({ value }) => value?.replace(/\s/g, ''))
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

  @ApiProperty({ description: 'Съгласие за известявания (GDPR)' })
  @IsBoolean()
  consentGiven: boolean;
}
