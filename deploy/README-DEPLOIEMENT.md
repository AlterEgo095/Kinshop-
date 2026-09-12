# KinShop — Déploiement Production

## ✅ État actuel (mis en production le 2026-09-12)

**KinShop tourne en production** sur `https://kinshop.aenews.digital`

| Élément | Valeur |
|---------|--------|
| Serveur | VPS Contabo `95.111.226.63` (vmi3058261, Ubuntu 24.04) |
| Répertoire | `/opt/KINSHOP` (propriétaire `aenews`) |
| Process | PM2 `kinshop` (id 22, fork, via service système `pm2-aenews`) |
| Port local | `127.0.0.1:3310` (nginx seul point d'entrée) |
| Reverse proxy | nginx — `/etc/nginx/sites-available/kinshop.aenews.digital` |
| TLS | Let's Encrypt (certbot webroot, renouvellement auto, expire 2026-12-11) |
| Base | SQLite `/opt/KINSHOP/db/kinshop.db` (vide en prod) |
| Logs | `/opt/KINSHOP/logs/kinshop-{out,error}.log` (+ pm2-logrotate) |
| `.env` | `/opt/KINSHOP/.env` (chmod 600) : DATABASE_URL, ADMIN_PIN fort, NEXT_PUBLIC_PLATFORM_DOMAIN, PLATFORM_IPV4 |

**Modèle du serveur** (identique aux autres apps : IAHUB, wedding-platform…) :
`/opt/<APP>` + build Next.js **standalone** + **PM2** + **nginx vhost** + **certbot**.

### V8 — Comptes utilisateurs & sécurité (déployée le 2026-09-12)

Depuis la V8, **toute création/gestion de boutique exige un compte utilisateur**
(inscription gratuite + session cookie `kinshop_session` HttpOnly). Les quotas
FREE/PREMIUM sont appliqués côté serveur (voir `src/lib/plans.ts`) :

| Ressource | Free | Premium (3 $/mois) |
|---|---|---|
| Produits | 20 | 500 |
| Photos/produit | 1 | 5 |
| Codes promo | 3 | 30 |
| Zones de livraison | 5 | 25 |
| Factures/mois | 15 | 500 |
| Historique stats | 7 j | 60 j |
| Domaine personnalisé | ✗ | ✓ |

Un compte = **une** boutique. Les boutiques créées avant la V8 (ownerId null,
« orphelines ») restent visibles publiquement mais ne sont éditables par personne.

**Réattribuer une boutique orpheline à un compte** (console admin) :

```bash
# 1. Le vendeur crée son compte sur la plateforme (ex. vendeur@exemple.cd)
# 2. L'admin rattache sa boutique :
curl -X PATCH https://kinshop.aenews.digital/api/admin/stores \
  -H "x-admin-pin: $ADMIN_PIN" -H "Content-Type: application/json" \
  -d '{"id":"<STORE_ID>","action":"assign-owner","email":"vendeur@exemple.cd"}'
```

## Mise à jour de l'application

```bash
# Sur le VPS (SSH aenews@95.111.226.63)
/opt/KINSHOP/deploy/update-vps.sh          # git pull + build + pm2 reload
```

## Ajouter un domaine personnalisé vendeur

Le serveur utilise nginx (pas Caddy on-demand TLS) : chaque domaine vendeur
a besoin de son vhost + certificat.

```bash
# Sur le VPS — le domaine doit d'abord pointer (A) vers 95.111.226.63
/opt/KINSHOP/deploy/add-vendor-domain.sh boutique-vendeur.cd
```

Le script : crée le vhost HTTP → émet le certificat certbot → installe le
vhost HTTPS proxifié vers le port 3310 (le header Host est préservé, le
routage vers la bonne boutique se fait dans `src/app/page.tsx`).

Côté KinShop : le vendeur ajoute le domaine dans son onglet « Domaine »
(Premium), vérifie le TXT `_kinshop-verify.<domaine>`, et l'admin peut
valider manuellement depuis la console admin.

## Opérations courantes

```bash
pm2 list | grep kinshop          # statut
pm2 logs kinshop --lines 50      # logs
pm2 restart kinshop              # redémarrage simple
pm2 reload kinshop               # reload zero-downtime
tail -f /var/log/nginx/kinshop-error.log
```

## Sauvegarde de la base

```bash
sqlite3 /opt/KINSHOP/db/kinshop.db ".backup /opt/KINSHOP/backups/kinshop-$(date +%F).db"
# Cron recommandé (quotidien 03h) + conservation 30 jours
```

## ⚠️ Sécurité (à faire par le propriétaire du serveur)

1. **Bascule auth SSH par clé** + désactiver PasswordAuthentication
2. Changer le mot de passe `aenews` (partagé en clair pendant le déploiement)
3. **ADMIN_PIN** : généré fort (8 chiffres) et stocké dans `/opt/KINSHOP/.env` — le communiquer à l'équipe puis le changer si besoin : `sed -i "s/ADMIN_PIN=.*/ADMIN_PIN=NOUVEAU/" /opt/KINSHOP/.env && pm2 restart kinshop`
4. Révoquer le PAT GitHub exposé (GitHub → Settings → Developer settings)
5. ufw : autoriser 22/80/443 uniquement si ce n'est pas déjà fait

---

## Déploiement initial (archivé — déjà exécuté)

1. `git clone https://github.com/AlterEgo095/Kinshop-.git /opt/KINSHOP`
2. `.env` de production (PIN admin fort généré)
3. `bun install --frozen-lockfile && bunx prisma generate && bunx prisma db push`
4. `bun run build` (script package.json copie static+public dans standalone)
5. `ecosystem.config.js` PM2 → `pm2 start && pm2 save`
6. vhost nginx HTTP → `certbot certonly --webroot` → vhost HTTPS
7. Vérification : `curl https://kinshop.aenews.digital/api/platform`

Les fichiers `Caddyfile`, `deploy.sh`, `kinshop.service` (modèle
systemd/Caddy) sont conservés pour un déploiement alternatif.
