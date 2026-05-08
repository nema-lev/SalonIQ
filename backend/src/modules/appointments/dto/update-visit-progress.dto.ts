import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { VisitProgress } from '../../../common/types/enums';

export class UpdateVisitProgressDto {
  @ApiProperty({ enum: VisitProgress })
  @IsEnum(VisitProgress)
  progress: VisitProgress;
}
