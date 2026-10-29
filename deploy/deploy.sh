#!/usr/bin/env bash
# Release a new app image on the server: run migrations, switch, health-check, roll back on failure.
# Called by the GitHub Actions deploy workflow over SSH:  ./deploy.sh ghcr.io/<owner>/<repo>:<sha>
set -euo pipefail
cd "$(dirname "$0")"

NEW_IMAGE="${1:?usage: deploy.sh <image>}"
PREV_IMAGE="$(cat .current-image 2>/dev/null || true)"
log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

app_health() {
  local id
  id="$(docker compose ps -q app)"
  [ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo "missing"
}

wait_healthy() {
  for _ in $(seq 1 45); do
    [ "$(app_health)" = "healthy" ] && return 0
    sleep 2
  done
  return 1
}

log "pulling $NEW_IMAGE"
APP_IMAGE="$NEW_IMAGE" docker compose pull app

log "starting database"
APP_IMAGE="$NEW_IMAGE" docker compose up -d --wait db

# The schema is additive and idempotent (CREATE/ALTER ... IF NOT EXISTS), so it's safe to apply before switching:
# the running version keeps working against the new schema.
log "applying migrations"
APP_IMAGE="$NEW_IMAGE" docker compose run --rm --no-deps app bun scripts/migrate.ts

log "switching app to the new image"
APP_IMAGE="$NEW_IMAGE" docker compose up -d app caddy

if wait_healthy; then
  echo "$NEW_IMAGE" > .current-image
  # Pick up Caddyfile changes shipped with this release.
  APP_IMAGE="$NEW_IMAGE" docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --force >/dev/null || true
  docker image prune -f >/dev/null
  log "released $NEW_IMAGE"
  exit 0
fi

log "new release is unhealthy; recent logs:"
APP_IMAGE="$NEW_IMAGE" docker compose logs --tail=60 app || true
if [ -n "$PREV_IMAGE" ]; then
  log "rolling back to $PREV_IMAGE"
  APP_IMAGE="$PREV_IMAGE" docker compose up -d app
  wait_healthy && log "rollback healthy" || log "rollback is unhealthy too, check the server"
fi
exit 1
