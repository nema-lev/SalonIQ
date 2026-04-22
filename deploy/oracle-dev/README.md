Oracle VM dev/test backend deploy

This stack is intentionally limited to:

caddy on public ports 80/443
backend on the internal Docker network only
postgres on the internal Docker network only

It does not include the frontend and it does not require Redis. For this temporary dev/test VM, SalonIQ can boot without `REDIS_HOST`; immediate notifications are processed inline instead of using BullMQ.

Compose runtime requirement

Oracle backend deploy now requires Docker Compose v2 through `docker compose`.

The deploy and ops scripts in this directory are v2-first on purpose:

deploy/oracle-dev/deploy-backend.sh
deploy/oracle-dev/backup-db.sh
deploy/oracle-dev/restore-db.sh

Legacy `docker-compose` v1 is intentionally no longer used by the backend deploy flow. The old v1 recreate path was the source of repeated backend deploy failures tied to `KeyError: 'ContainerConfig'`.

Why the GitHub-based deploy model is safer

The previous Oracle backend deploy depended on copying repo files to the VM by hand. That created three problems:

the VM filesystem could drift away from GitHub without a clear deployed commit
updates were easy to miss because deploy/oracle-dev/docker-compose.yml builds from the local repo checkout at ../../backend
repeated manual syncs made backend deploys depend on whoever last copied files to /opt/saloniq

The safer model is to keep `/opt/saloniq` as a normal git checkout and let GitHub Actions trigger a small remote deploy script over SSH.

Files used by the GitHub-based flow

deploy/oracle-dev/deploy-backend.sh
.github/workflows/oracle-backend-deploy.yml
deploy/oracle-dev/docker-compose.yml
deploy/oracle-dev/.env.example

What the deploy script does

`deploy/oracle-dev/deploy-backend.sh` runs on the Oracle VM and performs this sequence:

verifies that the server path is a clean git checkout
fetches from GitHub and fast-forwards the deploy branch
requires `docker compose`
starts postgres if needed
rebuilds and recreates the backend container with `docker compose up -d --build --no-deps backend`
leaves the named `postgres_data` volume intact
verifies `http://localhost:3001/api/v1/health` from inside the backend container
optionally verifies the public HTTPS health endpoint

It does not recreate the VM, remove Docker volumes, or expose any new ports.

Expected server path

The GitHub Action expects a git checkout at:

/opt/saloniq

That path contains:

/opt/saloniq/backend
/opt/saloniq/deploy/oracle-dev

The workflow can clone the repo automatically if `/opt/saloniq/.git` does not exist yet, but the server still needs git access to GitHub.

If `/opt/saloniq` already exists and is still the old manually copied directory, the workflow stops with a clear error instead of cloning over it.

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
git remote used on the VM: `git@github.com:nema-lev/SalonIQ.git`

If you want different values, edit `.github/workflows/oracle-backend-deploy.yml`.

One-time Oracle server preparation

Run these steps once on the Oracle VM.

1. Install the required runtime

The VM needs:

Docker Engine
Docker Compose v2 plugin
git
curl

If the VM already has Docker Engine but not the Compose plugin, install the plugin from Docker's Ubuntu repository:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
```

If `docker-compose` v1 was installed from apt, remove it after the plugin is installed:

```bash
sudo apt-get remove -y docker-compose
```

If `docker-compose` v1 was installed as a standalone binary, remove only that binary:

```bash
sudo rm -f /usr/local/bin/docker-compose
```

Verify that the VM is on Compose v2 before continuing:

```bash
docker compose version
```

2. Give the server read access to GitHub

Preferred for a private repo:

create a dedicated SSH keypair on the Oracle VM for GitHub read access
add the public key as a read-only deploy key in the GitHub repo
add GitHub to the server user's `known_hosts`

Example:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/saloniq_github -C "oracle-vm-github-readonly"
ssh-keyscan github.com >> ~/.ssh/known_hosts
```

Then configure `~/.ssh/config` so git can use that key:

