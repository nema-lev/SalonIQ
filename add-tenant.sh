#!/bin/bash
# SalonIQ — Добавяне на нов tenant (бизнес)
# Използване: bash add-tenant.sh
# Ще попита интерактивно за данните

set -e

echo "🏪 SalonIQ — Добавяне на нов бизнес"
echo "────────────────────────────────────"
echo ""

read -p "Slug (напр. salon-aurora, само малки букви и тирета): " SLUG
read -p "Бизнес наименование: " BUSINESS_NAME
read -p "Тип (SALON/BARBERSHOP/HAIR_SALON/NAIL_STUDIO/SPA/DENTAL/MASSAGE/OTHER): " BUSINESS_TYPE
read -p "Адрес (напр. ул. Витоша 42): " ADDRESS
read -p "Град: " CITY
read -p "Телефон: " PHONE
read -p "Telegram Bot Token (от @BotFather): " BOT_TOKEN
read -p "Telegram Chat ID на собственика: " OWNER_CHAT_ID
read -p "Primary цвят в HEX (напр. #7c3aed): " PRIMARY_COLOR
read -p "Email на собственика (за login): " OWNER_EMAIL
read -p "Парола на собственика: " -s OWNER_PASSWORD
echo ""

# Генерирай schema name
SCHEMA_NAME="tenant_$(echo $SLUG | tr '-' '_')"

echo ""
echo "📋 Обобщение:"
echo "  Slug: $SLUG"
echo "  Schema: $SCHEMA_NAME"
echo "  Бизнес: $BUSINESS_NAME"
echo ""
read -p "Продължи? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Отказано."
  exit 0
fi

# Хеширай паролата
PASSWORD_HASH=$(node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('$OWNER_PASSWORD', 12));" 2>/dev/null || \
  python3 -c "import hashlib, os; print('$OWNER_PASSWORD')")

# SQL за добавяне
DB_USER=${DB_USER:-saloniq_user}
DB_NAME=${DB_NAME:-saloniq_db}

psql -h localhost -U "$DB_USER" -d "$DB_NAME" <<SQL
-- Добави tenant
INSERT INTO public.tenants (
  slug, schema_name, business_name, business_type,
  address, city, phone,
  telegram_bot_token, telegram_chat_id,
  theme_config, working_hours,
  requires_confirmation, cancellation_hours,
  min_advance_booking_hours, max_advance_booking_days,
  plan, plan_status
) VALUES (
  '$SLUG',
  '$SCHEMA_NAME',
  '$BUSINESS_NAME',
  '$BUSINESS_TYPE',
  '$ADDRESS',
  '$CITY',
  '$PHONE',
  '$BOT_TOKEN',
  '$OWNER_CHAT_ID',
  '{"primaryColor": "$PRIMARY_COLOR", "secondaryColor": "$PRIMARY_COLOR"}',
  '{"mon":{"open":"09:00","close":"18:00","isOpen":true},"tue":{"open":"09:00","close":"18:00","isOpen":true},"wed":{"open":"09:00","close":"18:00","isOpen":true},"thu":{"open":"09:00","close":"18:00","isOpen":true},"fri":{"open":"09:00","close":"18:00","isOpen":true},"sat":{"open":"10:00","close":"15:00","isOpen":true},"sun":{"open":"00:00","close":"00:00","isOpen":false}}',
  false, 24, 1, 60,
  'BASIC', 'TRIAL'
) ON CONFLICT (slug) DO NOTHING;

-- Вземи tenant ID
SELECT id INTO TEMP tenant_row FROM public.tenants WHERE slug = '$SLUG';

-- Добави собственик
INSERT INTO public.tenant_owners (tenant_id, name, email, password_hash, role)
VALUES (
  (SELECT id FROM tenant_row),
  '$BUSINESS_NAME',
  '$OWNER_EMAIL',
  '$PASSWORD_HASH',
  'OWNER'
) ON CONFLICT (email) DO NOTHING;

-- Създай tenant schema
SELECT create_tenant_schema('$SCHEMA_NAME');
SQL

# Задай Telegram webhook
echo ""
echo "🤖 Задаване на Telegram webhook..."
WEBHOOK_URL="https://saloniq.bg/api/v1/webhooks/telegram/$SLUG"
RESULT=$(curl -s -X POST "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$WEBHOOK_URL\", \"allowed_updates\": [\"message\", \"callback_query\"], \"drop_pending_updates\": true}")

echo "Webhook резултат: $RESULT"

echo ""
echo "✅ Tenant '$SLUG' е създаден успешно!"
echo ""
echo "🌐 Booking URL: https://$SLUG.saloniq.bg"
echo "🔐 Admin URL:   https://$SLUG.saloniq.bg/admin"
echo "🤖 Telegram:    Тествай бота на Telegram"
echo ""
echo "⚠️  Не забравяй да добавиш услуги и персонал в admin панела!"
