import { Module } from '@nestjs/common';
import { InternalDiagnosticsController } from './internal-diagnostics.controller';
import { InternalDiagnosticsService } from './internal-diagnostics.service';

@Module({
  controllers: [InternalDiagnosticsController],
  providers: [InternalDiagnosticsService],
})
export class InternalDiagnosticsModule {}
