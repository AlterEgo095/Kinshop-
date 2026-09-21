// ─────────────────────────────────────────────────────────────────────────────
// Phase E — Ledger financier « mode ombre » (double écriture d'observation)
// ─────────────────────────────────────────────────────────────────────────────
//
// RÔLE : chaque fait d'argent DÉJÀ vérifié par le flux métier (confirmation
// vendeur d'un encaissement direct, encaissement espèces, vente Chariow du
// produit Premium/Boost configuré, remboursement exécuté) est COPIÉ dans un
// journal financier append-only, en plus des tables métier existantes — sans
// jamais les remplacer ni les précéder.
//
// RÈGLES D'ARCHITECTURE (source de vérité — rapport financier 38 p., §10-13) :
//   • MODE OMBRE : le ledger n'interrompt JAMAIS un flux métier — une écriture
//     échouée est journalisée en erreur serveur (visible par la réconciliation
//     admin) et le parcours utilisateur continue à l'identique ;
//   • IDEMPOTENCE SQL : @@unique([psPSource, reference, type]) — un événement
//     = UNE écriture (webhook rejoué, confirmation répétée, course d'instances
//     jumelles → une seule ligne) ; contrôle anticipé AVANT écriture (leçon
//     Phase B) + create protégé par l'index (course concurrente) ;
//   • MONTANTS CÔTÉ SERVEUR UNIQUEMENT : le montant écrit vient de la commande
//     (totalFC recalculé serveur) ou du payload vérifié Chariow (sale.amount) —
//     JAMAIS d'une entrée client ; AUCUNE conversion silencieuse (une écriture
//     garde sa devise native : FC pour le marketplace, USD pour Chariow) ;
//   • SANS FAUX MÉCANISMES : commission figée à 0 (aucun prélèvement réel — la
//     clé finance.commissionPercent reste inerte) ; pas de solde stocké (les
//     agrégats se calculent depuis les écritures) ; pas d'exposition vendeur
//     (aucune API /api/wallet, aucun écran vendeur) — lecture admin seule.
//
// MACHINE D'ÉTATS DES ÉCRITURES (réservée) : PENDING → CONFIRMED → AVAILABLE.
// Le mode ombre écrit directement CONFIRMED (le fait d'argent est déjà vérifié
// par le flux métier au moment de l'écriture) ; AVAILABLE sera mobilisé par la
// future machinerie de retraits (P10 — décision business, hors Phase E).

import { db } from "@/lib/db"

export const LEDGER_ENTRY_TYPES = [
  "SALE", // encaissement Mobile Money direct confirmé (vendeur)
  "DELIVERY_CASH", // encaissement espèces confirmé (vendeur)
  "REFUND", // remboursement exécuté (contrepartie négative)
  "ADJUSTMENT", // correction contrôlée (réservé — jamais écrit en Phase E)
] as const
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

export const LEDGER_ENTRY_STATUSES = ["PENDING", "CONFIRMED", "AVAILABLE"] as const

/** scope vendor = mouvement d'argent vendeur · platform = revenu KinShop (Chariow). */
export const LEDGER_SCOPES = ["vendor", "platform"] as const

/** Sources de vérité du fait d'argent. */
export const LEDGER_SOURCES = ["direct", "cash", "chariow", "refund", "admin"] as const

/* ─────────── Wallet (regroupement par boutique — AUCUN solde stocké) ─────────── */

/**
 * Retourne l'id du wallet de la boutique, créé paresseusement au premier
 * besoin. Retourne null en cas d'échec (le ledger en mode ombre ne bloque
 * jamais le flux appelant).
 */
export async function getOrCreateWalletId(storeId: string): Promise<string | null> {
  try {
    const existing = await db.wallet.findUnique({ where: { storeId } })
    if (existing) return existing.id
    const created = await db.wallet.create({ data: { storeId } })
    return created.id
  } catch {
    // Course concurrente (deux confirmations simultanées) → relecture simple.
    try {
      const existing = await db.wallet.findUnique({ where: { storeId } })
      if (existing) return existing.id
    } catch {
      /* ignoré */
    }
    return null
  }
}

/* ─────────── Écritures idempotentes (JAMAIS bloquantes) ─────────── */

interface LedgerWriteInput {
  scope: "vendor" | "platform"
  kind: string // premium | boost | order | collection (contexte métier de reporting)
  type: LedgerEntryType
  amount: number // signe porté : crédit vendeur/revenu > 0, débit < 0
  currency: string // FC (marketplace) ou USD (Chariow) — jamais converti
  psPSource: string // direct | cash | chariow | refund
  reference: string // clé d'idempotence métier (orderId ou saleId/refundId)
  storeId?: string | null // contexte reporting (survit à la boutique)
  walletId?: string | null // obligatoire pour scope vendor
  orderId?: string | null
  note: string
}

/**
 * Écrit une entrée de ledger de façon IDEMPOTENTE et NON BLOQUANTE.
 * Retourne true si l'écriture a eu lieu, false si elle existait déjà ou a
 * échoué (erreur journalisée côté serveur — réconciliation admin).
 */
