import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  Matches,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeBulgarianPhone } from '../../../common/utils/phone';

export class CreateBookingRequestDto {
  @ApiProperty({ description: 'ID на услугата' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден serviceId' },
  )
  serviceId: string;

  @ApiPropertyOptional({ description: 'Предпочитан специалист' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден preferredStaffId' },
  )
  @IsOptional()
  preferredStaffId?: string;

  @ApiPropertyOptional({ description: 'Предпочитан ден', example: '2026-04-23' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Невалиден desiredDate' })
  desiredDate?: string;

  @ApiPropertyOptional({ description: 'Предпочитана част от деня', enum: ['morning', 'afternoon', 'evening', 'any'] })
  @IsOptional()
  @IsIn(['morning', 'afternoon', 'evening', 'any'])
  desiredTimePeriod?: 'morning' | 'afternoon' | 'evening' | 'any';

  @ApiProperty({ description: 'Две имена на клиента' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  clientName: string;

  @ApiProperty({ description: 'Телефон' })
  @IsString()
  @Matches(/^(?:\+359\d{9}|0\d{9})$/, { message: 'Невалиден телефонен номер' })
  @Transform(({ value }) => normalizeBulgarianPhone(value))
  clientPhone: string;

  @ApiPropertyOptional({ description: 'Email адрес' })
  @IsEmail({}, { message: 'Невалиден email' })
  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase().trim())
  clientEmail?: string;

  @ApiPropertyOptional({ description: 'Бележка' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ description: 'Transactional известията са включени по подразбиране' })
  @IsBoolean()
  @IsOptional()
  consentGiven?: boolean;

  @ApiPropertyOptional({ description: 'Публичният base URL на приложението' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  publicBaseUrl?: string;

  @ApiPropertyOptional({ description: 'Локален идентификатор на устройството' })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  deviceToken?: string;
}
