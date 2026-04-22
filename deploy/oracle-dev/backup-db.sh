#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${SCRIPT_DIR}/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/saloniq-backups/postgres}"
BACKUP_RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-14}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"

log() {
  printf '[oracle-postgres-backup] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  cat <<EOF
Usage: $(basename "$0")

Creates a PostgreSQL custom-format backup from the Oracle Docker stack.

Environment overrides:
  ENV_FILE                  Path to deploy env file (default: ${ENV_FILE})
  BACKUP_DIR                Backup destination directory (default: ${BACKUP_DIR})
  BACKUP_RETENTION_COUNT    Number of recent backups to keep (default: ${BACKUP_RETENTION_COUNT})
  POSTGRES_SERVICE          Compose service name for PostgreSQL (default: ${POSTGRES_SERVICE})
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

rotate_backups() {
  local -a backups_to_remove=()
  local index=0

  while IFS= read -r backup_path; do
    index=$((index + 1))
    if (( index > BACKUP_RETENTION_COUNT )); then
      backups_to_remove+=("${backup_path}")
    fi
  done < <(find "${BACKUP_DIR}" -maxdepth 1 -type f -name '*.dump' -print | sort -r)

  if (( ${#backups_to_remove[@]} == 0 )); then
    return 0
  fi

  for backup_path in "${backups_to_remove[@]}"; do
    rm -f -- "${backup_path}"
    log "Removed old backup ${backup_path}"
  done
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  fail "This script does not accept positional arguments. Use --help for usage."
fi

require_cmd docker
require_cmd date
require_cmd find
require_cmd mkdir
require_cmd rm
require_cmd sort

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing env file: ${ENV_FILE}"
fi

if ! [[ "${BACKUP_RETENTION_COUNT}" =~ ^[0-9]+$ ]] || (( BACKUP_RETENTION_COUNT < 1 )); then
  fail "BACKUP_RETENTION_COUNT must be an integer greater than 0"
fi

umask 077
mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}" 2>/dev/null || true

log "Ensuring PostgreSQL is running"
compose up -d "${POSTGRES_SERVICE}" >/dev/null

if ! wait_for_postgres; then
  fail "PostgreSQL did not become ready"
fi

db_name="$(container_env POSTGRES_DB)"

if [[ -z "${db_name}" ]]; then
  fail "POSTGRES_DB is empty inside the ${POSTGRES_SERVICE} container"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
backup_file="${BACKUP_DIR}/${db_name}_${timestamp}.dump"
tmp_file="${backup_file}.tmp"

log "Creating backup ${backup_file}"

if ! compose exec -T "${POSTGRES_SERVICE}" sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" "$POSTGRES_DB"' > "${tmp_file}"; then
  rm -f -- "${tmp_file}"
  fail "pg_dump failed"
fi

mv -- "${tmp_file}" "${backup_file}"
rotate_backups

log "Backup complete: ${backup_file}"
