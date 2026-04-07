# 🚀 SalonIQ — Ръководство за деплой

## Бърз избор

- За първи production тест използвай `docker-compose.prod.yml`
- Ползвай `docker-compose.yml` само за development
- PM2/Nginx стъпките по-долу остават валидни, ако искаш ръчен deploy на VM

## Съдържание
1. [Oracle Cloud VM настройка](#1-oracle-cloud-vm)
2. [PostgreSQL инсталация](#2-postgresql)
3. [Redis инсталация](#3-redis)
4. [Проекта на сървъра](#4-качване-на-проекта)
5. [Backend стартиране](#5-backend)
6. [Frontend стартиране](#6-frontend)
7. [Nginx reverse proxy](#7-nginx)
8. [Cloudflare DNS](#8-cloudflare-dns)
9. [Telegram Bot настройка](#9-telegram-bot)
10. [Създаване на първи tenant](#10-първи-tenant)
11. [Проверка и мониторинг](#11-мониторинг)

---

## 1. Oracle Cloud VM

### 1.1 Създай акаунт и VM
1. Отиди на https://cloud.oracle.com → **Start for free**
2. Попълни данните (кредитна карта се изисква, но НЕ се таксува)
3. В конзолата: **Compute → Instances → Create Instance**
4. Избери:
   - **Image:** Ubuntu 22.04
   - **Shape:** `VM.Standard.A1.Flex` (ARM Ampere)
   - **OCPUs:** 2, **Memory:** 12 GB (Always Free лимит е 4 OCPU / 24 GB total)
5. Генерирай SSH ключ → **Download private key** → запази го!
6. **Create**

### 1.2 Отвори портовете в Oracle Firewall
В конзолата: **Networking → Virtual Cloud Networks → Default VCN → Security Lists → Default Security List**

Добави **Ingress Rules**:
| Source | Protocol | Port | Описание |
|--------|----------|------|---------|
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |
| Твоят IP | TCP | 22 | SSH (само твоят IP!) |

### 1.3 Свържи се с VM-а
```bash
chmod 400 ~/Downloads/ssh-key.key
ssh -i ~/Downloads/ssh-key.key ubuntu@<PUBLIC_IP>
```

### 1.4 Основна настройка на сървъра
```bash
# Update
sudo apt update && sudo apt upgrade -y

# Необходими пакети
sudo apt install -y curl git nginx certbot python3-certbot-nginx ufw build-essential

# Firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# npm global dir (без sudo)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# PM2 (process manager)
npm install -g pm2

# Провери версиите
node --version    # v20.x.x
npm --version     # 10.x.x
pm2 --version
```

---

## 2. PostgreSQL

```bash
# Инсталация на PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-client-16

# Стартирай и enable при boot
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Създай потребител и база данни
sudo -u postgres psql <<EOF
CREATE USER saloniq_user WITH PASSWORD 'СИЛНА_ПАРОЛА_ТУК';
CREATE DATABASE saloniq_db OWNER saloniq_user;
GRANT ALL PRIVILEGES ON DATABASE saloniq_db TO saloniq_user;
\c saloniq_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
\q
EOF

# Тест
psql -h localhost -U saloniq_user -d saloniq_db -c "SELECT version();"
```

---

## 3. Redis

```bash
# Инсталация
sudo apt install -y redis-server

# Конфигурация (password)
sudo nano /etc/redis/redis.conf
# Намери: # requirepass foobared
# Промени на: requirepass СИЛНА_REDIS_ПАРОЛА

sudo systemctl restart redis
sudo systemctl enable redis

# Тест
redis-cli -a СИЛНА_REDIS_ПАРОЛА ping  # → PONG
```

---

## 4. Качване на проекта

### Вариант А: Git (препоръчан)
```bash
# На сървъра
cd /opt
sudo mkdir saloniq
sudo chown ubuntu:ubuntu saloniq
cd saloniq

git clone https://github.com/ТВОЯ_ORG/saloniq.git .
```

### Вариант Б: SCP от локалната машина
```bash
# От твоята машина
scp -i ~/Downloads/ssh-key.key -r ./saloniq ubuntu@<PUBLIC_IP>:/opt/saloniq
```

---

## 4.1 Production Docker вариант

```bash
cd /opt/saloniq
cp .env.production.example .env.production
nano .env.production

docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# Проверки
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://localhost:3000
curl http://localhost:3001/api/health
```

Този вариант е по-подходящ за първо качване, защото избягва разминаване между локална и сървърна среда.

---

## 5. Backend

```bash
cd /opt/saloniq/backend

# Инсталирай зависимостите
npm ci --only=production

# Конфигурационен файл
cp .env.example .env
nano .env
```

### Попълни .env файла:
```env
DATABASE_URL="postgresql://saloniq_user:СИЛНА_ПАРОЛА_ТУК@localhost:5432/saloniq_db?schema=public"
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=СИЛНА_REDIS_ПАРОЛА
JWT_SECRET=минимум_64_символа_случайна_низ
JWT_REFRESH_SECRET=друга_случайна_низ_64_символа
PORT=3001
NODE_ENV=production
APP_DOMAIN=saloniq.bg
FRONTEND_URL=https://saloniq.bg
CORS_ORIGINS=https://saloniq.bg,https://*.saloniq.bg
INTERNAL_API_KEY=случайна_низ_за_вътрешна_комуникация
```

> **Генерирай JWT тайни:** `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

```bash
# Prisma migrate (създава таблиците)
npx prisma generate
npx prisma migrate deploy

# Изпълни SQL функцията за tenant схеми
psql -h localhost -U saloniq_user -d saloniq_db \
  -f prisma/migrations/001_init.sql

# Build
npm run build

# Стартирай с PM2
pm2 start dist/main.js --name saloniq-backend \
  --max-memory-restart 500M \
  --restart-delay 3000

pm2 save
pm2 startup  # Следвай инструкцията за autostart

# Провери
pm2 logs saloniq-backend
curl http://localhost:3001/api/health
```

---

## 6. Frontend

```bash
cd /opt/saloniq/frontend

# Инсталирай зависимостите
npm ci

# Конфигурация
cp .env.local.example .env.local
nano .env.local
```

```env
NEXT_PUBLIC_APP_DOMAIN=saloniq.bg
BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=същата_от_backend
```

```bash
# Build
npm run build

# Стартирай с PM2
pm2 start npm --name saloniq-frontend -- start

pm2 save

# Провери
curl http://localhost:3000
```

---

## 7. Nginx

```bash
# Копирай конфигурацията
sudo cp /opt/saloniq/nginx.conf /etc/nginx/nginx.conf

# Провери syntax
sudo nginx -t

# Рестартирай
sudo systemctl restart nginx
sudo systemctl enable nginx
```

---

## 8. Cloudflare DNS

1. Добави домейна в Cloudflare
2. Промени nameservers при регистратора си
3. В Cloudflare DNS:

| Тип | Имe | Стойност | Proxy |
|-----|-----|---------|-------|
| A | `saloniq.bg` | `<ORACLE_VM_IP>` | ✅ Proxied |
| A | `*.saloniq.bg` | `<ORACLE_VM_IP>` | ✅ Proxied |

4. SSL/TLS настройки → **Full (strict)** — ако имаш сертификат на сървъра, иначе **Full**
5. В **Rules → Page Rules**: `*.saloniq.bg/*` → Always Use HTTPS

> **Wildcard запис `*.saloniq.bg`** е ключов! Позволява всеки `slug.saloniq.bg` да работи автоматично.

---

## 9. Telegram Bot

### За всеки нов салон/клиент:

1. Отиди в Telegram → намери **@BotFather**
2. Напиши `/newbot`
3. Избери:
   - Публично ime: `Салон Аврора`
   - Username: `salon_aurora_bg_bot`
4. Получаваш **Bot Token**: `7123456789:AAxxxxxx...`
5. Запази го — ще го въведеш при създаване на tenant

### Задай webhook:
```bash
# Замени ТВОЯ_BOT_TOKEN и SLUG на салона
curl -X POST "https://api.telegram.org/botТВОЯ_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://saloniq.bg/api/v1/webhooks/telegram/SLUG_НА_САЛОНА",
    "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true
  }'

# Трябва да получиш: {"ok":true,"result":true}
```

### Chat ID на собственика:
1. Собственикът пише `/start` на бота
2. Вземи chat_id:
```bash
curl "https://api.telegram.org/botТВОЯ_BOT_TOKEN/getUpdates" | python3 -m json.tool
# Търси: "chat": {"id": 123456789}
```

---

## 10. Първи Tenant

```bash
# Влез в psql
psql -h localhost -U saloniq_user -d saloniq_db

# Създай tenant
INSERT INTO public.tenants (
  slug, schema_name, business_name, business_type,
  description, address, city, phone,
  telegram_bot_token, telegram_chat_id,
  theme_config, working_hours,
  requires_confirmation, cancellation_hours,
  min_advance_booking_hours, max_advance_booking_days,
  plan, plan_status
) VALUES (
  'salon-aurora',
  'tenant_salon_aurora',
  'Салон Аврора',
  'SALON',
  'Вашият любим салон за красота в София',
  'ул. Витоша 42',
  'София',
  '+359 888 123 456',
  '7123456789:AAxxxxx...', -- Bot Token
  '123456789',             -- Chat ID на собственика
  '{"primaryColor": "#7c3aed", "secondaryColor": "#a855f7"}',
  '{
    "mon": {"open": "09:00", "close": "18:00", "isOpen": true},
    "tue": {"open": "09:00", "close": "18:00", "isOpen": true},
    "wed": {"open": "09:00", "close": "18:00", "isOpen": true},
    "thu": {"open": "10:00", "close": "19:00", "isOpen": true},
    "fri": {"open": "09:00", "close": "17:00", "isOpen": true},
    "sat": {"open": "10:00", "close": "15:00", "isOpen": true},
    "sun": {"open": "00:00", "close": "00:00", "isOpen": false}
  }',
  false, 24, 1, 60,
  'BASIC', 'TRIAL'
);

# Вземи tenant ID
SELECT id FROM public.tenants WHERE slug = 'salon-aurora';
```

```bash
# Създай schema за tenant-а
psql -h localhost -U saloniq_user -d saloniq_db \
  -c "SELECT create_tenant_schema('tenant_salon_aurora');"
```

```bash
# Добави услуги
psql -h localhost -U saloniq_user -d saloniq_db <<EOF
SET search_path TO tenant_salon_aurora, public;

INSERT INTO services (name, category, duration_minutes, price, color) VALUES
  ('Подстригване', 'Коса', 30, 25, '#8b5cf6'),
  ('Боядисване', 'Коса', 120, 85, '#7c3aed'),
  ('Маникюр', 'Нокти', 60, 30, '#ec4899'),
  ('Педикюр', 'Нокти', 75, 35, '#f43f5e');

INSERT INTO staff (name, role, color, working_hours) VALUES
  ('Елена Петрова', 'owner', '#7c3aed', '{
    "mon": {"open": "09:00", "close": "18:00", "isOpen": true},
    "tue": {"open": "09:00", "close": "18:00", "isOpen": true},
    "wed": {"open": "09:00", "close": "18:00", "isOpen": true},
    "thu": {"open": "10:00", "close": "19:00", "isOpen": true},
    "fri": {"open": "09:00", "close": "17:00", "isOpen": true},
    "sat": {"open": "10:00", "close": "15:00", "isOpen": true},
    "sun": {"open": "00:00", "close": "00:00", "isOpen": false}
  }');

-- Свържи услугите с персонала (вземи IDs)
UPDATE services SET staff_ids = ARRAY(SELECT id FROM staff);
\q
EOF
```

---

## 11. Мониторинг

```bash
# PM2 статус
pm2 status
pm2 logs --lines 50

# Nginx грешки
sudo tail -f /var/log/nginx/error.log

# PostgreSQL
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Провери дали сайтът работи
curl -I https://salon-aurora.saloniq.bg

# Провери Telegram webhook
curl "https://api.telegram.org/botТВОЯ_BOT_TOKEN/getWebhookInfo"
```

### PM2 полезни команди:
```bash
pm2 restart all          # Рестартирай всичко
pm2 reload all           # Zero-downtime reload
pm2 monit                # Реално-временен мониторинг
pm2 logs saloniq-backend # Логове на backend
```

---

## 🎉 Резултат

След успешен деплой:
- `https://salon-aurora.saloniq.bg` — Публична booking страница
- `https://salon-aurora.saloniq.bg/admin` — Admin панел
- Telegram Bot активен и приема callback-и
- Клиентите могат да записват часове и получават потвърждения

---

## Добавяне на нов салон (White-Label)

Нужни само 3 стъпки:
1. Създай Telegram Bot (@BotFather)
2. Добави tenant в базата данни (горния SQL шаблон)
3. Задай webhook за бота

**CSRF промяна само в CSS/DB** — кода на приложението не се пипа!
