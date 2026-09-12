// KinShop — Matrice des plans & quotas (V8)
// ⚠️ Fichier partagé client + serveur : AUCUN secret ici.
// Les quotas sont appliqués CÔTÉ SERVEUR (routes API) — le frontend ne fait
// qu'afficher les limites ; il ne constitue jamais une mesure de sécurité.

export type PlanId = "free" | "premium"

export interface PlanQuota {
  id: PlanId
  label: string
  priceUSD: number | null
  /** Nombre maximum de produits de la boutique */
  maxProducts: number
  /** Nombre maximum de photos par produit */
  maxProductImages: number
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

export const PLANS: Record<PlanId, PlanQuota> = {
  free: {
    id: "free",
    label: "Free",
    priceUSD: 0,
    maxProducts: 20,
    maxProductImages: 1,
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
    maxCoupons: 30,
    maxDeliveryZones: 25,
    maxInvoicesPerMonth: 500,
    statsDays: 60,
    customDomain: true,
    verifiedBadge: true,
    prioritySupport: true,
  },
}

/** Un utilisateur = une boutique (règle produit V8, appliquée côté serveur). */
export const MAX_STORES_PER_USER = 1

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
