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
BACKEND_CONTAINER_NAME="${BACKEND_CONTAINER_NAME:-saloniq-backend}"
BACKEND_START_STATUS=0
BACKEND_START_OUTPUT=""

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

compose() {
  if docker compose version >/dev/null 2>&1; then
    (
      cd "${DEPLOY_DIR}"
      docker compose -f docker-compose.yml "$@"
    )
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    (
      cd "${DEPLOY_DIR}"
      docker-compose -f docker-compose.yml "$@"
    )
    return
  fi

  fail "Neither 'docker compose' nor 'docker-compose' is installed"
}

capture_backend_start_attempt() {
  local output_file

  output_file="$(mktemp)"

  set +e
  compose up -d --no-deps "${BACKEND_SERVICE}" >"${output_file}" 2>&1
  BACKEND_START_STATUS=$?
  set -e

  BACKEND_START_OUTPUT="$(<"${output_file}")"
  rm -f "${output_file}"
}

print_backend_start_output() {
  local output="$1"
  local stream="${2:-stdout}"

  if [[ -z "${output}" ]]; then
    return 0
  fi

  if [[ "${stream}" == "stderr" ]]; then
    printf '%s\n' "${output}" >&2
    return 0
  fi

  printf '%s\n' "${output}"
}

remove_stale_backend_containers() {
  local -a container_ids=()
  local -a container_names=()
  local container_id
  local container_name

  mapfile -t container_ids < <(
    docker ps -aq \
      --filter "label=com.docker.compose.service=${BACKEND_SERVICE}" \
      --filter "name=${BACKEND_CONTAINER_NAME}"
  )

  if [[ "${#container_ids[@]}" -eq 0 ]]; then
    fail "Detected recreate failure but could not find backend container(s) for service ${BACKEND_SERVICE} matching ${BACKEND_CONTAINER_NAME}"
  fi

  for container_id in "${container_ids[@]}"; do
    container_name="$(docker inspect --format '{{.Name}}' "${container_id}" 2>/dev/null || true)"
    container_name="${container_name#/}"

    if [[ -n "${container_name}" ]]; then
      container_names+=("${container_name}")
    fi
  done

  log "Removing backend container(s): ${container_names[*]:-${container_ids[*]}}"
  docker rm -f "${container_ids[@]}" >/dev/null
}

deploy_backend() {
  log "Starting backend container"
  capture_backend_start_attempt

  if [[ "${BACKEND_START_STATUS}" -eq 0 ]]; then
    print_backend_start_output "${BACKEND_START_OUTPUT}"
    log "Backend container started on first attempt"
    return 0
  fi

  if [[ "${BACKEND_START_OUTPUT}" == *"KeyError: 'ContainerConfig'"* ]]; then
    print_backend_start_output "${BACKEND_START_OUTPUT}" stderr
    log "Detected legacy docker-compose recreate bug; entering fallback cleanup"
    remove_stale_backend_containers

    log "Retrying backend start after cleanup"
    capture_backend_start_attempt

    if [[ "${BACKEND_START_STATUS}" -eq 0 ]]; then
      print_backend_start_output "${BACKEND_START_OUTPUT}"
      log "Backend container started after fallback cleanup"
      return 0
    fi

    print_backend_start_output "${BACKEND_START_OUTPUT}" stderr
    log "Backend start failed after fallback cleanup with status ${BACKEND_START_STATUS}"

    if [[ "${BACKEND_START_OUTPUT}" == *"KeyError: 'ContainerConfig'"* ]]; then
      fail "Backend recreate still fails with ContainerConfig after backend container cleanup"
    fi

    fail "Backend start failed after fallback cleanup"
  fi

  print_backend_start_output "${BACKEND_START_OUTPUT}" stderr
  log "Backend start failed without legacy recreate fallback (status ${BACKEND_START_STATUS})"
  fail "Backend start command failed"
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
require_cmd mktemp
require_cmd rm

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

log "Building backend image"
compose build "${BACKEND_SERVICE}"

log "Rebuilding and restarting backend only"
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
