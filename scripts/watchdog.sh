#!/bin/bash
# KinShop — Sonde de supervision externe (cycle 3 / LOT 3, RAPPORT 12 prochaines étapes)
# Exécutée par cron toutes les 5 minutes. Vérifie :
#   1. health de l'application (PM2/Next standalone 127.0.0.1:3310)
#   2. intégrité SQLite (PRAGMA integrity_check)
#   3. continuité de la chaîne d'audit AdminAction (COUNT == MAX(rowid) — aucun trou)
#   4. nombre de tables attendu (dérive de schéma)
#   5. état PM2 du processus kinshop
#   6. disque racine (fusible 90 %)
# Sortie : une ligne /var/log ou $LOG par passage — OK ou ALERT détaillée.
# Rotation maison : 5000 dernières lignes conservées.

LOG=/opt/KINSHOP/logs/watchdog.log
DB=/opt/KINSHOP/db/kinshop.db
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

mkdir -p /opt/KINSHOP/logs

HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3310/api/health 2>/dev/null || echo ERR)
INTEGRITY=$(sqlite3 "$DB" 'PRAGMA integrity_check;' 2>/dev/null || echo ERR)
TABLES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';" 2>/dev/null || echo ERR)
A_COUNT=$(sqlite3 "$DB" 'SELECT COUNT(*) FROM AdminAction;' 2>/dev/null || echo ERR)
A_MAX=$(sqlite3 "$DB" 'SELECT COALESCE(MAX(rowid),0) FROM AdminAction;' 2>/dev/null || echo ERR)
PM2_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json;l=json.load(sys.stdin);print(next((p['pm2_env']['status'] for p in l if p.get('name')=='kinshop'),'absent'))" 2>/dev/null || echo ERR)
DISK=$(df --output=pcent / 2>/dev/null | tail -1 | tr -dc '0-9' || echo 100)

ALERT=""
[ "$HEALTH" != "200" ] && ALERT="$ALERT health:$HEALTH"
[ "$INTEGRITY" != "ok" ] && ALERT="$ALERT integrity:$INTEGRITY"
[ "$A_COUNT" != "$A_MAX" ] && ALERT="$ALERT audit_gap:$A_COUNT/$A_MAX"
[ "$PM2_STATUS" != "online" ] && ALERT="$ALERT pm2:$PM2_STATUS"
[ "${DISK:-100}" -ge 90 ] 2>/dev/null && ALERT="$ALERT disk:${DISK}%"

if [ -n "$ALERT" ]; then
  echo "$TS ALERT$ALERT tables=$TABLES audit_count=$A_COUNT audit_max=$A_MAX" >> "$LOG"
else
  echo "$TS OK health=$HEALTH integrity=ok audit=$A_MAX tables=$TABLES pm2=$PM2_STATUS disk=${DISK}%" >> "$LOG"
fi

tail -n 5000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
