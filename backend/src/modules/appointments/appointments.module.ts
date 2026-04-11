import { Module } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsService } from './appointments.service';

const redisHost = process.env.REDIS_HOST?.trim();
const redisEnabled = Boolean(redisHost);

@Module({
  imports: [
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
            useValue: {
              add: async () => null,
            },
          },
        ]),
  ],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
