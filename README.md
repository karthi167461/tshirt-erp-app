# Company ERP — Cutting · Stretching · QC · Packing

A Tamil-first garment ERP for a local factory network. One office PC runs the
server + database; phones, tablets, and PCs use the web app over WiFi in any
browser. Tracks per-stage work by lot/color/dozen, enforces the cutting quota
downstream, computes weekly salary, and backs up daily to Telegram.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind + shadcn-style UI, TanStack Query |
| i18n | react-i18next (Tamil default + English), files in `web/src/locales/` |
| Backend | Node.js + Fastify (TypeScript, run via `tsx`) |
| Database | SQLite via Prisma (single file; Postgres-ready) |
| Backups | node-cron → SQLite snapshot → gzip → Telegram |

## Repository layout

```
shared/   Zod schemas + shared types + week math (used by server and web)
server/   Fastify API, Prisma schema/migrations, services, backup, service scripts
web/      React web app (all screens) + Tamil/English translations
scripts/  install-service.ps1 / uninstall-service.ps1
```

## Quick start (development)

```bash
npm install
# 1) prepare DB (first time)
npm run migrate --workspace=server   # creates SQLite db + runs migrations
npm run seed --workspace=server      # demo settings, employees, stretching types
# 2) run both
npm run dev:server                   # http://localhost:4000
npm run dev:web                      # http://localhost:5173 (proxies /api → 4000)
```

Default admin PIN (for Settings/Salary): **1234** — change it in Settings.

## Production deployment (office PC)

Run once in an **elevated PowerShell**:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-service.ps1
```

This installs deps, prepares the DB, builds the web app, opens the firewall
port, and registers the **`CompanyERP` Windows Service** — which **starts
automatically on every boot** and restarts on crash. The server also serves the
built web app, so devices just open a browser:

- On the office PC: `http://localhost:4000`
- On other devices (same WiFi): `http://<office-pc-ip>:4000`

> **Give the office PC a static IP / DHCP reservation** so the address never
> changes. The install script prints the current LAN IP.

To remove: `.\scripts\uninstall-service.ps1`.

### Verify auto-start
Reboot the PC and open `http://<office-pc-ip>:4000` from a phone — it should load
with no manual step. `Get-Service CompanyERP` shows the service state.

## Daily backups → Telegram

Configured in `server/.env`:

```
BACKUP_CRON="30 22 * * *"     # daily time (server local)
BACKUP_RETENTION=30           # local copies kept next to the DB (server/prisma/data/backups/)
TELEGRAM_BOT_TOKEN="..."      # from @BotFather
TELEGRAM_CHAT_ID="..."        # your chat or group id
```

Each run makes a consistent SQLite snapshot (`VACUUM INTO`, no downtime), gzips
it, prunes old copies, and sends it to Telegram (`sendDocument`). Without a token
it still keeps local backups (Telegram = *skipped*). Trigger manually from
**Settings → Backup → Backup now**; last-run status shows there too.
Telegram bots cap uploads at 50 MB — the gzipped DB stays far under that.

## Domain rules

- **Cutting** fixes the dozen quota for a `(lot, color)`.
- **Stretching** validates each entry *per sub-type* against that quota (each
  sub-type independently processes the full quota).
- **QC** and **Packing** validate against the same quota (no sub-type). Packing
  is the final stage; full packing marks the color complete.
- **Salary** (weekly, Mon–Sun) = each employee's dozen × the stage rate
  (cutting/QC/packing from Settings; stretching rate from the sub-type).

## Tests

```bash
npm test --workspace=server   # quota logic + week-boundary unit tests
```

## Switching to PostgreSQL later

Change `datasource db` in `server/prisma/schema.prisma` to `postgresql`, set
`DATABASE_URL`, and run `prisma migrate`. No application code changes.
