import { IsDateString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSlotsDto {
  @ApiProperty()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден serviceId' },
  )
  serviceId: string;

  @ApiProperty()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    { message: 'Невалиден staffId' },
  )
  staffId: string;

  @ApiProperty({ example: '2025-04-15' })
  @IsDateString()
  date: string;
}
