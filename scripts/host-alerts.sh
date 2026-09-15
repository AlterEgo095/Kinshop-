#!/bin/bash
# KinShop — Alertes hôte (vague 2, M4 anticipé) : disque / swap / mémoire.
# Cron toutes les 15 minutes. Journalise quand un seuil est franchi (log only :
# aucun SMTP branché sur ce serveur — la lecture se fait via les rapports et
# /opt/KINSHOP/logs/host-alerts.log). Zéro action destructrice.
set -u
LOG=/opt/KINSHOP/logs/host-alerts.log
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt $((1024*1024)) ] && : > "$LOG"
stamp() { date '+%F %T'; }

DISK_PCT=$(df --output=pcent / | tail -1 | tr -dc '0-9')
if [ "${DISK_PCT:-0}" -ge 80 ]; then
  echo "$(stamp) ALERTE disque / à ${DISK_PCT}% (seuil 80%)" >> "$LOG"
fi

SWAP_PCT=$(free | awk '/^Swap:/ {if ($2>0) printf "%d", $3*100/$2; else print 0}')
if [ "${SWAP_PCT:-0}" -ge 90 ]; then
  echo "$(stamp) ALERTE swap à ${SWAP_PCT}% (seuil 90%)" >> "$LOG"
fi

AVAIL_MB=$(free -m | awk '/^Mem:/ {print $7}')
if [ "${AVAIL_MB:-99999}" -le 500 ]; then
  echo "$(stamp) ALERTE mémoire disponible ${AVAIL_MB} Mo (seuil 500 Mo)" >> "$LOG"
fi
exit 0
