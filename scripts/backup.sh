#!/bin/bash
# ============================================================
# KinShop — Sauvegarde quotidienne SQLite (C1 — vague 1)
# Installé le 2026-09-15 par audit Z.ai. Cron : 03:45 quotidien.
# Rotation 14 jours. Intégrité vérifiée à chaque sauvegarde.
# ============================================================
set -u
APP_DIR="/opt/KINSHOP"
DB_PATH="$APP_DIR/db/kinshop.db"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="$BACKUP_DIR/backup.log"
KEEP_DAYS=14
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_DB="$BACKUP_DIR/.tmp-$STAMP.db"
TARGET="$BACKUP_DIR/kinshop-$STAMP.db.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

log "Sauvegarde démarrée ($DB_PATH)"

# 1) Backup cohérent via l'API .backup de sqlite3 (sûr sous trafic WAL)
if ! /usr/bin/sqlite3 "$DB_PATH" ".backup '$TMP_DB'"; then
  log "ERREUR : sqlite3 .backup a échoué"
  rm -f "$TMP_DB"
  exit 1
fi
chmod 600 "$TMP_DB"

# 2) Compression + renommage vers le nom final
if ! gzip -9 "$TMP_DB"; then
  log "ERREUR : compression échouée"
  exit 1
fi
mv "$BACKUP_DIR/.tmp-$STAMP.db.gz" "$TARGET"
chmod 600 "$TARGET"

# 3) Vérification d'intégrité de l'archive produite
if [ ! -s "$TARGET" ]; then
  log "ERREUR : archive $TARGET absente ou vide"
  exit 1
fi
gzip -dc "$TARGET" > "$BACKUP_DIR/.verify.db"
INTEG="$(/usr/bin/sqlite3 "$BACKUP_DIR/.verify.db" 'PRAGMA integrity_check;')"
TABLES="$(/usr/bin/sqlite3 "$BACKUP_DIR/.verify.db" 'SELECT count(*) FROM sqlite_master WHERE type="table";')"
rm -f "$BACKUP_DIR/.verify.db"

if [ "$INTEG" != "ok" ]; then
  log "ERREUR : intégrité KO ($INTEG) — archive conservée pour analyse : $TARGET"
  exit 1
fi

# 4) Rotation : garder 14 jours
find "$BACKUP_DIR" -name 'kinshop-*.db.gz' -type f -mtime +$KEEP_DAYS -delete

log "OK : $TARGET ($(du -h "$TARGET" | cut -f1)) intégrité=ok tables=$TABLES"

# 5) Copie hors serveur — à activer avec une destination réelle :
#    rclone copy "$TARGET" remote:kinshop-backups
#    scp "$TARGET" backup@HOST_SECONDAIRE:/opt/backups/kinshop/
exit 0
