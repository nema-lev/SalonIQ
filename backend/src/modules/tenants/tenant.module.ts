import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { TenantController } from './tenant.controller';

@Module({
  imports: [NotificationsModule],
  controllers: [TenantController],
})
export class TenantModule {}