export async function recordLedgerEntry(w: LedgerWriteInput): Promise<boolean> {
  try {
    // Contrôle d'idempotence AVANT toute écriture (leçon Phase B : le create
    // d'une première livraison ne doit jamais être suivi d'un duplicate).
    const existing = await db.ledgerEntry.findFirst({
      where: { psPSource: w.psPSource, reference: w.reference, type: w.type },
      select: { id: true },
    })
    if (existing) return false
    try {
      await db.ledgerEntry.create({
        data: {
          scope: w.scope,
          kind: w.kind.slice(0, 40),
          type: w.type,
          status: "CONFIRMED",
          amount: w.amount,
          commission: 0, // mode ombre : aucun prélèvement (clé P9 inerte)
          currency: w.currency,
          psPSource: w.psPSource,
          reference: w.reference.slice(0, 191),
          storeId: w.storeId ?? null,
          walletId: w.walletId ?? null,
          orderId: w.orderId ?? null,
          note: w.note.slice(0, 300),
        },
      })
      return true
    } catch {
      // Index unique violé → course concurrente : l'écriture existe déjà.
      return false
    }
  } catch (e) {
    console.error("[finance] recordLedgerEntry (non bloquant)", e)
    return false
  }
}

/**
 * Encaissement vendeur confirmé (Mobile Money direct ou espèces) — écriture
 * miroir de la confirmation métier PATCH /api/orders (Phase C).
 * Montant = totalFC de la commande (recalculé serveur à la création).
 * Idempotence : une commande = une écriture (reference = orderId).
 */
export async function recordVendorPaymentEntry(opts: {
  storeId: string
  orderId: string
  type: "SALE" | "DELIVERY_CASH"
  amountFC: number
  orderRef: string
  declaredRef?: string
  actorLabel: string
}): Promise<void> {
  try {
    const walletId = await getOrCreateWalletId(opts.storeId)
    const amount = Number.isFinite(opts.amountFC) ? Math.round(opts.amountFC * 100) / 100 : 0
    const declared =
      opts.declaredRef && opts.declaredRef.trim() ? ` — réf déclarée ${opts.declaredRef.trim()}` : ""
    await recordLedgerEntry({
      scope: "vendor",
      kind: opts.type === "DELIVERY_CASH" ? "collection" : "order",
      type: opts.type,
      amount,
      currency: "FC",
      psPSource: opts.type === "DELIVERY_CASH" ? "cash" : "direct",
      reference: opts.orderId,
      storeId: opts.storeId,
      walletId,
      orderId: opts.orderId,
      note: `Commande ${opts.orderRef} — encaissement confirmé par ${opts.actorLabel}${declared}`,
    })
  } catch (e) {
    console.error("[finance] recordVendorPaymentEntry (non bloquant)", e)
  }
}

/**
 * Revenu KinShop reconnu via Chariow (Premium ou Boost — produit configuré) —
 * écriture miroir de l'activation métier du webhook Pulse (Phase F).
 * Montant = sale.amount du payload VÉRIFIÉ (HMAC) — jamais recalculé ni
 * inventé ; si le payload ne porte pas de montant exploitable, l'écriture est
 * posée à 0 avec une note explicite (réconciliation admin).
 * Idempotence : une vente Chariow = une écriture (reference = saleId).
 */
export async function recordPlatformSaleEntry(opts: {
  storeId?: string | null
  kind: "premium" | "boost"
  saleId: string
  amount?: number | null
  currency?: string | null
  productName?: string | null
}): Promise<void> {
  try {
    const amount = typeof opts.amount === "number" && Number.isFinite(opts.amount) ? opts.amount : 0
    const missingAmount = amount === 0 ? " — montant non fourni par le webhook (à réconcilier)" : ""
    const product = opts.productName ? ` — produit « ${opts.productName} »` : ""
    await recordLedgerEntry({
      scope: "platform",
      kind: opts.kind,
      type: "SALE",
      amount,
      currency: (opts.currency || "USD").slice(0, 10),
      psPSource: "chariow",
      reference: opts.saleId,
      storeId: opts.storeId ?? null,
      walletId: null, // revenu plateforme : pas de wallet vendeur
      orderId: null,
      note: `Revenu KinShop (${opts.kind}) — vente Chariow ${opts.saleId}${product}${missingAmount}`,
    })
  } catch (e) {
    console.error("[finance] recordPlatformSaleEntry (non bloquant)", e)
  }
}

/**
 * Contrepartie comptable d'un remboursement exécuté (administration) —
 * écriture négative miroir de PATCH /api/admin/refunds (action execute).
 * Montant FC = proportion de la part remboursée du total commande (même ratio
 * commande — aucune conversion de devise externe) ; le montant USD est porté
 * dans la note.
 * Idempotence : un remboursement = une écriture (reference = refundId).
 */
export async function recordRefundEntry(opts: {
  storeId: string
  orderId: string
  orderRef: string
  refundId: string
  amountUSD: number
  totalUSD: number
  totalFC: number
  reference?: string
}): Promise<void> {
  try {
    const walletId = await getOrCreateWalletId(opts.storeId)
    const ratio = opts.totalUSD > 0 ? opts.amountUSD / opts.totalUSD : 0
    const amountFC = -Math.round(opts.totalFC * ratio * 100) / 100
    await recordLedgerEntry({
      scope: "vendor",
      kind: "refund",
      type: "REFUND",
      amount: amountFC,
      currency: "FC",
      psPSource: "refund",
      reference: opts.refundId,
      storeId: opts.storeId,
      walletId,
      orderId: opts.orderId,
      note: `Commande ${opts.orderRef} — remboursement $${opts.amountUSD.toFixed(2)} exécuté${opts.reference ? ` (réf ${opts.reference})` : ""}`,
    })
  } catch (e) {
    console.error("[finance] recordRefundEntry (non bloquant)", e)
  }
}
