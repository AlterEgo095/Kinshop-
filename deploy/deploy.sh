#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────
# KinShop — Déploiement production sur VPS
# Usage :
#   bash deploy/deploy.sh            # premier déploiement complet
#   bash deploy/deploy.sh --update   # mise à jour (git pull + rebuild + restart)
#
# Prérequis : Bun installé, repo cloné dans /opt/kinshop, .env configuré.
# ──────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

echo "🛍️  KinShop — déploiement dans $APP_DIR"

# 0) Dépendances de base vérifiées
command -v bun >/dev/null 2>&1 || { echo "❌ Bun absent. Installe-le : curl -fsSL https://bun.sh/install | bash"; exit 1; }
command -v systemctl >/dev/null 2>&1 || echo "⚠️  systemd introuvable : le service ne sera pas installé/redémarré automatiquement."

# 1) Mise à jour du code (si --update)
if [[ "${1:-}" == "--update" ]]; then
  echo "📥 git pull…"
  git pull --ff-only origin main || { echo "❌ git pull a échoué (conflits ?)"; exit 1; }
fi

# 2) Fichier .env (premier déploiement uniquement)
if [[ ! -f .env ]]; then
  echo "🔧 Création de .env"
  read -r -p "PIN de la console admin (ADMIN_PIN) : " ADMIN_PIN_INPUT
  [[ -z "$ADMIN_PIN_INPUT" ]] && ADMIN_PIN_INPUT="243243"
  cat > .env <<EOF
DATABASE_URL="file:./db/custom.db"
ADMIN_PIN="$ADMIN_PIN_INPUT"
NEXT_PUBLIC_PLATFORM_DOMAIN="kinshop.aenews.digital"
PLATFORM_IPV4="95.111.226.63"
EOF
  chmod 600 .env
  echo "✅ .env créé (pense à choisir un PIN fort en production !)"
fi

# 3) Dépendances + client Prisma
echo "📦 bun install…"
bun install --frozen-lockfile || bun install

echo "🗄️  Prisma (generate + db push)…"
bunx prisma generate
bunx prisma db push --accept-data-loss

# 4) Build production (sortie standalone attendue par le package.json)
echo "🏗️  Build Next.js (peut prendre quelques minutes)…"
bun run build

# 5) Le client Prisma doit suivre le bundle standalone
if [[ -d node_modules/.prisma && ! -d .next/standalone/node_modules/.prisma ]]; then
  echo "🧩 Copie du client Prisma dans le bundle standalone…"
  mkdir -p .next/standalone/node_modules
  cp -r node_modules/.prisma .next/standalone/node_modules/
  cp -r node_modules/@prisma .next/standalone/node_modules/ 2>/dev/null || true
fi

# 6) Service systemd
if command -v systemctl >/dev/null 2>&1; then
  if [[ ! -f /etc/systemd/system/kinshop.service ]]; then
    echo "🚀 Installation du service systemd…"
    sudo cp deploy/kinshop.service /etc/systemd/system/
    sudo systemctl daemon-reload
  fi
  echo "🔄 Redémarrage du service kinshop…"
  sudo systemctl restart kinshop
  sleep 2
  sudo systemctl --no-pager status kinshop | head -12 || true
fi

# 7) Vérification locale
echo "🔎 Test local (http://127.0.0.1:3000)…"
sleep 2
if curl -fsS -o /dev/null http://127.0.0.1:3000; then
  echo "✅ KinShop tourne ! https://kinshop.aenews.digital"
else
  echo "❌ Le serveur ne répond pas — regarde /var/log/kinshop.err.log"
  exit 1
fi
