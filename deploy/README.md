# Deploying to Hetzner (Singapore)

One server runs everything for now: **Caddy** (HTTPS) → **app** (Bun: website + `/api/v1`) → **Postgres 18**, with nightly backups. GitHub Actions tests every push, and every push to `main` builds a Docker image and releases it on the server.

```
push to main ─► CI (typecheck, tests, build, mobile typecheck, config checks)
             ─► build image ─► ghcr.io/<owner>/<repo>:<commit>
             ─► SSH to server ─► deploy.sh: migrate ─► switch ─► health check ─► (roll back if unhealthy)
```

## One-time setup

### 1. Create the server

In Hetzner Cloud: **Add Server**
- Location: **Singapore**
- Image: **Ubuntu 24.04**
- Type: at least 4 GB RAM (e.g. CPX21). 8 GB (e.g. CPX31) gives Postgres more room.
- SSH key: add **your own** key (so you can log in as root).
- Optional but cheap insurance: turn on Hetzner **Backups** (whole-server snapshots, daily).

### 2. Point your domain at it

At your DNS provider, using the server's IPv4 address:
- `A` record for the dashboard host, e.g. `app.nepalshop.com`
- Optional, for store subdomains: `A` record for `*.nepalshop.com` (wildcard)

Stores' own custom domains get a `CNAME` to your app host. HTTPS certificates for all of these are issued automatically.

### 3. Make a deploy key for GitHub Actions

On your computer:

```bash
ssh-keygen -t ed25519 -N "" -C github-actions-deploy -f nepalshop-deploy
```

That makes `nepalshop-deploy` (private, goes into GitHub) and `nepalshop-deploy.pub` (public, goes on the server). Don't commit either.

### 4. Prepare the server

```bash
scp deploy/setup-server.sh root@SERVER_IP:
ssh root@SERVER_IP "bash setup-server.sh '$(cat nepalshop-deploy.pub)'"
```

This installs Docker, a firewall (only SSH, HTTP and HTTPS are open, and Postgres is never exposed), automatic security updates, a `deploy` user for GitHub Actions, and the nightly backup job. It also creates `/srv/nepalshop/.env` with a generated database password and session secret.

Then fill in the settings:

```bash
ssh root@SERVER_IP
nano /srv/nepalshop/.env      # APP_DOMAIN, PUBLIC_URL, ACME_EMAIL, CONTACT_EMAIL, legal and Meta settings
```

`deploy/env.production.example` lists every setting. **Don't change `SESSION_SECRET` later**: it encrypts the channel tokens stored in the database.

### 5. Tell GitHub about the server

Repository → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `DEPLOY_HOST` | the server's IP |
| Secret | `DEPLOY_SSH_KEY` | contents of `nepalshop-deploy` (the private key) |
| Secret | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan SERVER_IP` (pins the server's identity) |
| Variable | `PUBLIC_URL` | `https://app.nepalshop.com` (same as in the server `.env`) |
| Variable | `BASE_DOMAIN` | `nepalshop.com`, or leave unset |

Optional: **Settings → Environments → production → Required reviewers** makes each release wait for your approval.

### 6. Deploy and create the first admin

Push to `main` (or run **Actions → Deploy → Run workflow**). When it's green:

```bash
ssh root@SERVER_IP
cd /srv/nepalshop && export APP_IMAGE=$(cat .current-image)
docker compose exec app bun scripts/create-admin.ts --email you@example.com --name "Your Name"
```

It prints a one-time password. Sign in at `https://APP_DOMAIN/login` and choose your own. Then update the webhook URLs in the Meta and TikTok developer consoles to `https://APP_DOMAIN/webhooks/meta` and `/webhooks/tiktok`.

## Day to day

Run these on the server in `/srv/nepalshop`, after `export APP_IMAGE=$(cat .current-image)`:

| Task | Command |
|---|---|
| Status | `docker compose ps` |
| App logs | `docker compose logs -f app` |
| Database shell | `docker compose exec db psql -U nepalshop` |
| Apply `.env` changes | `docker compose up -d` |
| Roll back | `./deploy.sh ghcr.io/<owner>/<repo>:<older commit>`, or re-run an older Deploy run in GitHub |

Deploys restart the app container, so there's a few seconds of downtime per release.

## Backups

Every night at 02:15 Nepal time, `backup.sh` saves a database dump and a copy of uploaded images to `/srv/nepalshop/backups` and keeps 14 days. **A backup on the same server is lost with the server**, so set `BACKUP_RSYNC_TARGET` in `.env` to copy them off it. A Hetzner Storage Box is the cheapest option: enable SSH on it, add the `deploy` user's public key (`/home/deploy/.ssh/id_ed25519.pub`, create it with `ssh-keygen` as `deploy`), then set `BACKUP_RSYNC_TARGET=uXXXXX@uXXXXX.your-storagebox.de:nepalshop`.

Run one now with `sudo -u deploy ./backup.sh`, and check `backups/backup.log` occasionally.

**Restore** a database dump (replaces the current data):

```bash
docker compose stop app
docker compose exec -T db pg_restore -U nepalshop -d nepalshop --clean --if-exists < backups/db-YYYYMMDD-HHMMSS.dump
docker compose start app
```

Test a restore once, so you know it works before you need it.

## When to move Postgres off this server

Running the database next to the app is fine for the trial. Move it to its own server, or to a managed Postgres, when:
- the server is regularly busy (CPU over about 70%, or memory pressure), or the database outgrows a few GB of RAM for its cache
- you need to survive a server failure without restoring from last night's backup (replication and point-in-time recovery)
- you want to run more than one app server

Moving it is just a matter of changing `DATABASE_URL` and restoring a dump; the app doesn't change.
