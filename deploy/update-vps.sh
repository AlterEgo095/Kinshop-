#!/bin/bash
# KinShop — Mise à jour production (modèle PM2 de ce serveur)
# Usage: ./update.sh [branche]
set -euo pipefail
BRANCHE="${1:-main}"
export PATH="$PATH:/home/aenews/.bun/bin"
cd /opt/KINSHOP
echo ">> git fetch + reset $BRANCHE"
git fetch origin
git reset --hard "origin/$BRANCHE"
echo ">> bun install"
bun install --frozen-lockfile
echo ">> prisma generate + db push"
bunx prisma generate
bunx prisma db push
echo ">> build"
bun run build
echo ">> pm2 reload kinshop"
pm2 reload kinshop --update-env
pm2 save
echo ">> OK — vérifier: curl -s -o /dev/null -w \"%{http_code}\" http://127.0.0.1:3310/"
