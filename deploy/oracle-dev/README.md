Oracle VM dev/test backend deploy

This stack is intentionally limited to:

caddy on public ports 80/443
backend on the internal Docker network only
postgres on the internal Docker network only

It does not include the frontend and it does not require Redis. For this temporary dev/test VM, SalonIQ can boot without REDIS_HOST; immediate notifications are processed inline instead of using BullMQ.

Why the old deploy model was fragile

The previous Oracle backend deploy depended on copying repo files to the VM by hand. That created three problems:

the VM filesystem could drift away from GitHub without a clear deployed commit
updates were easy to miss because deploy/oracle-dev/docker-compose.yml builds from the local repo checkout at ../../backend
repeated manual syncs made backend deploys depend on whoever last copied files to /opt/saloniq

The safer model is to keep /opt/saloniq as a normal git checkout and let GitHub Actions trigger a small remote deploy script over SSH.

Files used by the GitHub-based flow
deploy/oracle-dev/deploy-backend.sh
.github/workflows/oracle-backend-deploy.yml
deploy/oracle-dev/docker-compose.yml
deploy/oracle-dev/.env.example
What the deploy script does

deploy/oracle-dev/deploy-backend.sh runs on the Oracle VM and performs this sequence:

verifies that the server path is a clean git checkout
fetches from GitHub and fast-forwards the deploy branch
starts postgres if needed
rebuilds and restarts the backend container only
leaves the named postgres_data volume intact
verifies http://localhost:3001/api/v1/health from inside the backend container
optionally verifies the public HTTPS health endpoint

It does not recreate the VM, remove Docker volumes, or expose any new ports.

Expected server path

The GitHub Action expects a git checkout at:

/opt/saloniq

That path contains:

/opt/saloniq/backend
/opt/saloniq/deploy/oracle-dev

The workflow can clone the repo automatically if /opt/saloniq/.git does not exist yet, but the server still needs git access to GitHub.

If /opt/saloniq already exists and is still the old manually copied directory, the workflow stops with a clear error instead of cloning over it.

GitHub secrets required

Add these repository secrets before enabling the workflow:

ORACLE_HOST: public hostname or IP of the Oracle VM
ORACLE_USER: SSH user on the Oracle VM
ORACLE_SSH_KEY: private SSH key used by GitHub Actions to log in to the Oracle VM
ORACLE_KNOWN_HOSTS: known_hosts entry for the Oracle VM host key

Optional:

ORACLE_PORT: custom SSH port if you do not use 22

The workflow uses these fixed defaults:

deploy branch: main
server path: /opt/saloniq
git remote used on the VM: git@github.com:nema-lev/SalonIQ.git

If you want different values, edit .github/workflows/oracle-backend-deploy.yml.

One-time Oracle server preparation

Run these steps once on the Oracle VM.

1. Install required packages

The VM needs:

Docker Engine
docker compose or docker-compose
git
curl
2. Give the server read access to GitHub

Preferred for a private repo:

create a dedicated SSH keypair on the Oracle VM for GitHub read access
add the public key as a read-only deploy key in the GitHub repo
add GitHub to the server user's known_hosts

Example:

ssh-keygen -t ed25519 -f ~/.ssh/saloniq_github -C "oracle-vm-github-readonly"
ssh-keyscan github.com >> ~/.ssh/known_hosts

Then configure ~/.ssh/config so git can use that key:

Host github.com
HostName github.com
User git
IdentityFile ~/.ssh/saloniq_github
IdentitiesOnly yes

3. Prepare the deploy path

If this VM still has the old manually copied files, back up the existing deploy env first:

sudo mkdir -p /opt/saloniq-backups
sudo cp /opt/saloniq/deploy/oracle-dev/.env /opt/saloniq-backups/oracle-dev.env.$(date +%Y%m%d%H%M%S)

If the current /opt/saloniq directory is the old manual deploy directory, replace it with a clean git checkout during a short maintenance window:

ts=$(date +%Y%m%d%H%M%S)
docker stop saloniq-backend saloniq-caddy || true
mv /opt/saloniq "/opt/saloniq-manual-${ts}"
git clone git@github.com
:nema-lev/SalonIQ.git /opt/saloniq
cp "/opt/saloniq-manual-${ts}/deploy/oracle-dev/.env" /opt/saloniq/deploy/oracle-dev/.env

If /opt/saloniq does not exist yet, either let the GitHub Action clone it on first deploy or clone it manually:

git clone git@github.com
:nema-lev/SalonIQ.git /opt/saloniq
cd /opt/saloniq
git checkout main

4. Create the runtime env file

cd /opt/saloniq/deploy/oracle-dev
cp .env.example .env

Fill these values in .env:

BACKEND_HOST=saloniq.duckdns.org
APP_DOMAIN=saloniq.bg or the real SalonIQ tenant domain
FRONTEND_URL=https://<your-vercel-frontend-domain>
CORS_ORIGINS=https://<your-vercel-frontend-domain>,https://*.vercel.app
strong values for POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_API_KEY
optional DEFAULT_TENANT_SLUG only if you need a preview/dev fallback tenant
5. Keep or bootstrap the database safely

If the current VM already has the working Oracle dev/test stack and its postgres_data volume, do not delete it.

For a first-time bootstrap only:

cd /opt/saloniq/deploy/oracle-dev
docker-compose up -d postgres
docker-compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /opt/saloniq/backend/prisma/migrations/001_init.sql
docker-compose run --rm backend-tools npm run seed
docker-compose up -d backend caddy

npm run seed creates a fresh demo tenant (demo-business) and resets only that tenant's demo data.

This repo currently bootstraps the DB from backend/prisma/migrations/001_init.sql; it does not ship a standard Prisma migration directory for prisma migrate deploy.

GitHub Actions deploy behavior

The workflow in .github/workflows/oracle-backend-deploy.yml runs on:

pushes to main that touch backend/**
pushes to main that touch the Oracle backend deploy files
manual workflow_dispatch

During deploy it:

connects to the Oracle VM over SSH
clones the repo to /opt/saloniq if needed
runs deploy/oracle-dev/deploy-backend.sh
verifies the internal backend health endpoint
verifies the public HTTPS health endpoint
Manual validation commands on the VM

Run these checks on the VM:

cd /opt/saloniq/deploy/oracle-dev
docker-compose ps
docker-compose logs backend --tail=100
docker-compose exec -T backend curl -fsS http://localhost:3001/api/v1/health

curl -fsSI -H 'Host: saloniq.duckdns.org' http://127.0.0.1/api/v1/health

curl -fsS https://saloniq.duckdns.org/api/v1/health

Vercel frontend

Point the frontend to the public backend URL:

BACKEND_URL=https://saloniq.duckdns.org
INTERNAL_API_KEY=<same value as backend>

Keep the tenant-facing frontend domain variables aligned with your existing frontend setup:

NEXT_PUBLIC_APP_DOMAIN=<your SalonIQ app domain>
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=<optional preview fallback>
DEFAULT_TENANT_SLUG=<same optional preview fallback>
