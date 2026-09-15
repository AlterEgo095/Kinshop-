// KinShop — Types & référence des plans (client + serveur)
// ⚠️ Fichier partagé client + serveur : AUCUN secret ici.
//
// DEPUIS LA V9 (centre de contrôle dynamique) : les QUOTAS et le prix Premium
// sont des paramètres administrables depuis la console ADMIN (clés
// plan.free.* / plan.premium.* dans la table PlatformSetting). Le serveur lit
// les valeurs réelles via getPlanQuotas() (src/lib/config-registry.ts) à
// CHAQUE vérification — ce fichier ne fournit plus que :
//   - les TYPES partagés (PlanId, PlanQuota),
//   - les DÉFAUTS de référence pour le frontend (affichage, fallback hors ligne),
//   - la détection du plan effectif d'une boutique (isPremiumActive / planOf).
// Modifier un quota = console ADMIN, sans intervention dans le code.

export type PlanId = "free" | "premium"

export interface PlanQuota {
  id: PlanId
  label: string
  priceUSD: number | null
  /** Nombre maximum de produits de la boutique */
  maxProducts: number
  /** Nombre maximum de photos par produit */
  maxProductImages: number
  /** Mission Premium — longueur max de la description produit (0 = fonctionnalité verrouillée) */
  maxDescriptionChars: number
  /** Mission Premium — nombre max de caractéristiques structurées (0 = fonctionnalité verrouillée) */
  maxSpecs: number
  /** Nombre maximum de codes promo */
  maxCoupons: number
  /** Nombre maximum de zones de livraison */
  maxDeliveryZones: number
  /** Factures KinFacture par mois civile (UTC) */
  maxInvoicesPerMonth: number
  /** Historique maximal des statistiques (jours) */
  statsDays: number
  /** Domaine personnalisé (V7) */
  customDomain: boolean
  /** Badge vérifié + mise en avant */
  verifiedBadge: boolean
  /** Support WhatsApp prioritaire */
  prioritySupport: boolean
}

/** Défauts de référence (fallback frontend). La source de vérité serveur = config dynamique. */
export const PLANS: Record<PlanId, PlanQuota> = {
  free: {
    id: "free",
    label: "Free",
    priceUSD: 0,
    maxProducts: 20,
    maxProductImages: 1,
    maxDescriptionChars: 0,
    maxSpecs: 0,
    maxCoupons: 3,
    maxDeliveryZones: 5,
    maxInvoicesPerMonth: 15,
    statsDays: 7,
    customDomain: false,
    verifiedBadge: false,
    prioritySupport: false,
  },
  premium: {
    id: "premium",
    label: "Premium",
    priceUSD: 3,
    maxProducts: 500,
    maxProductImages: 5,
    maxDescriptionChars: 3000,
    maxSpecs: 12,
    maxCoupons: 30,
    maxDeliveryZones: 25,
    maxInvoicesPerMonth: 500,
    statsDays: 60,
    customDomain: true,
    verifiedBadge: true,
    prioritySupport: true,
  },
}

/** Indique si l'abonnement Premium de la boutique est réellement actif (date incluse). */
export function isPremiumActive(store: {
  isPremium: boolean
  premiumUntil?: Date | string | null
}): boolean {
  if (!store.isPremium) return false
  if (!store.premiumUntil) return false
  return new Date(store.premiumUntil).getTime() > Date.now()
}

/** Plan effectif d'une boutique, calculé à partir de l'état réel de l'abonnement. */
export function planOf(store: {
  isPremium: boolean
  premiumUntil?: Date | string | null
}): PlanQuota {
  return isPremiumActive(store) ? PLANS.premium : PLANS.free
}
