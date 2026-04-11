import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

/**
 * TenantPrismaService — управлява динамичното превключване на схеми.
 *
 * Всеки tenant има собствена PostgreSQL схема (tenant_{slug}).
 * При всяка заявка се задава search_path на правилната схема,
 * след което се изпълняват SQL заявките.
 *
 * Използва connection pooling за да не се отварят нови connections при всяка заявка.
 */
@Injectable()
export class TenantPrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantPrismaService.name);
  private readonly schemaCache = new Map<string, boolean>();

  constructor(private readonly configService: ConfigService) {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
      datasources: {
        db: {
          url: configService.getOrThrow<string>('DATABASE_URL'),
        },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.ensurePlatformCompatibility();
    this.logger.log('Prisma connected to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Изпълнява заявка в контекста на конкретен tenant.
   * Задава search_path за да насочи Prisma към правилната схема.
   */
  async withTenantSchema<T>(schemaName: string, fn: (client: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // Задаваме search_path за текущата транзакция
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      return fn(tx as unknown as PrismaClient);
    });
  }

  /**
   * За raw SQL заявки директно в tenant схема
   */
  async queryInSchema<T = unknown>(schemaName: string, query: string, params: unknown[] = []): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}", public`);
      const result = await tx.$queryRawUnsafe<T>(query, ...params);
      return result;
    });
  }

  /**
   * Проверява дали tenant схемата съществува
   */
  async schemaExists(schemaName: string): Promise<boolean> {
    if (this.schemaCache.has(schemaName)) {
      return this.schemaCache.get(schemaName)!;
    }

    const result = await this.$queryRaw<[{ exists: boolean }]>`
      SELECT EXISTS(
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = ${schemaName}
      ) as exists
    `;

    const exists = result[0].exists;
    if (exists) {
      this.schemaCache.set(schemaName, true);
    }
    return exists;
  }

  /**
   * Създава нова tenant схема с всички таблици.
   * Извиква се при регистрация на нов бизнес.
   */
  async createTenantSchema(schemaName: string): Promise<void> {
    this.logger.log(`Creating tenant schema: ${schemaName}`);

    // Изпълняваме SQL функцията от migration файла
    await this.$executeRawUnsafe(`SELECT create_tenant_schema('${schemaName}')`);
    await this.ensureServiceGroupColumns(schemaName);

    this.schemaCache.set(schemaName, true);
    this.logger.log(`Tenant schema ${schemaName} created successfully`);
  }

  async ensurePlatformCompatibility(): Promise<void> {
    await this.$executeRawUnsafe(
      `ALTER TYPE public.business_type ADD VALUE IF NOT EXISTS 'GROUP_TRAINING'`,
    );
  }

  async ensureServiceGroupColumns(schemaName: string): Promise<void> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".services ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20) NOT NULL DEFAULT 'standard'`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".services ADD COLUMN IF NOT EXISTS slot_capacity INTEGER NOT NULL DEFAULT 1`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".services ADD COLUMN IF NOT EXISTS group_days TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".services ADD COLUMN IF NOT EXISTS group_time_slots TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`,
    );
  }

  /**
   * Изчиства кеша на схемите (при нужда от refresh)
   */
  clearSchemaCache(schemaName?: string) {
    if (schemaName) {
      this.schemaCache.delete(schemaName);
    } else {
      this.schemaCache.clear();
    }
  }
}
