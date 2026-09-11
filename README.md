# 🛍️ KinShop

> **Transformez votre statut WhatsApp en véritable boutique en ligne — en 5 minutes.**

KinShop est la plateforme e-commerce pensée pour les **entrepreneurs de la République Démocratique du Congo** 🇨🇩. Créez votre boutique, partagez le lien sur WhatsApp ou Facebook, et recevez vos commandes directement — avec paiement mobile money (M-Pesa, Airtel Money, Orange Money).

![KinShop](public/images/hero-kinshop.png)

---

## ✨ Pourquoi KinShop ?

En RDC, des millions de vendeurs vendent via WhatsApp et Facebook, mais **sans catalogue, sans suivi de commandes, sans paiement intégré**. KinShop résout ce problème :

| Avant 😩 | Avec KinShop 🚀 |
|---|---|
| Photos perdues dans le statut | Catalogue pro avec prix en **FC et USD** |
| Commandes par messages éparpillés | Suivi des commandes (nouvelle → confirmée → livrée) |
| Coordonnées bancaires compliquées | Boutons **M-Pesa / Airtel Money / Orange Money** |
| Aucune image de marque | Lien unique `kinshop.cd/#/boutique/votre-nom` |

## 🔁 La boucle virale

Chaque boutique KinShop affiche fièrement **« Propulsé par KinShop »**. Chaque client qui visite une boutique découvre la plateforme → les vendeurs recrutent des vendeurs → **croissance auto-entretenue à coût marketing zéro**.

## ⚡ Fonctionnalités (V1)

- 🏪 **Création de boutique en 3 étapes** — nom, emoji, slug personnalisé, produits initiaux
- 📦 **Catalogue produits** — photos, prix en Francs Congolais + conversion USD automatique, catégories
- 🛒 **Boutique publique partageable** — recherche, filtres par catégorie, panier
- 💬 **Commande via WhatsApp** — message prérempli avec le récapitulatif complet envoyé au vendeur
- 💰 **Paiement mobile money** — M-Pesa, Airtel Money, Orange Money ou espèces à la livraison
- 📊 **Tableau de bord vendeur** — statistiques, gestion produits/commandes, réglages boutique
- 📱 **Mobile-first** — conçu pour les smartphones, réseau 3G, zones urbaines de Kinshasa
- 🔗 **Deep-link** — `#/boutique/{slug}` : le lien survit au partage et au reload

## 🚀 Fonctionnalités V2

