-- SalonIQ: Функция за създаване на tenant схема
-- Извиква се при регистрация на нов бизнес
-- Всеки tenant получава пълно копие на таблиците в своя схема

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_type') THEN
    CREATE TYPE public.business_type AS ENUM (
      'SALON',
      'BARBERSHOP',
      'HAIR_SALON',
      'NAIL_STUDIO',
      'SPA',
      'DENTAL',
      'MASSAGE',
      'BEAUTY',
      'GROUP_TRAINING',
      'OTHER'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan') THEN
    CREATE TYPE public.subscription_plan AS ENUM ('BASIC', 'PRO', 'ENTERPRISE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_status') THEN
    CREATE TYPE public.plan_status AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'owner_role') THEN
    CREATE TYPE public.owner_role AS ENUM ('OWNER', 'ADMIN');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.tenants (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      VARCHAR(255) NOT NULL UNIQUE,
  custom_domain             VARCHAR(255) UNIQUE,
  schema_name               VARCHAR(255) NOT NULL UNIQUE,
  business_name             VARCHAR(255) NOT NULL,
  business_type             public.business_type NOT NULL DEFAULT 'SALON',
  description               TEXT,
  address                   TEXT,
  city                      VARCHAR(255),
  phone                     VARCHAR(50),
  email                     VARCHAR(255),
  website                   TEXT,
  google_maps_url           TEXT,
  working_hours             JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan                      public.subscription_plan NOT NULL DEFAULT 'BASIC',
  plan_status               public.plan_status NOT NULL DEFAULT 'TRIAL',
  trial_ends_at             TIMESTAMPTZ,
  plan_renews_at            TIMESTAMPTZ,
  telegram_bot_token        TEXT,
  telegram_chat_id          TEXT,
  sms_api_key               TEXT,
  sms_sender_id             TEXT,
  viber_bot_token           TEXT,
  email_from                TEXT,
  theme_config              JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_confirmation     BOOLEAN NOT NULL DEFAULT false,
  cancellation_hours        INTEGER NOT NULL DEFAULT 24,
  reminder_hours            INTEGER[] NOT NULL DEFAULT ARRAY[24, 2],
  max_advance_booking_days  INTEGER NOT NULL DEFAULT 60,
  min_advance_booking_hours INTEGER NOT NULL DEFAULT 1,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active                 BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.tenant_owners (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          public.owner_role NOT NULL DEFAULT 'OWNER',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION create_tenant_schema(schema_name TEXT)
RETURNS VOID AS $$
BEGIN
  -- Създай схемата
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', schema_name);

  -- ─── STAFF ───────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.staff (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name            VARCHAR(255) NOT NULL,
      email           VARCHAR(255),
      phone           VARCHAR(50),
      role            VARCHAR(50) NOT NULL DEFAULT ''employee'',
      avatar_url      TEXT,
      bio             TEXT,
      specialties     TEXT[] DEFAULT ''{}'',
      color           VARCHAR(7) DEFAULT ''#6366f1'',
      is_active       BOOLEAN NOT NULL DEFAULT true,
      accepts_online  BOOLEAN NOT NULL DEFAULT true,
      -- Работно време: { "mon": {"open": "09:00", "close": "18:00", "isOpen": true}, ... }
      working_hours   JSONB NOT NULL DEFAULT ''{}'',
      -- Бонуси и статистики
      commission_pct  DECIMAL(5,2) DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name);

  -- ─── SERVICES ─────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.services (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name                  VARCHAR(255) NOT NULL,
      description           TEXT,
      category              VARCHAR(100),
      duration_minutes      INTEGER NOT NULL DEFAULT 60,
      price                 DECIMAL(10,2),
      currency              VARCHAR(3) DEFAULT ''BGN'',
      color                 VARCHAR(7) DEFAULT ''#8b5cf6'',
      -- Кои служители предлагат тази услуга (array от staff.id)
      staff_ids             UUID[] DEFAULT ''{}'',
      -- Буферно време около часа
      buffer_before_min     INTEGER DEFAULT 0,
      buffer_after_min      INTEGER DEFAULT 0,
      -- Видимост
      is_public             BOOLEAN NOT NULL DEFAULT true,
      requires_confirmation BOOLEAN NOT NULL DEFAULT false,
      max_daily_bookings    INTEGER,
      booking_mode          VARCHAR(20) NOT NULL DEFAULT ''standard'',
      slot_capacity         INTEGER NOT NULL DEFAULT 1,
      group_days            TEXT[] NOT NULL DEFAULT ''{}'',
      group_time_slots      TEXT[] NOT NULL DEFAULT ''{}'',
      -- Сортиране
      display_order         INTEGER DEFAULT 0,
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name);

  -- ─── CLIENTS ──────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.clients (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name            VARCHAR(255) NOT NULL,
      phone           VARCHAR(50) NOT NULL,
      email           VARCHAR(255),
      -- Известявания
      telegram_chat_id VARCHAR(100),
      viber_id        VARCHAR(100),
      preferred_channel VARCHAR(20) DEFAULT ''telegram'',
      -- Профил
      birthday        DATE,
      gender          VARCHAR(20),
      avatar_url      TEXT,
      notes           TEXT,
      -- Разширен профил (JSON): алергии, предпочитания, зъбна карта и т.н.
      profile_data    JSONB DEFAULT ''{}'',
      -- Статистики (обновяват се при всяка резервация)
      no_show_count   INTEGER NOT NULL DEFAULT 0,
      total_visits    INTEGER NOT NULL DEFAULT 0,
      total_spent     DECIMAL(10,2) NOT NULL DEFAULT 0,
      is_blocked      BOOLEAN NOT NULL DEFAULT false,
      block_reason    TEXT,
      -- GDPR
      notifications_consent BOOLEAN NOT NULL DEFAULT false,
      marketing_consent     BOOLEAN NOT NULL DEFAULT false,
      consent_given_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_visit_at   TIMESTAMPTZ
    )', schema_name);

  -- Индекс за търсене по телефон (основен идентификатор)
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_clients_phone
    ON %I.clients USING btree(phone)', 
    replace(schema_name, '.', '_'), schema_name);

  -- Full-text search по име
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_clients_name_trgm
    ON %I.clients USING gin(name gin_trgm_ops)',
    replace(schema_name, '.', '_'), schema_name);

  -- ─── APPOINTMENTS ─────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.appointments (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id             UUID NOT NULL REFERENCES %I.clients(id),
      staff_id              UUID NOT NULL REFERENCES %I.staff(id),
      service_id            UUID NOT NULL REFERENCES %I.services(id),
      
      -- Времева рамка
      start_at              TIMESTAMPTZ NOT NULL,
      end_at                TIMESTAMPTZ NOT NULL,
      
      -- Статус
      status                VARCHAR(30) NOT NULL DEFAULT ''pending'',
      -- pending | confirmed | completed | cancelled | no_show
      
      -- Кой е направил резервацията
      booked_by             VARCHAR(20) NOT NULL DEFAULT ''client'',
      -- client | staff | owner
      
      -- Цена (може да се различава от услугата)
      price                 DECIMAL(10,2),
      currency              VARCHAR(3) DEFAULT ''BGN'',
      payment_status        VARCHAR(20) DEFAULT ''unpaid'',
      
      -- Потвърждения
      confirmation_sent_at  TIMESTAMPTZ,
      reminder_24h_sent_at  TIMESTAMPTZ,
      reminder_2h_sent_at   TIMESTAMPTZ,
      client_confirmed      BOOLEAN DEFAULT false,
      client_confirmed_at   TIMESTAMPTZ,
      
      -- Отмяна
      cancellation_reason   TEXT,
      cancelled_by          VARCHAR(20),
      cancelled_at          TIMESTAMPTZ,
      
      -- Бележки
      client_notes          TEXT,  -- Видими за клиента
      internal_notes        TEXT,  -- Само за персонала
      
      -- Intake form данни (JSON)
      intake_data           JSONB DEFAULT ''{}'',
      
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name, schema_name, schema_name, schema_name);

  -- Индекс за бързо намиране на резервации по дата
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_appointments_start
    ON %I.appointments(start_at)',
    replace(schema_name, '.', '_'), schema_name);

  -- Индекс за проверка на заетост на служител
  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_appointments_staff_time
    ON %I.appointments(staff_id, start_at, end_at)
    WHERE status NOT IN (''cancelled'', ''no_show'')',
    replace(schema_name, '.', '_'), schema_name);

  -- ─── CALENDAR ALLOCATIONS ────────────────────────────
  -- Авторитетни заети интервали за scheduling ресурси.
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.calendar_allocations (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type        VARCHAR(40) NOT NULL,
      source_id          UUID NOT NULL,
      resource_type      VARCHAR(40) NOT NULL,
      resource_id        UUID NOT NULL,
      status             VARCHAR(20) NOT NULL,
      display_start_at   TIMESTAMPTZ NOT NULL,
      display_end_at     TIMESTAMPTZ NOT NULL,
      occupied_start_at  TIMESTAMPTZ NOT NULL,
      occupied_end_at    TIMESTAMPTZ NOT NULL,
      buffer_before_min  INTEGER NOT NULL DEFAULT 0,
      buffer_after_min   INTEGER NOT NULL DEFAULT 0,
      exclusive          BOOLEAN NOT NULL DEFAULT true,
      metadata           JSONB NOT NULL DEFAULT ''{}''::jsonb,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT calendar_allocations_display_interval_valid
        CHECK (display_start_at < display_end_at),
      CONSTRAINT calendar_allocations_occupied_interval_valid
        CHECK (occupied_start_at < occupied_end_at),
      CONSTRAINT calendar_allocations_buffers_non_negative
        CHECK (buffer_before_min >= 0 AND buffer_after_min >= 0)
    )', schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_calendar_allocations_resource
    ON %I.calendar_allocations(resource_type, resource_id)',
    replace(schema_name, '.', '_'), schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_calendar_allocations_occupied_interval
    ON %I.calendar_allocations(occupied_start_at, occupied_end_at)',
    replace(schema_name, '.', '_'), schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_calendar_allocations_source
    ON %I.calendar_allocations(source_type, source_id)',
    replace(schema_name, '.', '_'), schema_name);

  EXECUTE format('
    CREATE INDEX IF NOT EXISTS idx_%s_calendar_allocations_status
    ON %I.calendar_allocations(status)',
    replace(schema_name, '.', '_'), schema_name);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = schema_name
      AND t.relname = 'calendar_allocations'
      AND c.conname = 'calendar_allocations_no_active_exclusive_overlap'
  ) THEN
    EXECUTE format('
      ALTER TABLE %I.calendar_allocations
      ADD CONSTRAINT calendar_allocations_no_active_exclusive_overlap
      EXCLUDE USING gist (
        resource_type WITH =,
        resource_id WITH =,
        tstzrange(occupied_start_at, occupied_end_at, ''[)'') WITH &&
      )
      WHERE (exclusive = true AND status IN (''booked'', ''held'', ''blocked''))',
      schema_name);
  END IF;

  -- ─── STAFF EXCEPTIONS ─────────────────────────────────
  -- Отпуски, болнични, блокирани часове
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.staff_exceptions (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id    UUID NOT NULL REFERENCES %I.staff(id),
      type        VARCHAR(30) NOT NULL,
      -- vacation | sick | blocked | partial_day
      start_at    TIMESTAMPTZ NOT NULL,
      end_at      TIMESTAMPTZ NOT NULL,
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name, schema_name, schema_name);

  -- ─── NOTIFICATIONS LOG ────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.notifications_log (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      appointment_id    UUID REFERENCES %I.appointments(id),
      client_id         UUID REFERENCES %I.clients(id),
      channel           VARCHAR(20) NOT NULL,
      -- telegram | sms | email | viber
      type              VARCHAR(50) NOT NULL,
      -- booking_confirmed | reminder_24h | reminder_2h | booking_cancelled | etc.
      status            VARCHAR(20) NOT NULL DEFAULT ''pending'',
      -- pending | sent | delivered | failed | read
      message_content   TEXT,
      external_id       TEXT,  -- Telegram message_id / SMS id
      error_message     TEXT,
      sent_at           TIMESTAMPTZ,
      delivered_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name, schema_name, schema_name, schema_name);

  -- ─── WAITLIST ─────────────────────────────────────────
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.waitlist (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id     UUID NOT NULL REFERENCES %I.clients(id),
      service_id    UUID NOT NULL REFERENCES %I.services(id),
      staff_id      UUID REFERENCES %I.staff(id),
      -- Желан диапазон
      desired_date  DATE,
      desired_from  TIME,
      desired_to    TIME,
      status        VARCHAR(20) NOT NULL DEFAULT ''waiting'',
      notified_at   TIMESTAMPTZ,
      expires_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )', schema_name, schema_name, schema_name, schema_name);

  RAISE NOTICE 'Tenant schema % created successfully', schema_name;
END;
$$ LANGUAGE plpgsql;


-- ─── TRIGGER: updated_at ──────────────────────────────────────────────────────
-- Функция за автоматично обновяване на updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── ПУБЛИЧНА СХЕМА: Основни таблици ─────────────────────────────────────────

-- Индекс за бързо намиране на tenant по домейн
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON public.tenants(custom_domain) WHERE custom_domain IS NOT NULL;
