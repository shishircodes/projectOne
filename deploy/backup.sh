#!/usr/bin/env bash
# Nightly backup: database dump + uploaded images, kept 14 days on the server and copied off it when
# BACKUP_RSYNC_TARGET is set in .env (e.g. a Hetzner Storage Box: u12345@u12345.your-storagebox.de:nepalshop).
# A backup on the same server doesn't survive losing the server, so set the off-site target.
# Restore: see the "Backups" section in deploy/README.md.
set -euo pipefail
cd "$(dirname "$0")" || exit 1
mkdir -p backups

# A setting from .env, or empty when it's missing (never fails, so `set -e` doesn't stop the backup).
env_value() { { grep -E "^$1=" .env 2>/dev/null || true; } | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
if [ ! -s .current-image ]; then echo "$(date -u +%FT%TZ) skipped: nothing deployed yet"; exit 0; fi
APP_IMAGE="$(cat .current-image)"
export APP_IMAGE
ts="$(date -u +%Y%m%d-%H%M%S)"

docker compose exec -T db pg_dump -U nepalshop -d nepalshop -Fc > "backups/db-$ts.dump.part"
[ -s "backups/db-$ts.dump.part" ] || { echo "empty database dump"; exit 1; }
mv "backups/db-$ts.dump.part" "backups/db-$ts.dump"

docker compose exec -T app tar czf - -C /app/uploads . > "backups/uploads-$ts.tgz"

find backups -name 'db-*.dump' -mtime +14 -delete
find backups -name 'uploads-*.tgz' -mtime +14 -delete

target="$(env_value BACKUP_RSYNC_TARGET)"
if [ -n "$target" ]; then
  port="$(env_value BACKUP_SSH_PORT)"
  # Hetzner Storage Boxes take SSH/rsync on port 23.
  rsync -a --delete -e "ssh -p ${port:-23} -o StrictHostKeyChecking=accept-new" \
    --include='db-*.dump' --include='uploads-*.tgz' --exclude='*' backups/ "$target/"
fi
echo "$(date -u +%FT%TZ) backup ok: db-$ts.dump ($(du -h "backups/db-$ts.dump" | cut -f1))${target:+, copied off-site}"
