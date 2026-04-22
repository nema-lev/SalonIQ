# Oracle VM dev/test backend deploy

This stack is intentionally limited to:

- `caddy` on public ports `80/443`
- `backend` on the internal Docker network only
- `postgres` on the internal Docker network only

It does **not** include the frontend and it does **not** require Redis. For this temporary dev/test VM, SalonIQ can boot without `REDIS_HOST`; immediate notifications are processed inline instead of using BullMQ.

## Prerequisites

- Docker Engine installed on the VM
- Docker Compose plugin installed on the VM
- `saloniq.duckdns.org` resolving to the VM public IP
- Ports `80/443` reachable from the internet

## Environment

```bash
cd /opt/saloniq/deploy/oracle-dev
cp .env.example .env
```

Fill these values in `.env`:

- `BACKEND_HOST=saloniq.duckdns.org`
- `APP_DOMAIN=saloniq.bg` or the real SalonIQ tenant domain
- `FRONTEND_URL=https://<your-vercel-frontend-domain>`
- `CORS_ORIGINS=https://<your-vercel-frontend-domain>,https://*.vercel.app`
- strong values for `POSTGRES_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `INTERNAL_API_KEY`
- optional `DEFAULT_TENANT_SLUG` only if you need a preview/dev fallback tenant

## Build and bootstrap

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose up -d postgres
docker compose run --rm backend-tools npx prisma migrate deploy
docker compose run --rm backend-tools npm run seed
docker compose up -d backend caddy
```

`npm run seed` creates a fresh demo tenant (`demo-business`) and resets only that tenant's demo data.

## Validation

Run these checks on the VM:

```bash
docker compose ps
docker compose logs backend --tail=100
curl -fsS http://localhost:3001/api/v1/health
curl -fsS https://saloniq.duckdns.org/api/v1/health
```

## Vercel frontend

Point the frontend to the public backend URL:

- `BACKEND_URL=https://saloniq.duckdns.org`
- `INTERNAL_API_KEY=<same value as backend>`

Keep the tenant-facing frontend domain variables aligned with your existing frontend setup:

- `NEXT_PUBLIC_APP_DOMAIN=<your SalonIQ app domain>`
- `NEXT_PUBLIC_DEFAULT_TENANT_SLUG=<optional preview fallback>`
- `DEFAULT_TENANT_SLUG=<same optional preview fallback>`
