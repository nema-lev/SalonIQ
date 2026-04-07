# 🏃 Бърз старт — локална разработка

## Предварителни изисквания

- Node.js 20+
- Docker Desktop (за PostgreSQL + Redis)
- Git

---

## 1. Клонирай и стартирай

```bash
git clone https://github.com/YOUR/saloniq.git
cd saloniq

# Стартирай PostgreSQL + Redis
docker-compose up postgres redis -d

# Изчакай 5 секунди за инициализация
sleep 5
```

## 2. Backend

```bash
cd backend
cp .env.example .env
# .env вече съдържа dev настройки — не е нужно да правиш промени локално

npm install
npx prisma generate

# Изпълни SQL функцията за tenant схеми
docker exec -i saloniq-postgres psql -U saloniq_user -d saloniq_db \
  < prisma/migrations/001_init.sql

# Seed с тестови данни
npx ts-node -r tsconfig-paths/register prisma/seed.ts

# Стартирай backend
npm run start:dev
# → http://localhost:3001
# → http://localhost:3001/docs (Swagger)
```

## 3. Frontend

```bash
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
# → http://localhost:3000
```

## 4. Hosts файл (за multi-tenant тест локално)

```bash
# macOS / Linux
sudo nano /etc/hosts

# Добави:
127.0.0.1 salon-aurora.localhost

# Windows: C:\Windows\System32\drivers\etc\hosts
```

След това:
- **Booking страница:** http://salon-aurora.localhost:3000
- **Admin панел:** http://salon-aurora.localhost:3000/admin
- **Email:** owner@salon-aurora.bg
- **Парола:** demo123

## 5. Telegram тест (по избор)

За да тестваш Telegram известявания локално:

```bash
# Инсталирай ngrok
brew install ngrok  # macOS
# или от https://ngrok.com

# Expose backend локално
ngrok http 3001

# Вземи HTTPS URL (напр. https://abc123.ngrok.io)
# Задай webhook:
curl -X POST "https://api.telegram.org/bot<ТВОЯТ_BOT_TOKEN>/setWebhook" \
  -d "url=https://abc123.ngrok.io/api/v1/webhooks/telegram/salon-aurora"

# Добави bot token в базата:
docker exec -i saloniq-postgres psql -U saloniq_user -d saloniq_db \
  -c "UPDATE public.tenants SET telegram_bot_token = '<TOKEN>', telegram_chat_id = '<YOUR_CHAT_ID>' WHERE slug = 'salon-aurora';"
```

## Полезни команди

```bash
# Prisma Studio (GUI за базата)
cd backend && npx prisma studio

# Провери опашката (BullMQ)
# Инсталирай bull-board: npm i @bull-board/express
# или гледай Redis директно:
docker exec -it saloniq-redis redis-cli KEYS "*"

# Логове на Docker
docker-compose logs -f postgres
docker-compose logs -f redis

# Reset на базата (изтрива всичко!)
docker-compose down -v
docker-compose up postgres redis -d
```

## Структура на API заявките локално

Всяка заявка трябва да съдържа `X-Tenant-Slug` header:
```
X-Tenant-Slug: salon-aurora
```

Браузърът го добавя автоматично (от hostname).
За Postman/curl добавяй ръчно.

```bash
# Пример: свободни слотове
curl "http://localhost:3001/api/v1/appointments/slots?serviceId=UUID&staffId=UUID&date=2025-04-15" \
  -H "X-Tenant-Slug: salon-aurora"
```