```sshconfig
Host github.com
HostName github.com
User git
IdentityFile ~/.ssh/saloniq_github
IdentitiesOnly yes
```

3. Prepare the deploy path

If this VM still has the old manually copied files, back up the existing deploy env first:

```bash
sudo mkdir -p /opt/saloniq-backups
sudo cp /opt/saloniq/deploy/oracle-dev/.env /opt/saloniq-backups/oracle-dev.env.$(date +%Y%m%d%H%M%S)
```

If the current `/opt/saloniq` directory is the old manual deploy directory, replace it with a clean git checkout during a short maintenance window:

```bash
ts=$(date +%Y%m%d%H%M%S)
docker stop saloniq-backend saloniq-caddy || true
mv /opt/saloniq "/opt/saloniq-manual-${ts}"
git clone git@github.com:nema-lev/SalonIQ.git /opt/saloniq
cp "/opt/saloniq-manual-${ts}/deploy/oracle-dev/.env" /opt/saloniq/deploy/oracle-dev/.env
```

If `/opt/saloniq` does not exist yet, either let the GitHub Action clone it on first deploy or clone it manually:

```bash
git clone git@github.com:nema-lev/SalonIQ.git /opt/saloniq
cd /opt/saloniq
git checkout main
```

4. Create the runtime env file

```bash
cd /opt/saloniq/deploy/oracle-dev
cp .env.example .env
```

Fill these values in `.env`:

BACKEND_HOST=saloniq.duckdns.org
APP_DOMAIN=saloniq.bg or the real SalonIQ tenant domain
FRONTEND_URL=https://<your-vercel-frontend-domain>
CORS_ORIGINS=https://<your-vercel-frontend-domain>,https://*.vercel.app
strong values for POSTGRES_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_API_KEY
optional DEFAULT_TENANT_SLUG only if you need a preview/dev fallback tenant

5. Keep or bootstrap the database safely

If the current VM already has the working Oracle dev/test stack and its `postgres_data` volume, do not delete it.

For a first-time bootstrap only:

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose up -d postgres
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /opt/saloniq/backend/prisma/migrations/001_init.sql
docker compose run --rm backend-tools npm run seed
docker compose up -d backend caddy
```

`npm run seed` creates a fresh demo tenant (`demo-business`) and resets only that tenant's demo data.

This repo currently bootstraps the DB from `backend/prisma/migrations/001_init.sql`; it does not ship a standard Prisma migration directory for `prisma migrate deploy`.

One-time migration from docker-compose v1 to Docker Compose v2

Run this once on the Oracle VM. These steps do not delete the `postgres_data` volume.

```bash
cd /opt/saloniq
git fetch --prune origin
git checkout main
git pull --ff-only origin main
```

```bash
cd /opt/saloniq/deploy/oracle-dev
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker volume ls | grep postgres_data || true
```

```bash
sudo apt-get update
sudo apt-get install -y docker-compose-plugin
sudo apt-get remove -y docker-compose || true
sudo rm -f /usr/local/bin/docker-compose
docker compose version
```

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose --env-file .env config -q
docker compose --env-file .env up -d postgres
docker compose --env-file .env up -d --build --no-deps backend
docker compose --env-file .env up -d caddy
```

Database backups and restore

This deploy includes two small ops scripts:

deploy/oracle-dev/backup-db.sh
deploy/oracle-dev/restore-db.sh

They keep PostgreSQL private inside Docker and use `pg_dump` / `pg_restore` through the existing `postgres` service. No new ports are opened and no external backup service is introduced.

Backup storage path

Backups are stored on the Oracle VM host at:

/opt/saloniq-backups/postgres

The backup script creates timestamped PostgreSQL custom-format dumps like:

/opt/saloniq-backups/postgres/saloniq_db_20260422-213000.dump

Default retention policy

`backup-db.sh` keeps the newest 14 `.dump` files in the backup directory and removes older ones after a successful backup.

You can override that count when needed:

```bash
BACKUP_RETENTION_COUNT=7 ./backup-db.sh
```

One-time backup directory preparation on the VM

If the deploy user does not already own the backup path, prepare it once:

