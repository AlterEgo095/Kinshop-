#!/bin/bash
# KinShop — Mise à jour production (modèle PM2 de ce serveur)
# Usage: ./update.sh [branche]
set -euo pipefail

# Sécurité déploiement : PM2 kinshop appartient à l'utilisateur aenews.
# Lancé en root (sudo), le build copierait un .env root:0600 dans standalone
# (illisible par l'app → Prisma sans DATABASE_URL) et le reload toucherait le
# mauvais démon PM2. → re-exécution automatique en tant que aenews.
if [ "$(id -u)" -eq 0 ]; then
  echo '>> Re-exécution en tant que aenews (PM2 kinshop appartient à aenews)'
  exec runuser -u aenews -- bash "$0" "$@"
fi

BRANCHE="${1:-main}"
export PATH="$PATH:/home/aenews/.bun/bin"
cd /opt/KINSHOP

# M3 vague 2 — garde-fou de propreté Git : l'arbre de production doit être
# strictement aligné sur le dépôt avant tout reset. Aucun écrasement silencieux
# de correctifs locaux non versionnés (leçon de la vague 1 : les correctifs
# chauds doivent passer par Git, pas cohabiter avec lui).
if [ -n "$(git status --porcelain)" ]; then
  echo '!! Arbre Git NON PROPRE — divergence locale avec le dépôt. Abandon (aucun écrasement).'
  echo '   Committer ou archiver les fichiers ci-dessous, puis relancer :'
  git status --short
  exit 1
fi

echo '>> git fetch + reset '$BRANCHE
git fetch origin
git reset --hard "origin/$BRANCHE"
echo '>> bun install'
bun install --frozen-lockfile
echo '>> prisma generate + db push'
bunx prisma generate
bunx prisma db push
echo '>> build'
bun run build
# Le build copie .env dans standalone : garantir la lisibilité par l'app
chown aenews:aenews /opt/KINSHOP/.next/standalone/.env 2>/dev/null || true
echo '>> pm2 reload kinshop'
pm2 reload kinshop --update-env
pm2 save

# M6 vague 2 — contrôles post-déploiement : permissions base + sonde santé
chmod 640 db/kinshop.db 2>/dev/null || true
chmod 750 db 2>/dev/null || true
sleep 3
CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:3310/api/health || echo 000)
if [ "$CODE" != "200" ]; then
  echo "!! Santé KO après reload (HTTP $CODE) — inspecter : pm2 logs kinshop --lines 50"
  exit 1
fi
echo '>> Santé OK (200)'
echo '>> Déploiement terminé'
