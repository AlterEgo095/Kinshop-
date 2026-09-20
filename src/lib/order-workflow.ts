// KinShop V10 — Workflow commandes / paiements / livraisons (client + serveur)
// ⚠️ Aucun secret ici. Les graphes de transitions ci-dessous sont appliqués
// CÔTÉ SERVEUR (src/app/api/orders/*) : le frontend ne fait que les afficher.

/* ─────────── Statuts commande (dimension 1) ───────────
   new → confirmed → processing → ready → out_for_delivery → delivered
   Exceptions : cancelled (avant livraison), returned, refunded, disputed.
   Les statuts legacy V2 (paid) restent valides pour les anciennes commandes. */
export type OrderStatus =
  | "new"
  | "paid"
  | "confirmed"
  | "processing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "returned"
  | "refunded"
  | "disputed"

export const ORDER_STATUSES: OrderStatus[] = [
  "new", "paid", "confirmed", "processing", "ready", "out_for_delivery",
  "delivered", "cancelled", "returned", "refunded", "disputed",
]

/** Transitions autorisées — TOUTE écriture passe par cette carte (autorité serveur). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  paid: ["confirmed", "cancelled"],
  confirmed: ["processing", "ready", "delivered", "cancelled"],
  processing: ["ready", "out_for_delivery", "delivered", "cancelled"],
  ready: ["out_for_delivery", "delivered", "cancelled"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned", "refunded", "disputed"],
  cancelled: [], // terminal
  returned: ["refunded"],
  refunded: [], // terminal
  disputed: ["refunded", "cancelled"],
}

export function canTransitionOrder(from: string, to: string): boolean {
  const allowed = ORDER_TRANSITIONS[from as OrderStatus]
  return Array.isArray(allowed) && allowed.includes(to as OrderStatus)
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Nouvelle",
  paid: "Payée en ligne",
  confirmed: "Confirmée",
  processing: "En préparation",
  ready: "Prête pour livraison",
  out_for_delivery: "En livraison",
  delivered: "Livrée",
  cancelled: "Annulée",
  returned: "Retournée",
  refunded: "Remboursée",
  disputed: "En litige",
}

/* ─────────── Statuts paiement (dimension 2) ───────────
   cash_pending = espèces à la livraison déclarées (jamais « payée » tant que le
   vendeur/admin n'a pas confirmé l'encaissement). refunded = remboursé.
   P1 (Phase C) — declared = l'acheteur a déclaré « J'ai effectué le paiement »
   sur son transfert Mobile Money direct au vendeur. État INTERMÉDIAIRE de la
   machine UNPAID → DECLARED → PAID : une déclaration ne devient JAMAIS un
   paiement confirmé par elle-même — seul le vendeur (ou l'admin) confirme
   l'encaissement vérifié dans son compte opérateur. */
export type PaymentStatus = "unpaid" | "declared" | "pending" | "cash_pending" | "paid" | "failed" | "refunded"

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid", "declared", "pending", "cash_pending", "paid", "failed", "refunded",
]

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Non payée",
  declared: "Paiement déclaré — à confirmer",
  pending: "Paiement en cours",
  cash_pending: "À payer à la livraison",
  paid: "Payée",
  failed: "Paiement échoué",
  refunded: "Remboursée",
}

/* ─────────── Statuts livraison (dimension 3, indépendante) ─────────── */
export type DeliveryStatus =
  | "not_assigned"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"

export const DELIVERY_STATUSES: DeliveryStatus[] = [
  "not_assigned", "assigned", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed", "returned",
]

export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  not_assigned: ["assigned"],
  assigned: ["picked_up", "in_transit", "out_for_delivery", "delivered", "failed"],
  picked_up: ["in_transit", "out_for_delivery", "delivered", "failed"],
  in_transit: ["out_for_delivery", "delivered", "failed"],
  out_for_delivery: ["delivered", "failed"],
  failed: ["assigned", "returned"], // relance (attempts+1) ou retour
  delivered: [], // terminal (le retour éventuel se gère au niveau commande)
  returned: [], // terminal
}

export function canTransitionDelivery(from: string, to: string): boolean {
  const allowed = DELIVERY_TRANSITIONS[from as DeliveryStatus]
  return Array.isArray(allowed) && allowed.includes(to as DeliveryStatus)
}

export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  not_assigned: "Non assignée",
  assigned: "Assignée à la livraison",
  picked_up: "Colis récupéré",
  in_transit: "En transit",
  out_for_delivery: "En cours de remise",
  delivered: "Livrée",
  failed: "Échec de livraison",
  returned: "Retournée au vendeur",
}

/* ─────────── Motifs structurés d'échec de livraison ───────────
   Obligatoires : une livraison ne peut JAMAIS passer en failed sans motif.
   Les traces ne sont jamais supprimées. */
