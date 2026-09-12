// KinShop — Configuration dynamique de la plateforme : DÉFAUTS & TYPES
// ⚠️ Fichier partagé client + serveur : AUCUN secret ici.
//
// Ce fichier définit la liste des paramètres administrables (clés plates,
// valeurs par défaut) et les métadonnées de sections utilisées par la console
// ADMIN. Le store réel est la table PlatformSetting (key/value) — la lecture
// et l'écriture autorisées passent par src/lib/config-registry.ts (serveur).
//
// EXTENSIBILITÉ : pour rendre un nouveau paramètre administrable, ajoute une
// entrée ici + une spec correspondante dans config-registry.ts. Il apparaît
// automatiquement dans la console ADMIN, est validé côté serveur, journalisé
// et exposé publiquement si spec.public = true. Aucune migration DB nécessaire.

export type ConfigValue = boolean | number | string | string[]

/** Configuration publique (consommée par le frontend via /api/platform). */
export type PublicConfig = Record<string, ConfigValue>

export type ConfigSectionId =
  | "general"
  | "features"
  | "plans"
  | "catalog"
  | "payments"
  | "business"
  | "boost"
  | "content"

export interface ConfigSectionMeta {
  id: ConfigSectionId
  title: string
  description: string
  icon: string // nom d'icône lucide (mappé dans la console admin)
}

/** Ordre d'affichage des sections dans la console ADMIN. */
export const CONFIG_SECTIONS: ConfigSectionMeta[] = [
  {
    id: "general",
    title: "Général",
    description: "Identité de la plateforme, taux de change et support.",
    icon: "Settings2",
  },
  {
    id: "features",
    title: "Fonctionnalités",
    description:
      "Active ou désactive instantanément des modules entiers de la plateforme. " +
      "La désactivation est appliquée côté serveur : les API correspondantes refusent les écritures (403).",
    icon: "ToggleRight",
  },
  {
    id: "plans",
    title: "Plans & quotas",
    description:
      "Limites du plan gratuit et du plan Premium, appliquées côté serveur à chaque écriture " +
      "(produits, photos, coupons, zones, factures, statistiques).",
    icon: "Gauge",
  },
  {
    id: "catalog",
    title: "Catalogue",
    description: "Catégories de produits, villes proposées et emojis de boutique.",
    icon: "LayoutGrid",
  },
  {
    id: "payments",
    title: "Paiements",
    description:
      "Moyens de paiement mobile money disponibles au checkout et leurs libellés affichés.",
    icon: "Wallet",
  },
  {
    id: "business",
    title: "Règles métier",
    description: "Règles de gouvernance de la plateforme (boutiques par compte, commandes, litiges).",
    icon: "Scale",
  },
  {
    id: "boost",
    title: "Promotion (Boost)",
    description:
      "Mise en avant payante sur la page d'accueil (sponsorisé) — indépendante de l'abonnement Premium.",
    icon: "Megaphone",
  },
  {
    id: "content",
    title: "Contenus",
    description: "Textes affichés aux utilisateurs (maintenance, pied de page, démo).",
    icon: "Type",
  },
]

/**
 * Valeurs par défaut de tous les paramètres administrables.
 * Les clés utilisent la notation plate « section.nom ».
 */
