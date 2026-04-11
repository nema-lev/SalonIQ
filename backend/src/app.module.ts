import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';

import { PrismaModule } from './common/prisma/prisma.module';
import { TenantModule } from './modules/tenants/tenant.module';
import { AuthModule } from './modules/auth/auth.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { ClientsModule } from './modules/clients/clients.module';
import { StaffModule } from './modules/staff/staff.module';
import { ServicesModule } from './modules/services/services.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { StatsModule } from './modules/stats/stats.module';
import { PlatformModule } from './modules/platform/platform.module';
import { HealthController } from './health.controller';

const redisHost = process.env.REDIS_HOST?.trim();
const redisEnabled = Boolean(redisHost);

@Module({
  imports: [
    // ─── Config ────────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // ─── Rate Limiting ──────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 30),
        },
      ],
    }),

    // ─── Scheduler (за reminder jobs) ──────────────────────────
    ScheduleModule.forRoot(),

    // ─── BullMQ (notification queue) ───────────────────────────
    ...(redisEnabled
      ? [
          BullModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              connection: {
                host: config.get<string>('REDIS_HOST'),
                port: config.get<number>('REDIS_PORT', 6379),
                password: config.get<string>('REDIS_PASSWORD') || undefined,
              },
              defaultJobOptions: {
                attempts: 3,
                backoff: {
                  type: 'exponential',
                  delay: 5000, // 5s, 25s, 125s
                },
                removeOnComplete: 100,
                removeOnFail: 500,
              },
            }),
          }),
        ]
      : []),

    // ─── Health checks ──────────────────────────────────────────
    TerminusModule,

    // ─── Application Modules ────────────────────────────────────
    PrismaModule,
    TenantModule,
    AuthModule,
    AppointmentsModule,
    ClientsModule,
    StaffModule,
    ServicesModule,
    NotificationsModule,
    StatsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
