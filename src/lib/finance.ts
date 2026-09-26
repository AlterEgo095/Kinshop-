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
//   • COMMISSION RÉELLE (cycle 3) : la clé finance.commissionPercent (console
//     admin, 0–50, défaut 0 = aucun prélèvement) est appliquée aux NOUVELLES
//     écritures vendeur (SALE / DELIVERY_CASH) au moment de l'écriture — les
//     écritures déjà posées restent inchangées (append-only) ; la part
//     remboursée annule la commission correspondante (COMMISSION_REVERSAL) ;
//     pas de solde stocké (les agrégats se calculent depuis les écritures) ;
//     pas d'exposition vendeur (aucune API /api/wallet, aucun écran vendeur)
//     — lecture admin seule.
//
// MACHINE D'ÉTATS DES ÉCRITURES (réservée) : PENDING → CONFIRMED → AVAILABLE.
// Le mode ombre écrit directement CONFIRMED (le fait d'argent est déjà vérifié
// par le flux métier au moment de l'écriture) ; AVAILABLE sera mobilisé par la
// future machinerie de retraits (P10 — décision business, hors Phase E).

import { db } from "@/lib/db"
import { getConfigValue } from "@/lib/config-registry"

export const LEDGER_ENTRY_TYPES = [
  "SALE", // encaissement Mobile Money direct confirmé (vendeur)
  "DELIVERY_CASH", // encaissement espèces confirmé (vendeur)
  "REFUND", // remboursement exécuté (contrepartie négative)
  "COMMISSION_REVERSAL", // renonciation plateforme à sa commission sur la part remboursée (cycle 3)
  "WITHDRAWAL", // retrait vendeur approuvé (débit réversible — cycle 3, ch. 16)
  "ADJUSTMENT", // correction contrôlée : déblocage d'échec de retrait (cycle 3)
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

/* ─────────── Commission plateforme (cycle 3 — consommateur de la clé P9) ─────────── */

/**
 * Pourcentage de commission plateforme applicable aux encaissements vendeurs
 * (SALE / DELIVERY_CASH), lu au moment de l'écriture depuis la clé
 * finance.commissionPercent (console admin, 0–50, défaut 0 = aucun
 * prélèvement). En cas d'échec de lecture : 0 — le ledger ne bloque JAMAIS le
 * flux métier (mode ombre). La valeur s'applique aux SEULES écritures créées
 * après son changement (append-only : aucune rétroécriture) et ne touche pas
 * les revenus Chariow (scope platform — déjà des revenus KinShop).
 */
export async function getVendorCommissionPercent(): Promise<number> {
  try {
    const raw = await getConfigValue<number>("finance.commissionPercent")
    const pct = Number(raw)
    if (!Number.isFinite(pct)) return 0
    return Math.min(50, Math.max(0, Math.round(pct * 100) / 100))
  } catch {
    return 0
  }
}

/* ─────────── Écritures idempotentes (JAMAIS bloquantes) ─────────── */

interface LedgerWriteInput {
  scope: "vendor" | "platform"
  kind: string // premium | boost | order | collection (contexte métier de reporting)
  type: LedgerEntryType
  amount: number // signe porté : crédit vendeur/revenu > 0, débit < 0
  commission?: number // part plateforme figée sur un crédit vendeur (défaut 0, jamais > montant)
  currency: string // FC (marketplace) ou USD (Chariow) — jamais converti
  psPSource: string // direct | cash | chariow | refund
  reference: string // clé d'idempotence métier (orderId ou saleId/refundId)
  storeId?: string | null // contexte reporting (survit à la boutique)
  walletId?: string | null // obligatoire pour scope vendor
  orderId?: string | null
  note: string
}

/**
 * Normalise la commission d'une écriture : >= 0, arrondie au centime et
 * bornée au crédit écrit (une commission ne peut jamais dépasser le montant
 * encaissé ni s'appliquer à un débit). Défaut : 0 (aucun prélèvement).
 */
function normalizeCommission(raw: number, amount: number): number {
  if (!Number.isFinite(raw) || raw <= 0 || amount <= 0) return 0
  const rounded = Math.round(raw * 100) / 100
  return Math.min(rounded, amount)
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
          commission: normalizeCommission(w.commission ?? 0, w.amount),
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
    // Commission plateforme (cycle 3) : pourcentage configuré appliqué au
    // montant encaissé et FIGÉ sur l'écriture au moment de l'écriture
    // (défaut 0 = aucun prélèvement ; aucune rétroécriture possible).
    const pct = await getVendorCommissionPercent()
    const commission = pct > 0 ? Math.round(amount * pct) / 100 : 0
    const commissionNote = commission > 0 ? ` — commission ${commission} FC (${pct} %)` : ""
    await recordLedgerEntry({
      scope: "vendor",
      kind: opts.type === "DELIVERY_CASH" ? "collection" : "order",
      type: opts.type,
      amount,
      commission,
      currency: "FC",
      psPSource: opts.type === "DELIVERY_CASH" ? "cash" : "direct",
      reference: opts.orderId,
      storeId: opts.storeId,
      walletId,
      orderId: opts.orderId,
      note: `Commande ${opts.orderRef} — encaissement confirmé par ${opts.actorLabel}${declared}${commissionNote}`,
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
    // Commission remboursée (cycle 3) : si l'encaissement d'origine portait
    // une commission, la plateforme renonce à sa part sur la portion
    // remboursée — écriture positive miroir (COMMISSION_REVERSAL,
    // idempotente par remboursement via l'index unique), JAMAIS bloquante.
    // Une écriture d'origine sans commission (0, historique) ne produit RIEN.
    try {
      const original = await db.ledgerEntry.findFirst({
        where: {
          scope: "vendor",
          orderId: opts.orderId,
          type: { in: ["SALE", "DELIVERY_CASH"] },
        },
        select: { commission: true },
      })
      const originalCommission = original?.commission ?? 0
      if (originalCommission > 0) {
        const reversal = Math.round(originalCommission * ratio * 100) / 100
        if (reversal > 0) {
          await recordLedgerEntry({
            scope: "vendor",
            kind: "refund",
            type: "COMMISSION_REVERSAL",
            amount: reversal,
            commission: 0,
            currency: "FC",
            psPSource: "refund",
            reference: opts.refundId,
            storeId: opts.storeId,
            walletId,
            orderId: opts.orderId,
            note: `Commande ${opts.orderRef} — commission reversée sur remboursement (${Math.round(ratio * 100)} % de ${originalCommission} FC)`,
          })
        }
      }
    } catch (e) {
      console.error("[finance] commission reversal (non bloquant)", e)
    }
  } catch (e) {
    console.error("[finance] recordRefundEntry (non bloquant)", e)
  }
}

/* ─────────── Retraits vendeurs (cycle 3 — ch. 16 du rapport financier) ─────────── */

/**
 * Taux de conversion plateforme FC/USD (clé defaultRateFC, défaut 2400).
 * Sert à convertir les paramètres de retrait exprimés en USD (min, frais fixe,
 * plafond journalier) en FC — la devise native du ledger marketplace.
 */
export async function fcPerUSD(): Promise<number> {
  try {
    const rate = Number(await getConfigValue<number>("defaultRateFC"))
    return Number.isFinite(rate) && rate > 0 ? rate : 2400
  } catch {
    return 2400
  }
}

/**
 * Solde de la boutique — JAMAIS stocké, toujours recalculé depuis le ledger
 * (source de vérité unique) :
 *   disponible = Σ(SALE + DELIVERY_CASH) − Σ(commission) + Σ(COMMISSION_REVERSAL)
 *                + Σ(REFUND, négatif) + Σ(ADJUSTMENT) + Σ(WITHDRAWAL, négatif)
 * Les retraits REQUESTED ne sont PAS débités : le débit (verrou réversible)
 * n'est posé qu'à l'APPROBATION, où le disponible est re-vérifié (anti-race).
 */
export async function getWalletSummary(storeId: string): Promise<{
  collectedFC: number
  commissionFC: number
  reversedFC: number
  refundsFC: number
  adjustmentsFC: number
  withdrawnFC: number
  availableFC: number
}> {
  const zero = { collectedFC: 0, commissionFC: 0, reversedFC: 0, refundsFC: 0, adjustmentsFC: 0, withdrawnFC: 0, availableFC: 0 }
  try {
    const [collected, commission, reversal, refunds, adjustments, withdrawn] = await Promise.all([
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", storeId, type: { in: ["SALE", "DELIVERY_CASH"] } },
      }),
      db.ledgerEntry.aggregate({
        _sum: { commission: true },
        where: { scope: "vendor", storeId, type: { in: ["SALE", "DELIVERY_CASH"] } },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", storeId, type: "COMMISSION_REVERSAL" },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", storeId, type: "REFUND" },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", storeId, type: "ADJUSTMENT" },
      }),
      db.ledgerEntry.aggregate({
        _sum: { amount: true },
        where: { scope: "vendor", storeId, type: "WITHDRAWAL" },
      }),
    ])
    const collectedFC = Math.round((collected._sum.amount ?? 0) * 100) / 100
    const commissionFC = Math.round((commission._sum.commission ?? 0) * 100) / 100
    const reversedFC = Math.round((reversal._sum.amount ?? 0) * 100) / 100
    const refundsFC = Math.round((refunds._sum.amount ?? 0) * 100) / 100
    const adjustmentsFC = Math.round((adjustments._sum.amount ?? 0) * 100) / 100
    const withdrawnFC = Math.round((withdrawn._sum.amount ?? 0) * 100) / 100
    const availableFC =
      Math.round((collectedFC - commissionFC + reversedFC + refundsFC + adjustmentsFC + withdrawnFC) * 100) / 100
    return { collectedFC, commissionFC, reversedFC, refundsFC, adjustmentsFC, withdrawnFC, availableFC }
  } catch (e) {
    console.error("[finance] getWalletSummary (non bloquant)", e)
    return zero
  }
}