- 💳 **Paiement mobile money en ligne des commandes** — push USSD vers le téléphone du client (M-Pesa, Airtel Money, Orange Money via agrégateur type FlexPay), confirmation automatique par webhook, polling temps réel côté client, mode simulation intégré pour la démo
- 📊 **Statistiques vendeur avancées** — vues de la boutique (dédupliquées par session), tendance 7 j, taux de conversion, panier moyen, produits stars, entonnoir des statuts, répartition des paiements, clients fidèles
- 🔔 **Notifications SMS** — alerte vendeur + confirmation client à chaque commande (compatible Africa's Talking, mode simulation par défaut), journal dans l'onglet Alertes
- 💵 **Paiement espèces** — le vendeur enregistre « Paiement reçu » à la livraison

## 🧰 Stack technique

| Technologie | Usage |
|---|---|
| **Next.js 16** (App Router) | Framework full-stack React |
| **TypeScript 5** | Typage strict de bout en bout |
| **Tailwind CSS 4** | Design mobile-first, thème emerald/ambre |
| **shadcn/ui** | Composants UI accessibles |
| **Prisma + SQLite** | Persistance (Store, Product, Order) |
| **Framer Motion** | Animations fluides |
| **wa.me deep links** | Confirmation de commande via WhatsApp |

## 🚀 Démarrage rapide

```bash
# 1. Installer les dépendances
bun install

# 2. Configurer la base de données
bun run db:push

# 3. (Optionnel) Charger la boutique démo « Boutique Maman Ngo »
bun run scripts/seed-kinshop.ts

# 4. Lancer le serveur de développement
bun run dev
```

Ouvrez l'application → créez votre boutique → partagez votre lien sur votre statut WhatsApp 🎉

> 💡 **Astuce démo** : ouvrez `#/boutique/maman-ngo` pour voir une boutique d'exemple avec 12 produits et des commandes.

## 📁 Structure du projet

```
src/
├── app/
│   ├── page.tsx              # Point d'entrée (route unique)
│   └── api/
│       ├── stores/           # Création / lecture / réglages boutique
│       ├── products/         # Ajout / suppression produits
│       ├── orders/           # Commandes (totaux recalculés côté serveur)
│       ├── payments/         # V2 : initiate · status · webhook · simulate-confirm
│       ├── stats/            # V2 : statistiques vendeur (vues, conversion, produits stars)
│       ├── notifications/    # V2 : journal SMS
│       └── analytics/visit/  # V2 : compteur de visites boutique
├── components/kinshop/
│   ├── landing.tsx           # Landing page (hero, features, FAQ, CTA)
│   ├── create-wizard.tsx     # Assistant création boutique (3 étapes)
│   ├── dashboard.tsx         # Tableau de bord vendeur (+ Stats & Alertes V2)
│   ├── store-view.tsx        # Boutique publique + panier + checkout + paiement USSD
│   ├── status-studio.tsx     # Générateur d'image statut WhatsApp (QR code)
│   ├── admin-console.tsx     # Console d'administration (#/admin, PIN)
│   └── kinshop-app.tsx       # Routeur à états + deep-linking
└── lib/
    ├── kinshop.ts            # Helpers : format FC/USD, liens WhatsApp, slugs
    ├── chariow.ts            # Checkout + webhook Chariow (Pulses)
    ├── mobile-money.ts       # V2 : paiement commandes (agrégateur FlexPay/simulation)
    └── notifier.ts           # V2 : SMS vendeur/client (Africa's Talking/simulation)
prisma/schema.prisma          # Models : Store, Product, Order, PulseDelivery, StoreVisit, NotificationLog, PlatformSetting, AdminAction
```

## 🛡️ Console d'administration

Accessible via le lien discret « Espace admin » en pied de page ou directement sur `#/admin` :

- **Authentification par PIN** (`ADMIN_PIN` dans `.env`, par défaut `243243` en démo)
- **Vue d'ensemble** : KPIs temps réel (boutiques, premium, GMV), graphique des commandes sur 14 jours, répartition des moyens de paiement, top boutiques, alertes premium expirants
- **Boutiques** : recherche/filtres, suspendre · réactiver, accorder/révoquer le Premium (+30 j/+90 j/+1 an), contact WhatsApp propriétaire, suppression cascade
- **Commandes** : filtres (statut **+ statut de paiement V2**), changement de statut, confirmation manuelle de paiement, détail complet, contact client, suppression
- **Produits** : filtres par boutique/catégorie, ajustement du stock, suppression
- **Paramètres plateforme** : mode maintenance global, bandeau d'annonce (affiché sur toutes les boutiques), taux FC/USD par défaut des nouvelles boutiques
- **Journaux** : audit de toutes les actions admin + livraisons des webhooks Chariow (Pulses)

## 💳 Paiement mobile money des commandes (V2)

Le checkout des boutiques propose un **vrai parcours de paiement** :

1. Le client choisit M-Pesa / Airtel Money / Orange Money → il renseigne le numéro à débiter
2. Un **push USSD** est envoyé sur son téléphone (via l'agrégateur) → il valide avec son PIN
3. KinShop est notifié par **webhook** (`/api/payments/webhook`) → la commande passe « Payée en ligne » automatiquement, côté client (polling 4 s) comme côté vendeur

**Deux modes** (variables `.env`) :

| Mode | Configuration | Comportement |
|---|---|---|
| **Simulation** (défaut) | `MOMO_TOKEN` vide | Push simulé, bouton « J'ai validé le PIN (démo) » — parfait pour tester |
| **Live** | `MOMO_TOKEN` + `MOMO_MERCHANT` (+ `MOMO_CALLBACK_TOKEN`) | Push USSD réel M-Pesa/Airtel/Orange via l'agrégateur (pattern FlexPay), simulation désactivée (403) |

Les commandes payées en espèces restent marquées « À la livraison » — le vendeur enregistre « Paiement reçu » à la remise.

## 🔒 Points de sécurité

- Les **totaux des commandes sont recalculés côté serveur** à partir de la base de données (jamais de confiance aux prix envoyés par le client)
- Numéros de téléphone normalisés au format international `+243`
- Slug de boutique unique et validé côté API
- Console admin protégée par **PIN vérifié côté serveur** sur chaque requête (`x-admin-pin`), avec **journal d'audit** de toutes les actions
- Webhooks Chariow signés **HMAC-SHA256** + idempotence en base
- Webhook mobile money protégé par **token de callback** (`MOMO_CALLBACK_TOKEN`) + idempotence ; la simulation de confirmation est **refusée (403)** en mode live

## 🗺️ Roadmap

- [x] ~~V2 : Paiement mobile money intégré~~ ✅ Chariow (abonnement Premium) + **paiement en ligne des commandes** (push USSD M-Pesa/Airtel/Orange)
- [x] ~~V2 : Générateur d'image statut WhatsApp~~ ✅ Studio Statut avec QR code
- [x] ~~V2 : Console d'administration plateforme~~ ✅ `#/admin`
- [x] ~~V2 : Notifications commandes par SMS~~ ✅ journal vendeur/client (Africa's Talking ready)
- [x] ~~V2 : Statistiques avancées~~ ✅ vues boutique, conversion, produits stars, clients fidèles
- [ ] V3 : Générateur de CV Express RDC
- [ ] V3 : KinFacture — factures pro avec QR de paiement

## 📄 Licence

MIT — Fait avec ❤️ à Kinshasa pour les entrepreneurs congolais.
