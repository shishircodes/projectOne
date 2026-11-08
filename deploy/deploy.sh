#!/usr/bin/env bash
# Release a new app image on the server: run migrations, switch, health-check, roll back on failure.
# Called by the GitHub Actions deploy workflow over SSH:  ./deploy.sh ghcr.io/<owner>/<repo>:<sha>
set -euo pipefail
cd "$(dirname "$0")" || exit 1

NEW_IMAGE="${1:?usage: deploy.sh <image>}"
PREV_IMAGE="$(cat .current-image 2>/dev/null || true)"
log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# Every docker compose command needs APP_IMAGE (compose.yml requires it), including the health checks.
use_image() {
  export APP_IMAGE="$1"
}

# Record the live image in .env too, so `docker compose ...` typed by hand on the server just works.
remember_image() {
  umask 077  # the temp copy of .env holds secrets
  echo "$1" > .current-image
  { grep -v '^APP_IMAGE=' .env || true; } > .env.tmp
  echo "APP_IMAGE=$1" >> .env.tmp
  cat .env.tmp > .env && rm -f .env.tmp
}

app_health() {
  local id
  id="$(docker compose ps -q app)"
  if [ -n "$id" ]; then
    docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo "missing"
  else
    echo "missing"
  fi
}

wait_healthy() {
  for _ in $(seq 1 45); do
    [ "$(app_health)" = "healthy" ] && return 0
    sleep 2
  done
  return 1
}

use_image "$NEW_IMAGE"

log "pulling $NEW_IMAGE"
docker compose pull app

log "starting database"
docker compose up -d --wait db

# The schema is additive and idempotent (CREATE/ALTER ... IF NOT EXISTS), so it's safe to apply before switching:
# the running version keeps working against the new schema.
log "applying migrations"
docker compose run --rm --no-deps app bun scripts/migrate.ts

log "switching app to the new image"
docker compose up -d app caddy

if wait_healthy; then
  remember_image "$NEW_IMAGE"
  # Pick up Caddyfile changes shipped with this release.
  docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force >/dev/null || true
  docker image prune -f >/dev/null
  log "released $NEW_IMAGE"
  exit 0
fi

log "new release is unhealthy (status: $(app_health)); recent logs:"
docker compose logs --tail=60 app || true
if [ -n "$PREV_IMAGE" ]; then
  log "rolling back to $PREV_IMAGE"
  use_image "$PREV_IMAGE"
  docker compose up -d app
  if wait_healthy; then
    log "rollback healthy"
  else
    log "rollback is unhealthy too, check the server"
  fi
fi
exit 1
