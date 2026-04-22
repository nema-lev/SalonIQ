#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/saloniq-backups/postgres}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
ASSUME_YES=0

log() {
  printf '[oracle-postgres-restore] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
Usage: $(basename "$0") [--yes] BACKUP_FILE

Restores a PostgreSQL custom-format backup into the current Oracle Docker stack.
This overwrites objects in the configured database.

Arguments:
  BACKUP_FILE               Absolute path to a .dump file, or a filename inside ${BACKUP_DIR}

Options:
  --yes                    Skip the interactive confirmation prompt

Environment overrides:
  ENV_FILE                 Path to deploy env file (default: ${ENV_FILE})
  BACKUP_DIR               Default backup directory (default: ${BACKUP_DIR})
  POSTGRES_SERVICE         Compose service name for PostgreSQL (default: ${POSTGRES_SERVICE})
  BACKEND_SERVICE          Compose service name for the backend (default: ${BACKEND_SERVICE})
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

compose() {
  local -a compose_args=(-f docker-compose.yml --env-file "${ENV_FILE}")

  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 is required on the Oracle VM. Install the docker-compose-plugin and use 'docker compose'."
  fi

  (
    cd "${SCRIPT_DIR}"
    docker compose "${compose_args[@]}" "$@"
  )
}

wait_for_postgres() {
  local attempt

  for ((attempt = 1; attempt <= 20; attempt++)); do
    if compose exec -T "${POSTGRES_SERVICE}" sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi

    sleep 2
  done

  return 1
}

container_env() {
  local name="$1"
  compose exec -T "${POSTGRES_SERVICE}" sh -c "printf '%s' \"\${${name}:-}\""
}

service_is_running() {
  local service_name="$1"
  local container_id

  container_id="$(compose ps -q "${service_name}" 2>/dev/null | tr -d '\r')"

  if [[ -z "${container_id}" ]]; then
    return 1
  fi

  [[ "$(docker inspect -f '{{.State.Running}}' "${container_id}" 2>/dev/null)" == "true" ]]
}

resolve_backup_path() {
  local candidate="$1"

  if [[ -f "${candidate}" ]]; then
    printf '%s\n' "${candidate}"
    return 0
  fi

  if [[ -f "${BACKUP_DIR}/${candidate}" ]]; then
    printf '%s\n' "${BACKUP_DIR}/${candidate}"
    return 0
  fi

  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      fail "Unknown option: $1"
      ;;
    *)
      if [[ -n "${BACKUP_FILE_INPUT:-}" ]]; then
        fail "Only one backup file can be restored at a time"
      fi
      BACKUP_FILE_INPUT="$1"
      shift
      ;;
  esac
done

require_cmd docker
require_cmd tr

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing env file: ${ENV_FILE}"
fi

if [[ -z "${BACKUP_FILE_INPUT:-}" ]]; then
  fail "BACKUP_FILE is required. Use --help for usage."
fi

if ! BACKUP_FILE="$(resolve_backup_path "${BACKUP_FILE_INPUT}")"; then
  fail "Backup file not found: ${BACKUP_FILE_INPUT}"
fi

if [[ "${BACKUP_FILE}" != *.dump ]]; then
  fail "Expected a .dump file produced by backup-db.sh: ${BACKUP_FILE}"
fi

if service_is_running "${BACKEND_SERVICE}"; then
  fail "Backend service is running. Stop it first from ${SCRIPT_DIR} with: docker compose stop ${BACKEND_SERVICE}"
fi

log "Ensuring PostgreSQL is running"
compose up -d "${POSTGRES_SERVICE}" >/dev/null

if ! wait_for_postgres; then
  fail "PostgreSQL did not become ready"
fi

db_name="$(container_env POSTGRES_DB)"

if [[ -z "${db_name}" ]]; then
  fail "POSTGRES_DB is empty inside the ${POSTGRES_SERVICE} container"
fi

if (( ASSUME_YES == 0 )); then
  log "About to restore ${BACKUP_FILE} into database ${db_name}."
  log "This will replace existing database objects in the current stack."
  read -r -p "Type RESTORE ${db_name} to continue: " confirmation

  if [[ "${confirmation}" != "RESTORE ${db_name}" ]]; then
    fail "Restore cancelled"
  fi
fi

log "Restoring ${BACKUP_FILE} into ${db_name}"

if ! compose exec -T "${POSTGRES_SERVICE}" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "${BACKUP_FILE}"; then
  fail "pg_restore failed"
fi

log "Restore complete: ${BACKUP_FILE}"
