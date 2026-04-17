# SalonIQ — White-Label Booking Platform

Multi-tenant SaaS платформа за онлайн резервации за салони, бръснарници, зъболекари и други услуги. Всеки бизнес получава напълно брандирано приложение.

## Архитектура

```
saloniq/
├── backend/          # NestJS API сървър
├── frontend/         # Next.js 14 (публична booking страница + admin)
├── telegram-bot/     # Telegram Bot за известявания (тест фаза)
└── shared/           # Споделени типове
```

## Стек

| Layer | Технология |
|-------|-----------|
| Backend | NestJS + TypeScript + Prisma |
| Database | PostgreSQL (multi-schema per tenant) |
| Frontend | Next.js 14 + Tailwind CSS + shadcn/ui |
| Queue | BullMQ + Redis |
| Notifications | Telegram Bot API → SMS (smsapi.bg) |
| Hosting | Oracle Cloud Always Free + Cloudflare |

## Бърз старт

```bash
# 1. Backend
cd backend && npm install
cp .env.example .env   # Попълни променливите
npx prisma migrate dev
npm run start:dev

# 2. Frontend
cd frontend && npm install
cp .env.local.example .env.local
npm run dev

# 3. Telegram Bot
cd telegram-bot && npm install
cp .env.example .env
npm run start:dev
```

## Tenant resolution за localhost и preview deploy

Платформата пази бъдещия multi-tenant модел:
- custom domain има приоритет
- after that known subdomain under `APP_DOMAIN`
- fallback за dev/preview е explicit tenant slug от env

За локален dev:

```env
# backend/.env
APP_DOMAIN=saloniq.bg
INTERNAL_API_KEY=same_as_frontend
DEFAULT_TENANT_SLUG=demo-business

# frontend/.env.local
BACKEND_URL=http://localhost:3001
INTERNAL_API_KEY=same_as_frontend
NEXT_PUBLIC_APP_DOMAIN=saloniq.bg
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=demo-business
DEFAULT_TENANT_SLUG=demo-business
```

За Vercel preview deploy:

```env
# Frontend project env
BACKEND_URL=https://your-backend-preview-or-shared-url
INTERNAL_API_KEY=same_as_backend
NEXT_PUBLIC_APP_DOMAIN=saloniq.bg
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=demo-business
DEFAULT_TENANT_SLUG=demo-business

# Backend env
APP_DOMAIN=saloniq.bg
INTERNAL_API_KEY=same_as_frontend
DEFAULT_TENANT_SLUG=demo-business
```

За production custom domains по-късно:
- оставяш `APP_DOMAIN`
- записваш `custom_domain` или ползваш реален subdomain
- fallback env slug вече не е нужен за нормален tenant routing

## White-label конфигурация

Всеки tenant се конфигурира в базата данни. Минимална конфигурация:
- `businessName`, `primaryColor`, `logo`
- `telegramBotToken` (или SMS credentials)
- `services[]`, `staff[]`, работно време

## Деплой (Oracle Cloud)

Виж `docs/DEPLOY.md` за пълни инструкции.
