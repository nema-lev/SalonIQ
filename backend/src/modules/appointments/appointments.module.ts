import { Module, forwardRef } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationProcessor } from '../notifications/notification.processor';

const redisHost = process.env.REDIS_HOST?.trim();
const redisEnabled = Boolean(redisHost);

@Module({
  imports: [
    forwardRef(() => NotificationsModule),
    ...(redisEnabled ? [BullModule.registerQueue({ name: 'notifications' })] : []),
  ],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    ...(redisEnabled
      ? []
      : [
          {
            provide: getQueueToken('notifications'),
            inject: [NotificationProcessor],
            useFactory: (processor: NotificationProcessor) => ({
              add: async (name: string, data: unknown, options?: { delay?: number }) => {
                const delay = Number(options?.delay || 0);

                if (delay > 0) {
                  return {
                    skipped: true,
                    reason: 'delayed-jobs-require-redis',
                    name,
                  };
                }

                await processor.process({
                  id: `inline-${name}-${Date.now()}`,
                  name,
                  data,
                } as any);

                return {
                  queued: false,
                  processedInline: true,
                  name,
                };
              },
            }),
          },
        ]),
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
