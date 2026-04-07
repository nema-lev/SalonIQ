import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelegramService } from './telegram.service';
import { SmsApiService } from './smsapi.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { NotificationProcessor } from './notification.processor';
import { AppointmentsModule } from '../appointments/appointments.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    AppointmentsModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [TelegramService, SmsApiService, NotificationProcessor],
  exports: [TelegramService],
})
export class NotificationsModule {}
