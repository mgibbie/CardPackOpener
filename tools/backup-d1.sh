#!/usr/bin/env bash
# Back up the production D1 database (magepunk-users) to a local, gitignored file.
#
# WHAT IT PROTECTS: the mp_store table holds every player's account, collection,
# earned cards, decks, packs, and quests. This is an OFFLINE archive on top of
# Cloudflare's built-in D1 Time Travel (30-day point-in-time recovery) — it guards
# against catastrophic loss Time Travel can't cover (the database deleted, the
# account lost, or restoring older than 30 days).
#
# SENSITIVE: the dump contains scrypt password hashes + user data. It is written to
# backups/, which is .gitignored — NEVER commit it or upload it anywhere public.
# Keep the backups/ directory private to this machine.
#
# AUTH: uses your local wrangler login (run `npx wrangler login` once if needed).
#
# USAGE:   bash tools/backup-d1.sh
# SCHEDULE (recurring): point Windows Task Scheduler (or cron) at this script, e.g.
#   daily. Do NOT wire it into public CI — the dump is PII and public-repo Actions
#   artifacts are downloadable by anyone.
#
# RESTORE options:
#   - From this dump (fresh/replacement DB):
#       npx wrangler d1 execute magepunk-users --remote --file=backups/<the>.sql
#   - Point-in-time (last 30 days), no dump needed:
#       npx wrangler d1 time-travel info magepunk-users
#       npx wrangler d1 time-travel restore magepunk-users --timestamp=<ISO8601>
set -euo pipefail
cd "$(dirname "$0")/.."            # repo root
DB=magepunk-users
KEEP=30                            # retain this many most-recent dumps
mkdir -p backups
FILE="backups/${DB}-$(date +%Y%m%d-%H%M%S).sql"
echo "Exporting $DB (remote) -> $FILE"
npx --yes wrangler@4 d1 export "$DB" --remote --output="$FILE"
# prune older dumps beyond KEEP
ls -1t "backups/${DB}-"*.sql 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f
n=$(ls -1 "backups/${DB}-"*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "Done — $n backup(s) retained in backups/ (gitignored; keep private)."