export const DELIVERY_FAILURE_REASONS = [
  "client_absent",
  "adresse_incorrecte",
  "client_injoignable",
  "produit_indisponible",
  "probleme_logistique",
  "refus_client",
  "autre",
] as const

export const DELIVERY_FAILURE_LABELS: Record<string, string> = {
  client_absent: "Client absent",
  adresse_incorrecte: "Adresse incorrecte",
  client_injoignable: "Client injoignable",
  produit_indisponible: "Produit indisponible",
  probleme_logistique: "Problème logistique",
  refus_client: "Refus du client",
  autre: "Autre",
}

/* ─────────── Types d'événements de commande ─────────── */
export type OrderEventType =
  | "created"
  | "status_changed"
  | "payment_selected"
  | "payment_declared"
  | "payment_proof" // Phase D — preuve photographique jointe (jamais publique)
  | "payment_confirmed"
  | "payment_failed"
  | "delivery_updated"
  | "delivery_failed"
  | "delivery_retry"
  | "delivery_returned"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_executed"
  | "invoice_generated"
  | "invoice_cancelled"
  | "note"

/* Types d'événements visibles publiquement par le client (suivi) :
   on exclut les détails internes (montants remboursés, notes vendeur…).
   P1 (Phase C) — payment_declared est sûr publiquement : la route de suivi
   public en masque la charge (référence déclarée, note) et n'expose que le
   badge d'état « Paiement déclaré ».
   Phase D — payment_proof est volontairement ABSENT de cette liste : la
   capture du transfert n'est JAMAIS publique (acheteur, vendeur propriétaire
   et admin uniquement — route /api/orders/payment-proof). */
export const PUBLIC_EVENT_TYPES: OrderEventType[] = [
  "created",
  "status_changed",
  "payment_declared",
  "payment_confirmed",
  "delivery_updated",
  "delivery_failed",
  "delivery_retry",
  "delivery_returned",
  "refund_executed",
]

export const EVENT_TYPE_LABELS: Record<string, string> = {
  created: "Commande créée",
  status_changed: "Statut mis à jour",
  payment_selected: "Moyen de paiement choisi",
  payment_declared: "Paiement déclaré par le client",
  payment_proof: "Preuve de paiement jointe",
  payment_confirmed: "Paiement confirmé",
  payment_failed: "Paiement échoué",
  delivery_updated: "Livraison mise à jour",
  delivery_failed: "Échec de livraison",
  delivery_retry: "Nouvelle tentative de livraison",
  delivery_returned: "Retour au vendeur",
  refund_requested: "Remboursement demandé",
  refund_approved: "Remboursement approuvé",
  refund_rejected: "Remboursement refusé",
  refund_executed: "Remboursement exécuté",
  invoice_generated: "Facture générée",
  invoice_cancelled: "Facture annulée",
  note: "Note",
}

/* ─────────── Options de livraison (module boutique) ─────────── */
export type DeliveryKind = "standard" | "express" | "pickup" | "local" | "national"

export const DELIVERY_KINDS: DeliveryKind[] = ["standard", "express", "pickup", "local", "national"]

export const DELIVERY_KIND_LABELS: Record<DeliveryKind, string> = {
  standard: "Livraison standard",
  express: "Livraison express",
  pickup: "Retrait en boutique",
  local: "Livraison locale",
  national: "Livraison nationale",
}

/* ─────────── Signalements ─────────── */
export const REPORT_TARGET_TYPES = ["store", "product", "order", "user"] as const
export const REPORT_REASONS = ["arnaque", "produit_non_conforme", "livraison", "comportement", "autre"] as const
export const REPORT_REASON_LABELS: Record<string, string> = {
  arnaque: "Arnaque / fraude suspectée",
  produit_non_conforme: "Produit non conforme",
  livraison: "Problème de livraison",
  comportement: "Comportement inapproprié",
  autre: "Autre",
}
export const REPORT_STATUSES = ["open", "under_review", "action_required", "resolved", "dismissed"] as const
export const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "Ouvert",
  under_review: "En analyse",
  action_required: "Action requise",
  resolved: "Résolu",
  dismissed: "Rejeté (non fondé)",
}

/* ─────────── Remboursements ─────────── */
export const REFUND_STATUSES = ["requested", "approved", "rejected", "executed"] as const
export const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: "Demandé",
  approved: "Approuvé (en attente d'exécution)",
  rejected: "Refusé",
  executed: "Exécuté",
}
export const REFUND_METHODS = ["mobile_money", "cash", "other"] as const
export const REFUND_METHOD_LABELS: Record<string, string> = {
  mobile_money: "Mobile Money",
  cash: "Espèces",
  other: "Autre",
}
