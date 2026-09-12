// KinFacture — Types & helpers factures professionnelles avec QR de paiement (V3)

import { formatFC, formatUSD, normalizePhone, formatPhoneDisplay } from "@/lib/kinshop"

export interface InvoiceItem {
  desc: string
  qty: number
  unitFC: number
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled" | "credited"

export interface InvoiceData {
  id: string
  number: string
  storeId: string
  clientName: string
  clientPhone: string
  items: string // JSON InvoiceItem[]
  totalFC: number
  totalUSD: number
  note: string
  dueDate: string
  status: InvoiceStatus
  paidAt: string | null
  createdAt: string
  // P4 — intégrité documentaire
  orderId?: string | null
  source?: string // manual | order
  hash?: string // empreinte sha256 du contenu canonique
  version?: number // 1 = totaux (historique) ; 2 = contenu complet
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
  credited: "Avoir",
}

/** URL publique de vérification d'authenticité (QR imprimé sur la facture, P4). */
export function buildInvoiceVerifyUrl(number: string): string {
  if (typeof window === "undefined") return `/#/verifier/${encodeURIComponent(number)}`
  return `${window.location.origin}/#/verifier/${encodeURIComponent(number)}`
}

/** Total d'une liste de lignes (recalculé côté serveur, jamais faire confiance au client) */
export function sumInvoiceItems(items: InvoiceItem[]): number {
  return items.reduce((acc, it) => acc + Math.round(it.unitFC) * Math.max(1, Math.min(999, it.qty)), 0)
}

/** Contenu du QR de paiement mobile money imprimé sur la facture (texte universel scannable) */
export function buildPaymentQrText(params: {
  storeName: string
  number: string
  totalFC: number
  whatsapp: string
}): string {
  const lines = [
    "KinFacture — PAIEMENT MOBILE MONEY",
    `Marchand : ${params.storeName}`,
    `Facture : ${params.number}`,
    `Montant : ${formatFC(params.totalFC)}`,
    `Payez par M-Pesa / Airtel Money / Orange Money`,
    `au ${formatPhoneDisplay(params.whatsapp)}`,
    `Référence à indiquer : ${params.number}`,
  ]
  return lines.join("\n")
}

/** Message WhatsApp d'envoi de la facture au client (avec lien public) */
export function buildInvoiceMessage(params: {
  storeName: string
  number: string
  clientName: string
  items: InvoiceItem[]
  totalFC: number
  totalUSD: number
  dueDate: string
  publicUrl: string
}): string {
  const lines: string[] = []
  lines.push("🧾 FACTURE — KinFacture")
  lines.push("━━━━━━━━━━━━━━━━")
  lines.push(`🏪 Émetteur : ${params.storeName}`)
  lines.push(`🔖 Facture n° : ${params.number}`)
  lines.push(`👤 Client : ${params.clientName}`)
  lines.push("")
  lines.push("📋 Détail :")
  for (const it of params.items) {
    lines.push(`• ${it.qty} × ${it.desc} — ${formatFC(it.unitFC * it.qty)}`)
  }
  lines.push("━━━━━━━━━━━━━━━━")
  lines.push(`💰 TOTAL À PAYER : ${formatFC(params.totalFC)} (${formatUSD(params.totalUSD)})`)
  if (params.dueDate) lines.push(`📅 Échéance : ${params.dueDate}`)
  lines.push("")
  lines.push(`💳 Payez par mobile money (M-Pesa / Airtel / Orange) — QR de paiement sur la facture :`)
  lines.push(params.publicUrl)
  lines.push("")
  lines.push("✅ Facture authentifiable : vérifiez-la sur la page « Vérifier » de KinShop (QR au dos du document).")
  lines.push("")
  lines.push("🧾 Facture générée par KinShop — kinshop.cd")
  return lines.join("\n")
}

/** Valide et assainit les lignes reçues du client (serveur) */
export function sanitizeInvoiceItems(raw: unknown): InvoiceItem[] {
  if (!Array.isArray(raw)) return []
  const out: InvoiceItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const desc = String(o.desc ?? "").trim().slice(0, 120)
    if (!desc) continue
    const qty = Math.max(1, Math.min(999, Math.round(Number(o.qty) || 1)))
    const unitFC = Math.max(0, Math.round(Number(o.unitFC) || 0))
    out.push({ desc, qty, unitFC })
    if (out.length >= 30) break
  }
  return out
}

/** Normalise le numéro client (réutilise la logique KinShop) */
export function normalizeClientPhone(raw: string): string {
  return normalizePhone(raw)
}
