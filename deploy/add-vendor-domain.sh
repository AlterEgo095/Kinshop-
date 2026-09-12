#!/bin/bash
# KinShop — Ajouter un domaine personnalisé vendeur (modèle nginx de ce serveur)
# Usage: ./add-vendor-domain.sh boutique-vendeur.cd
# Pré-requis: DNS A du domaine -> 95.111.226.63, boutique vérifiée côté KinShop
set -euo pipefail
DOMAINE="${1:?Usage: add-vendor-domain.sh <domaine>}"
FQDN=$(echo "$DOMAINE" | tr "[:upper:]" "[:lower:]" | sed "s|^https\?://||; s|/.*$||")
echo ">> Domaine: $FQDN"

# 1. vhost HTTP (pour le challenge certbot)
cat > /tmp/kinshop-vendor-$FQDN << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $FQDN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
EOF
sudo install -m 644 /tmp/kinshop-vendor-$FQDN /etc/nginx/sites-available/kinshop-vendor-$FQDN
sudo ln -sf /etc/nginx/sites-available/kinshop-vendor-$FQDN /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 2. Certificat
sudo certbot certonly --webroot -w /var/www/certbot -d "$FQDN" --non-interactive --agree-tos

# 3. vhost HTTPS -> KinShop (le Host est préservé: routage boutique par page.tsx)
cat > /tmp/kinshop-vendor-$FQDN << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $FQDN;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $FQDN;
    ssl_certificate /etc/letsencrypt/live/$FQDN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$FQDN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    client_max_body_size 50m;
    location / {
        proxy_pass http://127.0.0.1:3310;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
sudo install -m 644 /tmp/kinshop-vendor-$FQDN /etc/nginx/sites-available/kinshop-vendor-$FQDN
sudo nginx -t && sudo systemctl reload nginx
echo ">> OK: https://$FQDN proxifié vers KinShop (port 3310)."
echo ">> Rappel: la boutique doit avoir ce domaine vérifié (TXT _kinshop-verify) dans son onglet Domaine."
