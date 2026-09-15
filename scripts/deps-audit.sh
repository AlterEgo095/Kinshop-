#!/bin/bash
# KinShop — Audit des dépendances (vague 2, E2). Cron hebdomadaire (lundi 06:00)
# ou manuel avant release. Politique double lockfile :
#   bun.lock         = verrou d'exécution (déploiement bun install --frozen-lockfile)
#   package-lock.json = manifeste d'audit (npm audit, Dependabot, renfort CVE)
# Ce script regénère le manifeste depuis package.json (node_modules intouché),
# lance l'audit production + complet et écrit un rapport horodaté.
# Les correctifs ne s'appliquent JAMAIS automatiquement : revue humaine, puis
# bun update/add ciblé + tsc + build contrôlé (cf. deploy/README-EXPLOITATION.md).
set -u
cd /opt/KINSHOP
LOG=/opt/KINSHOP/logs/deps-audit.log
{
  echo "===== $(date '+%F %T') — audit dépendances ====="
  npm install --package-lock-only --ignore-scripts --no-audit --no-fund 2>&1 | tail -2
  echo "--- npm audit (production) ---"
  npm audit --omit=dev 2>&1 | tail -30
  echo "--- npm audit (tout, dev inclus) ---"
  npm audit 2>&1 | tail -12
  echo ""
} >> "$LOG" 2>&1
echo "[deps-audit] rapport écrit dans $LOG"
# Rotation : 500 Ko max
[ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt $((500*1024)) ] && : > "$LOG"
