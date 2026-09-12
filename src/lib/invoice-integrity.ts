// KinShop V10 — Numérotation séquentielle + intégrité des factures (server-only)
//
// - Counter : séquence atomique par clé (CMD-2026-000001, INV-2026-000001).
// - Hash d'intégrité : sha256 du contenu canonique + sel plateforme. Une facture
//   émise ne se modifie JAMAIS silencieusement : rectification = annulation/avoir
//   + nouvelle facture (relatedInvoiceId).
// - QR de vérification : le client scanne → /api/invoices/verify?number=…

import { createHash } from "crypto"
import { db } from "@/lib/db"

const INTEGRITY_SALT = "kinshop-invoice-v1" // intégrité interne (pas un secret utilisateur)

/** Incrémente et renvoie la valeur d'un compteur (atomique via upsert). */
export async function nextCounter(key: string): Promise<number> {
  const row = await db.counter.upsert({
    where: { key },
    update: { value: { increment: 1 } },
    create: { key, value: 1 },
  })
  return row.value
}

/** Référence de commande séquentielle : CMD-2026-000001. */
export async function makeSequentialOrderRef(): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextCounter(`order:${year}`)
  return `CMD-${year}-${String(n).padStart(6, "0")}`
}

/** Numéro de facture séquentielle : INV-2026-000001. */
export async function makeSequentialInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const n = await nextCounter(`invoice:${year}`)
  return `INV-${year}-${String(n).padStart(6, "0")}`
}

/** Empreinte d'intégrité d'une facture (déterministe, vérifiable). */
export function invoiceHash(payload: {
  number: string
  orderId: string
  storeId: string
  totalUSD: number
  totalFC: number
  issuedAt: string
}): string {
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
