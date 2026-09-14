#!/bin/bash
# ============================================================
# KinShop — Purge quotidienne des sessions expirées (M5)
# Cron : 03:50 quotidien. Quelques millisecondes sur SQLite.
# ============================================================
set -u
DB_PATH="/opt/KINSHOP/db/kinshop.db"
LOG_FILE="/opt/KINSHOP/backups/purge-sessions.log"
NOW_MS="$(date +%s000)"
DELETED="$(/usr/bin/sqlite3 "$DB_PATH" "DELETE FROM Session WHERE expiresAt < $NOW_MS; SELECT changes();")"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] sessions expirées purgées : $DELETED" >> "$LOG_FILE"
