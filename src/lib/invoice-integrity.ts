// KinShop V10 — Numérotation séquentielle + intégrité des factures (server-only)
//
// - Counter : séquence atomique par clé (CMD-2026-000001, INV-2026-000001, KF-2026-000001).
// - Hash d'intégrité : sha256 du contenu canonique + sel plateforme. Une facture
//   émise ne se modifie JAMAIS silencieusement : rectification = annulation/avoir
//   + nouvelle facture (relatedInvoiceId).
//   V2 (P4) : l'empreinte couvre DÉSORMAIS l'intégralité du contenu facturé
//   (lignes, client, téléphone, échéance, note) — pas seulement les totaux.
// - QR de vérification : le client scanne → page publique /#/verifier/{number}
//   → GET /api/invoices/verify (re-calcul de l'empreinte + comparaison).

import { createHash } from "crypto"
import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"

const INTEGRITY_SALT = "kinshop-invoice-v1" // intégrité interne (pas un secret utilisateur)
const INTEGRITY_SALT_V2 = "kinshop-invoice-v2"

type TxClient = Prisma.TransactionClient

/** Incrémente et renvoie la valeur d'un compteur (atomique via upsert). */
export async function nextCounter(key: string, tx?: TxClient): Promise<number> {
  const client = tx ?? db
  const row = await client.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  })
  return row.value
}

/** Référence de commande séquentielle : CMD-2026-000001. */
export async function makeSequentialOrderRef(tx?: TxClient): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextCounter(`order:${year}`, tx)
  return `CMD-${year}-${String(n).padStart(6, "0")}`
}

/** Numéro de facture de commande séquentiel : INV-2026-000001. */
export async function makeSequentialInvoiceNumber(tx?: TxClient): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextCounter(`invoice:${year}`, tx)
  return `INV-${year}-${String(n).padStart(6, "0")}`
}

/**
 * Numéro KinFacture (facture libre) séquentiel : KF-2026-000001.
 * P4 (F4-1) : remplace l'ancien numéro aléatoire KF-XXXXXX — séquence continue
 * sans trou ni collision (les anciens numéros restent résolubles par lookup).
 */
export async function makeSequentialKinfactureNumber(tx?: TxClient): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextCounter(`kinfacture:${year}`, tx)
  return `KF-${year}-${String(n).padStart(6, "0")}`
}

/* ─────────── Empreintes d'intégrité ─────────── */

/** Normalise les lignes facturées en JSON canonique déterministe (ordre des clés fixe). */
export function canonicalInvoiceItemsJson(itemsJson: string): string {
  let arr: unknown = []
  try {
    const parsed = JSON.parse(itemsJson)
    if (Array.isArray(parsed)) arr = parsed
  } catch {
    arr = []
  }
  const items = (arr as Record<string, unknown>[]).map((o) => ({
    desc: String(o?.desc ?? ""),
    qty: Math.round(Number(o?.qty) || 0),
    unitFC: Math.round(Number(o?.unitFC) || 0),
  }))
  return JSON.stringify(items)
}

interface InvoiceHashPayload {
  number: string
  orderId: string
  storeId: string
  totalUSD: number
  totalFC: number
  issuedAt: string
}

/**
 * V1 (historique) — empreinte sur les totaux uniquement.
 * Conservée pour vérifier les factures de commande émises AVANT P4 (version=1).
 */
export function invoiceHash(payload: InvoiceHashPayload): string {
  const canonical = [
    payload.number,
    payload.orderId,
    payload.storeId,
    payload.totalUSD.toFixed(2),
    String(Math.round(payload.totalFC)),
    payload.issuedAt,
    INTEGRITY_SALT,
  ].join("|")
  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * V2 (P4 / F4-2) — empreinte sur l'intégralité du contenu : totaux + lignes
 * canoniques + client + téléphone + échéance + note. Toute altération du
 * document (montant, ligne ajoutée/retirée, nom, échéance) est détectée.
 */
export function invoiceHashV2(payload: InvoiceHashPayload & {
  itemsJson: string
  clientName: string
  clientPhone: string
  dueDate: string
  note: string
}): string {
  const canonical = [
    "v2",
    payload.number,
    payload.orderId,
    payload.storeId,
    payload.totalUSD.toFixed(2),
    String(Math.round(payload.totalFC)),
    payload.issuedAt,
    canonicalInvoiceItemsJson(payload.itemsJson),
    payload.clientName,
    payload.clientPhone,
    payload.dueDate,
    payload.note,
    INTEGRITY_SALT_V2,
  ].join("|")
  return createHash("sha256").update(canonical).digest("hex")
}

/**
 * Recalcule l'empreinte attendue d'une facture stockée selon sa version :
 * - version ≥ 2 → empreinte V2 (contenu complet)
 * - sinon       → empreinte V1 (totaux, factures de commande pré-P4)
 * Renvoie "" si la facture n'a pas d'empreinte (héritée — avant le système).
 */
export function expectedInvoiceHash(invoice: {
  number: string
  orderId: string | null
  storeId: string
  totalUSD: number
  totalFC: number
  items: string
  clientName: string
  clientPhone: string
  dueDate: string
  note: string
  hash: string
  version: number
  createdAt: Date
}): string {
  if (!invoice.hash) return ""
  const base = {
    number: invoice.number,
    orderId: invoice.orderId ?? "",
    storeId: invoice.storeId,
    totalUSD: invoice.totalUSD,
    totalFC: invoice.totalFC,
    issuedAt: invoice.createdAt.toISOString(),
  }
  if (invoice.version >= 2) {
    return invoiceHashV2({
      ...base,
      itemsJson: invoice.items,
      clientName: invoice.clientName,
      clientPhone: invoice.clientPhone,
      dueDate: invoice.dueDate,
      note: invoice.note,
    })
  }
  return invoiceHash(base)
}
