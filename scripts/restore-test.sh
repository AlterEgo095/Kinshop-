#!/bin/bash
# ============================================================
# KinShop — Test de restauration hebdomadaire (C1 — vague 1)
# Cron : dimanche 04:20. Restaure la dernière archive dans un
# répertoire temporaire, vérifie intégrité + compteurs clés.
# Ne touche JAMAIS à la base de production.
# ============================================================
set -u
APP_DIR="/opt/KINSHOP"
BACKUP_DIR="$APP_DIR/backups"
LOG_FILE="$BACKUP_DIR/restore_test.log"
WORK="$(mktemp -d /tmp/kinshop-restore-test.XXXXXX)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

LATEST="$(ls -1t "$BACKUP_DIR"/kinshop-*.db.gz 2>/dev/null | head -1)"
if [ -z "$LATEST" ]; then
  log "ERREUR : aucune archive trouvée dans $BACKUP_DIR"
  exit 1
fi

log "Test de restauration de $LATEST"
gzip -dc "$LATEST" > "$WORK/restored.db"

INTEG="$(/usr/bin/sqlite3 "$WORK/restored.db" 'PRAGMA integrity_check;')"
STORES="$(/usr/bin/sqlite3 "$WORK/restored.db" 'SELECT count(*) FROM Store;' 2>/dev/null || echo '?')"
PRODUCTS="$(/usr/bin/sqlite3 "$WORK/restored.db" 'SELECT count(*) FROM Product;' 2>/dev/null || echo '?')"
ORDERS="$(/usr/bin/sqlite3 "$WORK/restored.db" 'SELECT count(*) FROM "Order";' 2>/dev/null || echo '?')"
USERS="$(/usr/bin/sqlite3 "$WORK/restored.db" 'SELECT count(*) FROM User;' 2>/dev/null || echo '?')"

if [ "$INTEG" = "ok" ]; then
  log "RESTAURATION OK : intégrité=ok stores=$STORES produits=$PRODUCTS commandes=$ORDERS users=$USERS"
  STATUS=0
else
  log "RESTAURATION KO : intégrité=$INTEG"
  STATUS=1
fi

rm -rf "$WORK"
exit $STATUS
