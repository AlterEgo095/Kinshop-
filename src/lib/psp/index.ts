// KinShop — COUCHE PSP DES REVENUS (Phase F — Futur PSP)
// ⚠️ Server-only : à importer uniquement dans les routes API et libs serveur.
//
// RÔLE : point d'extension documenté pour les fournisseurs de paiement des
// REVENUS KinShop (Premium, Boost, futurs produits à prix fixe). Chariow est
// la première implémentation ; un PSP futur (agrégateur direct, FlexPay
// compte marchand dédié,…) implémentera le même contrat et s'enregistrera
// dans `getRevenuePSP()` — sans toucher aux routes appelantes.
//
// ⚠️ RÈGLES PLATEFORME (source de vérité — PROMPT MAÎTRE, non négociables) :
//   1. Un PSP « revenus » encaisse UNIQUEMENT des PRIX FIXES KinShop
//      (abonnements, boosts, produits fixes). Les MONTANTS DYNAMIQUES des
//      commandes marketplace ne passent JAMAIS par cette couche — elles
//      suivent le paiement direct vendeur / mobile money / COD.
//   2. L'activation d'un abonnement est TOUJOURS VALIDÉE CÔTÉ SERVEUR :
//      vente vérifiée auprès du PSP, rattachement contrôlé (métadonnées
//      écrites par notre serveur au checkout), idempotence par vente.
//   3. Chaque activation est JOURNALISÉE dans la chaîne d'audit
//      (premium.activated / boost.paid — opérations sensibles).
//   4. Le canal est coupable À CHAUD : `payments.chariowEnabled` (console
//      ADMIN → Paiements) — checkout refusé, webhook sans activation.
//   5. Toute nouvelle implémentation respecte `assertChariowRevenueScope`
//      (ou son équivalent) : refus structurel des métadonnées de commande.
//
// Historique : Phase F « Futur PSP avec Chariow » (2026-09-21) — les routes
// API existantes continuent d'appeler `lib/chariow.ts` directement (diff
// minimal, zéro régression) ; cette couche est le contrat d'entrée pour toute
// EXTENSION future (nouveau PSP, nouveau produit de revenus).

import { getChariowRevenuePSP } from "./chariow"

/* ─────────── Contrat ─────────── */

export interface RevenueCheckoutRequest {
  /** Produit de revenu à prix fixe (déjà résolu depuis la configuration). */
  productId: string
  email: string
  firstName: string
  lastName: string
  /** Optionnel — préremplissage du paiement mobile money (la page PSP collecte sinon). */
  phoneDigits?: string
  redirectUrl: string
  /**
   * Métadonnées serveur écrites AU CHECKOUT (rattachement de la vente).
   * INTERDIT : toute clé de commande marketplace (order_ref/order_id/amount/…)
   * — refusé par le garde-fou du PSP (règle 1).
   */
  metadata: Record<string, string>
  paymentCurrency?: string
  customerIp?: string
}

export interface RevenueCheckoutSession {
  url: string | null
  saleId: string | null
  transactionId: string | null
}

export interface RevenueSale {
  id: string
  status: string
  paymentStatus: string | null
  completedAt: string | null
  customerEmail: string | null
  productId: string | null
}

export interface RevenuePSP {
  /** Identifiant stable du fournisseur (ex: "chariow"). */
  readonly id: string
  readonly displayName: string
  /** Canal actif ? (configuration complète ET kill-switch non armé) */
  isLive(): Promise<boolean>
  /** Canal explicitement coupé par l'administration ? */
  isDisabled(): Promise<boolean>
  /** Ouvre une session checkout à PRIX FIXE (montant = prix du produit côté PSP). */
  createCheckout(req: RevenueCheckoutRequest): Promise<RevenueCheckoutSession>
  /** Relit une vente côté PSP (vérification serveur avant activation). */
  fetchSale(saleId: string): Promise<RevenueSale | null>
  /** Vérifie la signature HMAC du webhook (corps brut). */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean
}

/* ─────────── Registre ─────────── */

/**
 * PSP des revenus KinShop actif. Un futur fournisseur s'ajoute ici :
 *   const psps: Record<string, () => RevenuePSP> = { chariow: getChariowRevenuePSP, flexpay: getFlexpayRevenuePSP }
 * puis résolution par configuration (`payments.revenuePSP`).
 */
export function getRevenuePSP(): RevenuePSP | null {
  return getChariowRevenuePSP()
}
