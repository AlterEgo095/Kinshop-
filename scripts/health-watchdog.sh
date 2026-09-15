#!/bin/bash
# KinShop — Watchdog santé (vague 2) : sonde locale + auto-relance maîtrisée.
# Cron toutes les 2 minutes (utilisateur aenews).
# Principe : sonde l'app EN LOCAL (127.0.0.1:3310 — sans dépendance Cloudflare,
# DNS ni TLS). 3 échecs consécutifs → pm2 reload kinshop. Anti-flap : jamais
# plus d'un reload par tranche de 10 minutes.
set -u
LOG=/opt/KINSHOP/logs/health-watchdog.log
STATE=/opt/KINSHOP/logs/health-watchdog.state
RELOAD_STAMP=/opt/KINSHOP/logs/.watchdog-reload
URL=http://127.0.0.1:3310/api/health
MAX_LOG=$((2*1024*1024))

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt "$MAX_LOG" ] && : > "$LOG"

CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$URL" 2>/dev/null || echo 000)

if [ "$CODE" = "200" ]; then
  if [ -f "$STATE" ] && [ "$(cat "$STATE" 2>/dev/null || echo 0)" -ge 2 ]; then
    log "rétabli (HTTP 200) après $(cat "$STATE") échec(s)"
  fi
  echo 0 > "$STATE"
  exit 0
fi

FAILS=0
[ -f "$STATE" ] && FAILS=$(cat "$STATE" 2>/dev/null || echo 0)
FAILS=$((FAILS+1))
echo "$FAILS" > "$STATE"
log "échec sonde locale (HTTP $CODE) — $FAILS/3"

if [ "$FAILS" -ge 3 ]; then
  LAST=$(cat "$RELOAD_STAMP" 2>/dev/null || echo 0)
  NOW=$(date +%s)
  if [ $((NOW - LAST)) -ge 600 ]; then
    log "3 échecs consécutifs → pm2 reload kinshop"
    echo "$NOW" > "$RELOAD_STAMP"
    pm2 reload kinshop --update-env >> "$LOG" 2>&1 || log "!! pm2 reload a échoué (rc=$?)"
    echo 0 > "$STATE"
  else
    log "reload il y a moins de 10 min — attente (anti-flap)"
  fi
fi
exit 0
