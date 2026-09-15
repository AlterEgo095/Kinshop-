#!/bin/bash
# KinShop — Copie de sauvegarde HORS SERVEUR (vague 2, C1 fin).
# Principe : la rotation locale (backup.sh) garde 14 jours SUR CE SERVEUR — un
# sinistre disque détruirait les deux. Ce hook pousse la dernière archive vers
# une destination distante, juste après le backup quotidien (03:45).
# Deux moteurs supportés (le premier configuré gagne) :
#   1) rclone → KINSHOP_OFFSITE_REMOTE="nomdistant:bucket/kinshop"   (rclone config)
#   2) scp    → KINSHOP_OFFSITE_SCP="user@hote:/chemin/kinshop"      (clé SSH à installer)
# Configuration dans /home/aenews/kinshop-ops/offsite.conf (JAMAIS dans Git) :
#   KINSHOP_OFFSITE_REMOTE="..."
#   # ou
#   KINSHOP_OFFSITE_SCP="..."
# Tant qu'aucune destination n'est configurée : no-op bavard (exit 0) — le cron
# peut donc être branché dès aujourd'hui sans bruit d'erreur.
set -u
CONF=/home/aenews/kinshop-ops/offsite.conf
[ -f "$CONF" ] && . "$CONF"

if [ -z "${KINSHOP_OFFSITE_REMOTE:-}" ] && [ -z "${KINSHOP_OFFSITE_SCP:-}" ]; then
  echo "[offsite] aucune destination configurée ($CONF) — copie hors serveur inactive."
  exit 0
fi

LATEST=$(ls -1t /opt/KINSHOP/backups/kinshop-*.db.gz 2>/dev/null | head -1)
if [ -z "$LATEST" ]; then
  echo "[offsite] !! aucune archive locale trouvée — abandon."
  exit 1
fi

if [ -n "${KINSHOP_OFFSITE_REMOTE:-}" ]; then
  echo "[offsite] rclone → $KINSHOP_OFFSITE_REMOTE"
  if rclone copy "$LATEST" "$KINSHOP_OFFSITE_REMOTE" --transfers 1 --quiet; then
    echo "[offsite] OK : $(basename "$LATEST")"
  else
    echo "[offsite] !! échec rclone (rc=$?)"
    exit 1
  fi
fi

if [ -n "${KINSHOP_OFFSITE_SCP:-}" ]; then
  echo "[offsite] scp → $KINSHOP_OFFSITE_SCP"
  if scp -q -o BatchMode=yes -o ConnectTimeout=15 "$LATEST" "$KINSHOP_OFFSITE_SCP/"; then
    echo "[offsite] OK : $(basename "$LATEST")"
  else
    echo "[offsite] !! échec scp (rc=$?)"
    exit 1
  fi
fi
