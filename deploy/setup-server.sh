#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server (Hetzner Cloud) for NepalShop. Run as root:
#   curl -fsSL <raw URL of this file> -o setup-server.sh   (or scp it over)
#   bash setup-server.sh "ssh-ed25519 AAAA... github-actions-deploy"
# The argument is the PUBLIC half of the deploy key whose private half is the DEPLOY_SSH_KEY secret in GitHub.
# Safe to run again: every step checks before it changes anything.
set -euo pipefail

DEPLOY_PUBKEY="${1:?usage: setup-server.sh \"<deploy public key>\"}"
APP_DIR=/srv/nepalshop
export DEBIAN_FRONTEND=noninteractive
step() { echo; echo "==> $*"; }

[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
grep -q 'VERSION_ID="24.04"' /etc/os-release || echo "warning: tested on Ubuntu 24.04"

step "system updates and basics"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl gnupg ufw fail2ban unattended-upgrades rsync
dpkg-reconfigure -fnoninteractive unattended-upgrades

step "Docker (official apt repository)"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

step "firewall: SSH, HTTP, HTTPS only (Postgres is never exposed)"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

step "swap (helps small servers survive build/backup spikes)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "deploy user (used only by GitHub Actions)"
id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash deploy
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$DEPLOY_PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

step "SSH: keys only"
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-nepalshop.conf
  systemctl reload ssh
else
  echo "skipped: root has no SSH key yet, so password login stays on (add your key, then run this again)"
fi

step "app folder and secrets"
install -d -m 750 -o deploy -g deploy "$APP_DIR" "$APP_DIR/backups"
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<ENV
# Fill in APP_DOMAIN, PUBLIC_URL, ACME_EMAIL and the rest; see deploy/env.production.example in the repo.
APP_DOMAIN=
PUBLIC_URL=
BASE_DOMAIN=
ACME_EMAIL=
POSTGRES_PASSWORD=$(openssl rand -hex 24)
SESSION_SECRET=$(openssl rand -hex 32)
PUBLIC_SIGNUP=false
CONTACT_EMAIL=
BACKUP_RSYNC_TARGET=
BACKUP_SSH_PORT=23
ENV
  chown deploy:deploy "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "created $APP_DIR/.env with generated database password and session secret"
else
  echo "kept existing $APP_DIR/.env"
fi

step "nightly backup at 02:15 Nepal time (20:30 UTC)"
cat > /etc/cron.d/nepalshop-backup <<CRON
30 20 * * * deploy [ -x $APP_DIR/backup.sh ] && $APP_DIR/backup.sh >> $APP_DIR/backups/backup.log 2>&1
CRON
chmod 644 /etc/cron.d/nepalshop-backup

step "done"
echo "Next: edit $APP_DIR/.env (domains, email), point DNS at this server, then push to main in GitHub to deploy."