/**
 * Débit réversible d'un retrait APPROUVÉ : écriture WITHDRAWAL négative au
 * MONTANT DEMANDÉ (le disponible consommé), et si des frais s'appliquent, une
 * écriture plateforme correspondante (revenu KinShop, kind=withdrawal-fee).
 * Le vendeur reçoit net = montant − frais. Idempotente par retrait
 * (psPSource=admin, reference=withdrawalId). Retourne true si l'écriture a eu
 * lieu — un false permet à l'appelant de refuser un double-approbation.
 */
export async function recordWithdrawalEntry(opts: {
  storeId: string
  withdrawalId: string
  amountFC: number
  feeFC: number
  method: string
  accountName: string
  accountNumber: string
}): Promise<boolean> {
  try {
    const walletId = await getOrCreateWalletId(opts.storeId)
    const written = await recordLedgerEntry({
      scope: "vendor",
      kind: "withdrawal",
      type: "WITHDRAWAL",
      amount: -Math.round(opts.amountFC * 100) / 100,
      commission: 0,
      currency: "FC",
      psPSource: "admin",
      reference: opts.withdrawalId,
      storeId: opts.storeId,
      walletId,
      orderId: null,
      note: `Retrait ${opts.withdrawalId.slice(-8)} — ${Math.round(opts.amountFC).toLocaleString("fr-FR")} FC vers ${opts.accountName} (${opts.method} ${opts.accountNumber}) — net ${Math.round((opts.amountFC - opts.feeFC) * 100) / 100} FC`,
    })
    if (written && opts.feeFC > 0) {
      // Frais de retrait = revenu plateforme (écriture miroir, même clé).
      await recordLedgerEntry({
        scope: "platform",
        kind: "withdrawal-fee",
        type: "SALE",
        amount: Math.round(opts.feeFC * 100) / 100,
        commission: 0,
        currency: "FC",
        psPSource: "admin",
        reference: opts.withdrawalId,
        storeId: opts.storeId,
        walletId: null,
        orderId: null,
        note: `Retrait ${opts.withdrawalId.slice(-8)} — frais de règlement`,
      })
    }
    return written
  } catch (e) {
    console.error("[finance] recordWithdrawalEntry (non bloquant)", e)
    return false
  }
}

/**
 * Contrepartie de déblocage d'un retrait EN ÉCHEC (ch. 16 : jamais de perte
 * silencieuse) : écriture ADJUSTMENT positive qui annule le débit réversible
 * (le disponible remonte). Idempotente par retrait (même clé, type distinct).
 */
export async function recordWithdrawalUnlockEntry(opts: {
  storeId: string
  withdrawalId: string
  netFC: number
  failReason: string
}): Promise<boolean> {
  try {
    const walletId = await getOrCreateWalletId(opts.storeId)
    return await recordLedgerEntry({
      scope: "vendor",
      kind: "withdrawal-unlock",
      type: "ADJUSTMENT",
      amount: Math.round(opts.netFC * 100) / 100,
      commission: 0,
      currency: "FC",
      psPSource: "admin",
      reference: opts.withdrawalId,
      storeId: opts.storeId,
      walletId,
      orderId: null,
      note: `Retrait ${opts.withdrawalId.slice(-8)} en échec — fonds débloqués (${opts.failReason})`,
    })
  } catch (e) {
    console.error("[finance] recordWithdrawalUnlockEntry (non bloquant)", e)
    return false
  }
}
