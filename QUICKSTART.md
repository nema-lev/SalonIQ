# ⚡ SalonIQ — Бърз старт (5 минути локално)

## Изисквания
- Node.js 20+
- Docker + Docker Compose
- Git

---

## 1. Стартиране

```bash
# Клонирай проекта
git clone https://github.com/ТИ/saloniq.git
cd saloniq

# Копирай env файловете
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local

# Стартирай PostgreSQL и Redis
docker-compose up postgres redis -d

# Изчакай 5 секунди, после инициализирай базата
sleep 5
docker-compose exec postgres psql -U saloniq_user -d saloniq_db \
  -f /docker-entrypoint-initdb.d/001_init.sql

# Стартирай backend (в нов терминал)
cd backend
npm install
npx prisma generate
npm run start:dev

# Стартирай frontend (в друг терминал)
cd frontend
npm install
npm run dev
```

## 2. Seed тестови данни

```bash
# В трети терминал (след като backend е стартиран)
cd backend
node scripts/seed.js
```

## 3. Тест

Добавяй header `X-Tenant-Slug: salon-aurora` към заявките.

С браузър директно:
- **Booking**: http://localhost:3000 (добави `?tenant=salon-aurora` в URL)
- **Admin**: http://localhost:3000/admin
  - Email: `admin@salon-aurora.bg`
  - Парола: `admin123`
- **API Docs**: http://localhost:3001/docs

## 4. Telegram тест локално

За тест на Telegram без деплой:
```bash
# Инсталирай ngrok
npm install -g @ngrok/ngrok

# Expose backend локално
ngrok http 3001

# Задай webhook с ngrok URL
curl -X POST "https://api.telegram.org/botТВОЯ_TOKEN/setWebhook" \
  -d "url=https://ТВОЯ_NGROK.ngrok.io/api/v1/webhooks/telegram/salon-aurora"
```

После добави в `backend/.env`:
```env
# За тест tenant-а
# (Обикновено идва от базата данни на tenant ниво)
SYSTEM_TELEGRAM_BOT_TOKEN=ТВОЯ_BOT_TOKEN
```

---

## Структура на проекта

```
saloniq/
├── backend/              # NestJS API
│   ├── src/
│   │   ├── modules/
│   │   │   ├── appointments/   # Резервации
│   │   │   ├── auth/           # JWT login
│   │   │   ├── clients/        # CRM
│   │   │   ├── notifications/  # Telegram + SMS
│   │   │   ├── services/       # Услуги
│   │   │   ├── staff/          # Персонал
│   │   │   └── tenants/        # White-label config
│   │   └── common/
│   │       ├── guards/         # JWT + Tenant guards
│   │       ├── prisma/         # DB service
│   │       └── types/          # Enums
│   ├── prisma/
│   │   ├── schema.prisma       # Публична схема
│   │   └── migrations/001_init.sql  # Tenant schema function
│   └── scripts/seed.js         # Тестови данни
│
├── frontend/             # Next.js 14
│   └── src/
│       ├── app/
│       │   ├── page.tsx         # Публична booking страница
│       │   └── admin/           # Admin панел
│       ├── components/
│       │   ├── booking/         # 5-стъпков wizard
│       │   └── admin/           # Admin UI
│       └── lib/
│           ├── tenant-context   # White-label Provider
│           └── api-client       # Axios wrapper
│
├── docs/DEPLOY.md        # Пълно ръководство за деплой
├── ecosystem.config.js   # PM2 конфигурация
├── deploy.sh             # Автоматичен деплой
├── add-tenant.sh         # Добавяне на нов салон
└── nginx.conf            # Reverse proxy
```

---

## Добавяне на нов салон (3 минути)

```bash
# На Oracle VM
bash add-tenant.sh
```

Скриптът ще попита интерактивно за:
- Slug, наименование, тип бизнес
- Адрес, телефон
- Telegram Bot Token (от @BotFather)
- Email и парола за admin

После автоматично:
- Създава PostgreSQL схема
- Регистрира Telegram webhook
- Готово! 🎉

---

## Преминаване от Telegram към SMS

1. Регистрирай се на https://www.smsapi.bg
2. Вземи Bearer Token от профила
3. В Admin → Настройки → Известявания добави API Token и Sender ID
4. SMS се изпраща автоматично когато клиентът няма Telegram

Цени на smsapi.bg (приблизително): ~0.05-0.08 лв/SMS