export const CONFIG_DEFAULTS: PublicConfig = {
  /* ─────────── Général ─────────── */
  "general.platformName": "KinShop",
  // Clé legacy conservée (écrite par /api/admin/settings depuis la V3) — même clé de stockage
  "defaultRateFC": 2850, // taux FC pour 1 $ (cascade sur les boutiques alignées)
  "general.supportWhatsapp": "", // numéro de support affiché si non vide

  /* ─────────── Fonctionnalités (feature flags) ─────────── */
  "feature.reviews": true, // avis clients
  "feature.coupons": true, // codes promo
  "feature.deliveryZones": true, // zones de livraison tarifées
  "feature.invoices": true, // KinFacture
  "feature.cvExpress": true, // CV Express RDC
  "feature.statusStudio": true, // Studio de statuts PNG
  "feature.customDomains": true, // domaines personnalisés
  "feature.premiumProgram": true, // programme Premium (checkout Chariow)
  "feature.demoStore": true, // bouton « Voir la démo » sur l'accueil
  "feature.orderAccounts": true, // V10 — compte client OBLIGATOIRE pour commander
  "feature.refunds": true, // V10 — demandes de remboursement (litiges)
  "feature.reports": true, // V10 — signalements (boutique/produit/commande/utilisateur)
  "feature.boost": true, // V10 — promotion payante (Boost ≠ Premium)

  /* ─────────── Plans & quotas ─────────── */
  "plan.free.maxProducts": 20,
  "plan.free.maxProductImages": 1,
  "plan.free.maxCoupons": 3,
  "plan.free.maxDeliveryZones": 5,
  "plan.free.maxInvoicesPerMonth": 15,
  "plan.free.statsDays": 7,
  "plan.free.maxStoreCategories": 10, // V10 — catégories boutique (hors défauts)
  "plan.premium.maxProducts": 500,
  "plan.premium.maxProductImages": 5,
  "plan.premium.maxCoupons": 30,
  "plan.premium.maxDeliveryZones": 25,
  "plan.premium.maxInvoicesPerMonth": 500,
  "plan.premium.statsDays": 60,
  "plan.premium.maxStoreCategories": 60, // V10
  "plan.premium.priceUSD": 3,

  /* ─────────── Catalogue ─────────── */
  "catalog.categories": [
    "Mode & Vêtements",
    "Électronique",
    "Alimentation",
    "Beauté & Cosmétiques",
    "Maison & Cuisine",
    "Divers",
  ],
  "catalog.cities": ["Kinshasa", "Lubumbashi", "Goma", "Bukavu", "Kisangani", "Matadi"],
  "catalog.storeEmojis": ["🛍️", "👗", "👟", "📱", "🍗", "💄", "🏠", "🧺", "💎", "🥑", "⚽", "🎬"],

  /* ─────────── Paiements ─────────── */
  "payment.mpesa.enabled": true,
  "payment.airtel.enabled": true,
  "payment.orange.enabled": true,
  "payment.cash.enabled": true,
  "payment.mpesa.label": "M-Pesa (Vodacom)",
  "payment.airtel.label": "Airtel Money",
  "payment.orange.label": "Orange Money",
  "payment.cash.label": "Espèces à la livraison",

  /* ─────────── Règles métier ─────────── */
  "business.maxStoresPerUser": 1, // un compte = N boutique(s)
  "business.premiumGrantMaxDays": 365, // clamp de la console admin (durée max d'un cadeau premium)
  "business.orderMaxQtyPerItem": 99, // quantité max par article d'une commande
  "business.premiumMinDays": 1, // durée min d'un cadeau premium (console admin)
  "business.maxOpenRefundsPerStore": 5, // V10 — demandes de remboursement ouvertes max par boutique

  /* ─────────── Contenus ─────────── */
  "content.maintenanceTitle": "KinShop en maintenance",
  "content.maintenanceMessage":
    "La plateforme est momentanément en maintenance. Reviens dans quelques minutes — " +
    "toutes les boutiques seront de retour très vite\u00a0!",
  "content.footerTagline": "Propulsé par KinShop — créez votre boutique en 5 minutes 🇨🇩",
  "content.demoSlug": "maman-ngo",

  /* ─────────── Promotion (Boost) ─────────── */
  "boost.price7USD": 2, // campagne 7 jours
  "boost.price30USD": 5, // campagne 30 jours
  "boost.maxActivePerStore": 1, // campagnes actives simultanées par boutique
}

/** Valeur par défaut d'une clé (fallback si la clé est absente de la config). */
export function configDefault(key: string): ConfigValue | undefined {
  return CONFIG_DEFAULTS[key]
}

/** Raccourci typé : lecture booléenne avec fallback sur le défaut. */
export function configBool(config: PublicConfig, key: string): boolean {
  const v = config[key]
  if (typeof v === "boolean") return v
  return CONFIG_DEFAULTS[key] === true
}

/** Raccourci typé : lecture numérique avec fallback sur le défaut. */
export function configNum(config: PublicConfig, key: string): number {
  const v = config[key]
  if (typeof v === "number" && Number.isFinite(v)) return v
  const d = CONFIG_DEFAULTS[key]
  return typeof d === "number" ? d : 0
}

/** Raccourci typé : lecture liste avec fallback sur le défaut. */
export function configList(config: PublicConfig, key: string): string[] {
  const v = config[key]
  if (Array.isArray(v)) return v
  const d = CONFIG_DEFAULTS[key]
  return Array.isArray(d) ? d : []
}

/** Raccourci typé : lecture chaîne avec fallback sur le défaut. */
export function configStr(config: PublicConfig, key: string): string {
  const v = config[key]
  if (typeof v === "string") return v
  const d = CONFIG_DEFAULTS[key]
  return typeof d === "string" ? d : ""
}
