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
    await this.ensureExistingTenantCalendarAllocations();
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
    await this.ensureWaitlistTable(schemaName);
    await this.ensureCalendarAllocationsTable(schemaName);

    this.schemaCache.set(schemaName, true);
    this.logger.log(`Tenant schema ${schemaName} created successfully`);
  }

  async ensurePlatformCompatibility(): Promise<void> {
    await this.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await this.$executeRawUnsafe(
      `ALTER TYPE public.business_type ADD VALUE IF NOT EXISTS 'GROUP_TRAINING'`,
    );
  }

  async ensureExistingTenantCalendarAllocations(): Promise<void> {
    const tenantSchemas = await this.$queryRawUnsafe<{ schema_name: string }[]>(
      `
      SELECT t.schema_name
      FROM public.tenants t
      JOIN information_schema.schemata s ON s.schema_name = t.schema_name
      ORDER BY t.schema_name ASC
      `,
    );

    for (const tenantSchema of tenantSchemas) {
      await this.ensureCalendarAllocationsTable(tenantSchema.schema_name);
    }

    this.logger.log(
      `Calendar allocation infrastructure ensured for ${tenantSchemas.length} existing tenant schema(s)`,
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
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".services ADD COLUMN IF NOT EXISTS color_mode VARCHAR(20) NOT NULL DEFAULT 'manual'`,
    );
  }

  async ensureWaitlistTable(schemaName: string): Promise<void> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    await this.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}".waitlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES "${schemaName}".clients(id),
        service_id UUID NOT NULL REFERENCES "${schemaName}".services(id),
        staff_id UUID REFERENCES "${schemaName}".staff(id),
        desired_date DATE,
        desired_from TIME,
        desired_to TIME,
        status VARCHAR(20) NOT NULL DEFAULT 'waiting',
        notified_at TIMESTAMPTZ,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".waitlist ADD COLUMN IF NOT EXISTS notes TEXT`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".waitlist ADD COLUMN IF NOT EXISTS last_notified_slot_start_at TIMESTAMPTZ`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".waitlist ADD COLUMN IF NOT EXISTS booked_appointment_id UUID REFERENCES "${schemaName}".appointments(id)`,
    );
    await this.$executeRawUnsafe(
      `ALTER TABLE "${schemaName}".waitlist ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
    );
  }

  async ensureCalendarAllocationsTable(schemaName: string): Promise<void> {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    const normalizedSchemaName = schemaName.replace('.', '_');

    await this.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await this.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "${schemaName}".calendar_allocations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type VARCHAR(40) NOT NULL,
        source_id UUID NOT NULL,
        resource_type VARCHAR(40) NOT NULL,
        resource_id UUID NOT NULL,
        status VARCHAR(20) NOT NULL,
        display_start_at TIMESTAMPTZ NOT NULL,
        display_end_at TIMESTAMPTZ NOT NULL,
        occupied_start_at TIMESTAMPTZ NOT NULL,
        occupied_end_at TIMESTAMPTZ NOT NULL,
        buffer_before_min INTEGER NOT NULL DEFAULT 0,
        buffer_after_min INTEGER NOT NULL DEFAULT 0,
        exclusive BOOLEAN NOT NULL DEFAULT true,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT calendar_allocations_display_interval_valid
          CHECK (display_start_at < display_end_at),
        CONSTRAINT calendar_allocations_occupied_interval_valid
          CHECK (occupied_start_at < occupied_end_at),
        CONSTRAINT calendar_allocations_buffers_non_negative
          CHECK (buffer_before_min >= 0 AND buffer_after_min >= 0)
      )`,
    );

    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${normalizedSchemaName}_calendar_allocations_resource"
       ON "${schemaName}".calendar_allocations(resource_type, resource_id)`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${normalizedSchemaName}_calendar_allocations_occupied_interval"
       ON "${schemaName}".calendar_allocations(occupied_start_at, occupied_end_at)`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${normalizedSchemaName}_calendar_allocations_source"
       ON "${schemaName}".calendar_allocations(source_type, source_id)`,
    );
    await this.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "idx_${normalizedSchemaName}_calendar_allocations_status"
       ON "${schemaName}".calendar_allocations(status)`,
    );
    await this.$executeRawUnsafe(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           WHERE n.nspname = '${schemaName}'
             AND t.relname = 'calendar_allocations'
             AND c.conname = 'calendar_allocations_no_active_exclusive_overlap'
         ) THEN
           ALTER TABLE "${schemaName}".calendar_allocations
           ADD CONSTRAINT calendar_allocations_no_active_exclusive_overlap
           EXCLUDE USING gist (
             resource_type WITH =,
             resource_id WITH =,
             tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&
           )
           WHERE (exclusive = true AND status IN ('booked', 'held', 'blocked'));
         END IF;
       END
       $$;`,
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
