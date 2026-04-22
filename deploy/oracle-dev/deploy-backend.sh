#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_DIR="${SCRIPT_DIR}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-origin}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_EXPECTED_SHA="${DEPLOY_EXPECTED_SHA:-}"
VERIFY_PUBLIC_HEALTH="${VERIFY_PUBLIC_HEALTH:-0}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
COMPOSE_VERSION_LOGGED=0

log() {
  printf '[oracle-backend-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Required command not found: $1"
  fi
}

require_compose_v2() {
  local compose_version

  if ! compose_version="$(docker compose version 2>/dev/null)"; then
    fail "Docker Compose v2 is required on the Oracle VM. Install the docker-compose-plugin and use 'docker compose'."
  fi

  if [[ "${COMPOSE_VERSION_LOGGED}" == "0" ]]; then
    log "Using ${compose_version}"
    COMPOSE_VERSION_LOGGED=1
  fi
}

compose() {
  local -a compose_args=(-f docker-compose.yml --env-file "${ENV_FILE}")

  require_compose_v2

  (
    cd "${DEPLOY_DIR}"
    docker compose "${compose_args[@]}" "$@"
  )
}

deploy_backend() {
  log "Rebuilding and restarting backend with Docker Compose v2"
  compose up -d --build --no-deps "${BACKEND_SERVICE}"
}

wait_for_backend_health() {
  local attempt

  for attempt in $(seq 1 20); do
    if compose exec -T "${BACKEND_SERVICE}" curl -fsS http://localhost:3001/api/v1/health >/dev/null 2>&1; then
      log "Backend health check passed"
      return 0
    fi

    sleep 3
  done

  return 1
}

wait_for_public_health() {
  local backend_host="$1"
  local attempt
  local url="https://${backend_host}/api/v1/health"

  for attempt in $(seq 1 20); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      log "Public health check passed at ${url}"
      return 0
    fi

    sleep 3
  done

  return 1
}

require_cmd git
require_cmd docker
require_cmd curl

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "Missing env file: ${ENV_FILE}"
fi

if ! git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "Expected a git checkout at ${REPO_ROOT}"
fi

if [[ -n "$(git -C "${REPO_ROOT}" status --porcelain)" ]]; then
  fail "Server checkout has local changes. Clean them before deploying."
fi

log "Fetching ${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
git -C "${REPO_ROOT}" fetch --prune "${DEPLOY_REMOTE}"

if git -C "${REPO_ROOT}" show-ref --verify --quiet "refs/heads/${DEPLOY_BRANCH}"; then
  git -C "${REPO_ROOT}" checkout "${DEPLOY_BRANCH}"
else
  git -C "${REPO_ROOT}" checkout -b "${DEPLOY_BRANCH}" "${DEPLOY_REMOTE}/${DEPLOY_BRANCH}"
fi

git -C "${REPO_ROOT}" pull --ff-only "${DEPLOY_REMOTE}" "${DEPLOY_BRANCH}"

current_sha="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
log "Checked out ${current_sha}"

if [[ -n "${DEPLOY_EXPECTED_SHA}" && "${current_sha}" != "${DEPLOY_EXPECTED_SHA}" ]]; then
  fail "Expected ${DEPLOY_EXPECTED_SHA}, but checkout is at ${current_sha}"
fi

log "Ensuring postgres is running"
compose up -d postgres

deploy_backend

if ! wait_for_backend_health; then
  compose logs --tail=120 "${BACKEND_SERVICE}" || true
  fail "Internal backend health check failed"
fi

if [[ "${VERIFY_PUBLIC_HEALTH}" == "1" ]]; then
  backend_host="$(sed -n 's/^BACKEND_HOST=//p' "${ENV_FILE}" | tail -n 1)"

  if [[ -z "${backend_host}" ]]; then
    fail "VERIFY_PUBLIC_HEALTH=1 requires BACKEND_HOST in ${ENV_FILE}"
  fi

  if ! wait_for_public_health "${backend_host}"; then
    fail "Public health check failed for ${backend_host}"
  fi
fi

log "Deploy complete"
