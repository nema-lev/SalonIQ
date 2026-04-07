import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const port = configService.get<number>('PORT', 3001);

  // ─── Security ─────────────────────────────────────────────────────
  app.use(helmet());

  // CORS — позволява wildcard поддомейни за white-label
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // Same-origin заявки
      const allowedOrigins = corsOrigins.split(',').map((o) => o.trim());
      const appDomain = configService.get<string>('APP_DOMAIN', 'saloniq.bg');

      const isAllowed =
        allowedOrigins.some((allowed) => {
          if (allowed.startsWith('https://*.')) {
            const domain = allowed.replace('https://*.', '');
            return origin.endsWith(`.${domain}`) || origin === `https://${domain}`;
          }
          return allowed === origin;
        }) || origin.endsWith(`.${appDomain}`);

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: ${origin} not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // ─── API Versioning ───────────────────────────────────────────────
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.setGlobalPrefix('api');

  // ─── Global Pipes ─────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,         // Премахва непознати полета
      forbidNonWhitelisted: true,
      transform: true,         // Автоматично конвертира типове
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Global Filters & Interceptors ───────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // ─── Swagger (само в development) ────────────────────────────────
  if (nodeEnv !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('SalonIQ API')
      .setDescription('White-label booking platform API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Аутентикация')
      .addTag('tenants', 'Управление на бизнеси')
      .addTag('appointments', 'Резервации')
      .addTag('clients', 'Клиенти')
      .addTag('staff', 'Персонал')
      .addTag('services', 'Услуги')
      .addTag('notifications', 'Известявания')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    console.log(`📚 Swagger: http://localhost:${port}/docs`);
  }

  await app.listen(port);
  console.log(`🚀 SalonIQ API running on port ${port} [${nodeEnv}]`);
}

bootstrap();
