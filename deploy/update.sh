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
echo '>> OK — vérifier: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3310/'
