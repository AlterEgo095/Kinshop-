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
│       └── orders/           # Commandes (totaux recalculés côté serveur)
├── components/kinshop/
│   ├── landing.tsx           # Landing page (hero, features, FAQ, CTA)
│   ├── create-wizard.tsx     # Assistant création boutique (3 étapes)
│   ├── dashboard.tsx         # Tableau de bord vendeur
│   ├── store-view.tsx        # Boutique publique + panier + checkout
│   └── kinshop-app.tsx       # Routeur à états + deep-linking
└── lib/
    └── kinshop.ts            # Helpers : format FC/USD, liens WhatsApp, slugs
prisma/schema.prisma          # Models : Store, Product, Order
```

## 🔒 Points de sécurité

- Les **totaux des commandes sont recalculés côté serveur** à partir de la base de données (jamais de confiance aux prix envoyés par le client)
- Numéros de téléphone normalisés au format international `+243`
- Slug de boutique unique et validé côté API

## 🗺️ Roadmap

- [ ] V2 : Paiement mobile money intégré (API opérateurs)
- [ ] V2 : Notifications commandes par SMS
- [ ] V2 : Statistiques avancées (vues boutique, produits stars)
- [ ] V3 : Générateur de CV Express RDC
- [ ] V3 : KinFacture — factures pro avec QR de paiement

## 📄 Licence

MIT — Fait avec ❤️ à Kinshasa pour les entrepreneurs congolais.
