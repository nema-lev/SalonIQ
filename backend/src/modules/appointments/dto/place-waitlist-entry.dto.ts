import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class PlaceWaitlistEntryDto {
  @ApiProperty({ description: 'ID на служителя, при когото заявката се поставя в графика' })
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден staffId' },
  )
  staffId: string;

  @ApiProperty({ description: 'Начало на часа (ISO 8601)', example: '2026-05-11T10:00:00+03:00' })
  @IsISO8601()
  startAt: string;

  @ApiPropertyOptional({ description: 'Очаквана продължителност в минути. Ако е подадена, трябва да съвпада с услугата.' })
  @IsInt()
  @Min(5)
  @Max(480)
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ description: 'Клиентски ключ за бъдеща идемпотентност. Не създава нова DB гаранция.' })
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-zA-Z0-9._:-]+$/, { message: 'Невалиден idempotencyKey' })
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  idempotencyKey?: string;

  @ApiPropertyOptional({ description: 'Запазено за бъдещо известяване. В момента не изпраща известие.' })
  @IsBoolean()
  @IsOptional()
  notifyClient?: boolean = false;
}