```bash
sudo mkdir -p /opt/saloniq-backups/postgres
sudo chown <deploy-user>:<deploy-user> /opt/saloniq-backups/postgres
sudo chmod 700 /opt/saloniq-backups/postgres
```

Manual backup command

Run this on the Oracle VM:

```bash
cd /opt/saloniq/deploy/oracle-dev
./backup-db.sh
```

Optional overrides:

```bash
ENV_FILE=/opt/saloniq/deploy/oracle-dev/.env BACKUP_RETENTION_COUNT=21 ./backup-db.sh
```

The script will:

ensure the `postgres` container is up
wait until PostgreSQL is ready
write a timestamped custom-format dump into `/opt/saloniq-backups/postgres`
remove older `.dump` files beyond the retention count

Manual restore flow

Restore is intentionally explicit because it overwrites the current database objects.

1. Take a fresh backup first so you can roll back if needed:

```bash
cd /opt/saloniq/deploy/oracle-dev
./backup-db.sh
```

2. Stop the backend so application traffic does not interfere with restore:

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose stop backend
```

3. Restore the selected backup:

```bash
cd /opt/saloniq/deploy/oracle-dev
./restore-db.sh /opt/saloniq-backups/postgres/<backup-file>.dump
```

The script will ask you to type:

`RESTORE <POSTGRES_DB>`

4. Start the backend again after restore:

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose up -d backend
```

If you need a non-interactive restore, use:

```bash
cd /opt/saloniq/deploy/oracle-dev
./restore-db.sh --yes /opt/saloniq-backups/postgres/<backup-file>.dump
```

Equivalent raw restore command

If you ever need the underlying command flow without the wrapper script:

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < /opt/saloniq-backups/postgres/<backup-file>.dump
```

Optional cron example

Cron is not configured by this repo, but this is a safe later step if you want nightly backups:

```bash
0 3 * * * cd /opt/saloniq/deploy/oracle-dev && ./backup-db.sh >> /var/log/saloniq-db-backup.log 2>&1
```

GitHub Actions deploy behavior

The workflow in `.github/workflows/oracle-backend-deploy.yml` runs on:

pushes to `main` that touch `backend/**`
pushes to `main` that touch the Oracle backend deploy files
manual `workflow_dispatch`

During deploy it:

connects to the Oracle VM over SSH
clones the repo to `/opt/saloniq` if needed
runs `deploy/oracle-dev/deploy-backend.sh`
verifies the internal backend health endpoint
verifies the public HTTPS health endpoint

Manual validation commands on the VM

Run these checks on the VM:

```bash
cd /opt/saloniq/deploy/oracle-dev
docker compose version
docker compose --env-file .env config -q
docker compose ps
docker compose logs backend --tail=100
docker compose exec -T backend curl -fsS http://localhost:3001/api/v1/health
curl -fsSI -H 'Host: saloniq.duckdns.org' http://127.0.0.1/api/v1/health
curl -fsS https://saloniq.duckdns.org/api/v1/health
```

Manual auto-deploy verification on the VM

These checks confirm that the SSH deploy path is now using Compose v2 and not the removed v1 fallback:

```bash
cd /opt/saloniq
git rev-parse HEAD
```

```bash
cd /opt/saloniq/deploy/oracle-dev
./deploy-backend.sh
```

Expected behavior:

the script fails immediately if `docker compose` is missing
the backend restart path uses `docker compose up -d --build --no-deps backend`
there is no `docker-compose` fallback and no `ContainerConfig` cleanup path left in the script

Vercel frontend

Point the frontend to the public backend URL:

BACKEND_URL=https://saloniq.duckdns.org
INTERNAL_API_KEY=<same value as backend>

Keep the tenant-facing frontend domain variables aligned with your existing frontend setup:

NEXT_PUBLIC_APP_DOMAIN=<your SalonIQ app domain>
NEXT_PUBLIC_DEFAULT_TENANT_SLUG=<optional preview fallback>
DEFAULT_TENANT_SLUG=<same optional preview fallback>
