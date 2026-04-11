import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelegramService } from './telegram.service';
import { SmsApiService } from './smsapi.service';
import { TelegramWebhookController } from './telegram-webhook.controller';
import { NotificationProcessor } from './notification.processor';
import { AppointmentsModule } from '../appointments/appointments.module';

const redisHost = process.env.REDIS_HOST?.trim();
const redisEnabled = Boolean(redisHost);

@Module({
  imports: [
    ...(redisEnabled ? [BullModule.registerQueue({ name: 'notifications' })] : []),
    AppointmentsModule,
  ],
  controllers: [TelegramWebhookController],
  providers: [
    TelegramService,
    SmsApiService,
    ...(redisEnabled ? [NotificationProcessor] : []),
  ],
  exports: [TelegramService],
})
export class NotificationsModule {}
