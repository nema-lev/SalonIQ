import { IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSlotsDto {
  @ApiProperty()
  @IsUUID()
  serviceId: string;

  @ApiProperty()
  @IsUUID()
  staffId: string;

  @ApiProperty({ example: '2025-04-15' })
  @IsDateString()
  date: string;
}
