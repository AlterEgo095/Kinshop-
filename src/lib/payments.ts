// KinShop V10 — Abstraction des fournisseurs de paiement (server-only)
//
// PRINCIPE : aucun opérateur n'est codé en dur dans les routes métier.
// Ajouter un fournisseur = ajouter un adaptateur ici + (si mobile money) les
// clés config payment.<id>.enabled / payment.<id>.label gérées par l'ADMIN.
// Le routeur métier n'appelle QUE l'interface PaymentProvider.

import { getConfigValue } from "@/lib/config-registry"
import type { PaymentMethod } from "@/lib/kinshop"

export type PaymentKind = "mobile_money" | "cash"

export interface PaymentInitiation {
  status: "pending" | "cash_pending"
  providerRef: string
  instructions?: string
}

export interface PaymentProvider {
  id: PaymentMethod
  kind: PaymentKind
  /** Le client choisit ce moyen à la commande → état initial du paiement. */
  initiate(params: { orderRef: string; payerPhone: string; totalFC: number }): Promise<PaymentInitiation>
  /** Le paiement peut-il être confirmé automatiquement (webhook/simulation agrégateur) ? */
  autoConfirmable: boolean
  /** Qui a le droit de confirmer l'encaissement réel : "system" (agrégateur) ou "owner" (espèces). */
  confirmAuthority: "system" | "owner"
}

/* ─────────── Adaptateurs mobile money (simulation tant que l'agrégateur réel
   n'est pas branché — la signature réseau reste identique) ─────────── */

function mobileMoneyProvider(id: PaymentMethod, label: string): PaymentProvider {
  return {
    id,
    kind: "mobile_money",
    autoConfirmable: true,
    confirmAuthority: "system",
    async initiate({ orderRef, payerPhone, totalFC }) {
      // Simulation d'initiation : la référence réelle viendra de l'agrégateur.
      // Le flux réel (API opérateur) se branche ICI sans toucher aux routes métier.
      const ref = `SIM-${id.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`
      return {
        status: "pending",
        providerRef: ref,
        instructions: `Confirme le paiement de ${totalFC} FC sur ${label} (réf ${ref}) avec le numéro ${payerPhone}.`,
      }
    },
  }
}

/* ─────────── Espèces à la livraison : JAMAIS « payée » automatiquement.
   L'encaissement est confirmé par le vendeur (ou l'admin) après remise du
   produit — avec preuve notée dans l'historique. ─────────── */

const cashOnDeliveryProvider: PaymentProvider = {
  id: "cash",
  kind: "cash",
  autoConfirmable: false,
  confirmAuthority: "owner",
  async initiate({ orderRef }) {
    return {
      status: "cash_pending",
      providerRef: `COD-${orderRef}`,
      instructions:
        "Prépare le montant exact en espèces. Le paiement sera encaissé à la remise du colis, puis confirmé par le vendeur.",
    }
  },
}

/* ─────────── Registre ─────────── */

const PROVIDERS: Record<PaymentMethod, PaymentProvider> = {
  mpesa: mobileMoneyProvider("mpesa", "M-Pesa (Vodacom)"),
  airtel: mobileMoneyProvider("airtel", "Airtel Money"),
  orange: mobileMoneyProvider("orange", "Orange Money"),
  cash: cashOnDeliveryProvider,
}

/** Fournisseur actif (config admin) pour une méthode demandée, sinon null. */
export async function resolveProvider(method: string): Promise<PaymentProvider | null> {
  const enabled = await getEnabledPaymentMethods()
  if (!enabled.includes(method as PaymentMethod)) return null
  return PROVIDERS[method as PaymentMethod] ?? null
}

/** Méthodes actives (config admin) — délègue au registry de configuration. */
export async function getEnabledPaymentMethods(): Promise<PaymentMethod[]> {
  const { getEnabledPayments } = await import("@/lib/config-registry")
  return getEnabledPayments()
}

/** Quantité de configuration d'un moyen (libellé affiché, administrable). */
export async function paymentLabel(method: PaymentMethod): Promise<string> {
  return getConfigValue<string>(`payment.${method}.label`)
}
