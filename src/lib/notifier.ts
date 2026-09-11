// KinShop V2 — Notifications commandes par SMS
// Abstraction fournisseur : mode SIMULATION tant que SMS_API_KEY est absente.
// Compatible « Africa's Talking » (populaire en RDC) via SMS_API_URL + SMS_API_KEY + SMS_SENDER_ID.
// ⚠️ Server-only : à importer uniquement dans les routes API.

import { db } from "@/lib/db"
import { formatFC, formatPhoneDisplay, type OrderItem } from "@/lib/kinshop"

export interface SmsConfig {
  apiUrl: string
  apiKey: string
  senderId: string
  username: string
}

export function getSmsConfig(): SmsConfig | null {
  const apiUrl = process.env.SMS_API_URL?.trim()
  const apiKey = process.env.SMS_API_KEY?.trim()
  if (!apiUrl || !apiKey) return null
  return {
    apiUrl,
    apiKey,
    senderId: process.env.SMS_SENDER_ID?.trim() || "KinShop",
    username: process.env.SMS_USERNAME?.trim() || "",
  }
}

export function isSmsLive(): boolean {
  return getSmsConfig() !== null
}

/** Envoi réel via le fournisseur (format Africa's Talking par défaut). Renvoie sent | failed. */
async function deliverSms(to: string, body: string): Promise<{ status: "sent" | "failed" | "simulated"; provider: string }> {
  const cfg = getSmsConfig()
  if (!cfg) return { status: "simulated", provider: "simulation" }
  try {
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        apiKey: cfg.apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        username: cfg.username,
        to,
        message: body,
        from: cfg.senderId,
      }).toString(),
    })
    return res.ok ? { status: "sent", provider: "sms-provider" } : { status: "failed", provider: "sms-provider" }
  } catch {
    return { status: "failed", provider: "sms-provider" }
  }
}

function vendorMessage(params: { ref: string; customerName: string; itemCount: number; totalFC: number; zone: string; payment: string }): string {
  const lines = [
    `🛍️ KinShop — NOUVELLE COMMANDE ${params.ref}`,
    `${params.itemCount} article(s) pour ${formatFC(params.totalFC)}`,
    `👤 ${params.customerName}`,
  ]
  if (params.zone) lines.push(`📍 ${params.zone}`)
  lines.push(`💳 ${params.payment}`)
  lines.push("→ Ouvre ton tableau de bord KinShop pour confirmer.")
  return lines.join("\n")
}

function customerMessage(params: { storeName: string; ref: string; customerName: string; totalFC: number }): string {
  return [
    `Bonjour ${params.customerName} 👋`,
    `Ta commande ${params.ref} chez ${params.storeName} (${formatFC(params.totalFC)}) est bien reçue.`,
    "Le vendeur te contacte sur WhatsApp pour la livraison. Merci ! 🙏",
  ].join("\n")
}

interface NotifyOrderInput {
  storeId: string
  storeName: string
  storeWhatsapp: string
  orderId: string
  ref: string
  customerName: string
  customerPhone: string
  zone: string
  items: OrderItem[]
  totalFC: number
  paymentLabel: string
}

/**
 * Notifie vendeur + client après une commande (2 SMS).
 * Jamais bloquant pour la commande : les erreurs sont journalisées, pas levées.
 */
export async function notifyNewOrder(input: NotifyOrderInput): Promise<void> {
  try {
    const vendorBody = vendorMessage({
      ref: input.ref,
      customerName: input.customerName,
      itemCount: input.items.reduce((s, it) => s + it.qty, 0),
      totalFC: input.totalFC,
      zone: input.zone,
      payment: input.paymentLabel,
    })
    const customerBody = customerMessage({
      storeName: input.storeName,
      ref: input.ref,
      customerName: input.customerName,
      totalFC: input.totalFC,
    })

    const [vendorResult, customerResult] = await Promise.all([
      deliverSms(`+${input.storeWhatsapp.replace(/^\+/, "")}`, vendorBody),
      deliverSms(`+${input.customerPhone.replace(/^\+/, "")}`, customerBody),
    ])

    await db.notificationLog.createMany({
      data: [
        {
          storeId: input.storeId,
          orderId: input.orderId,
          audience: "vendor",
          to: formatPhoneDisplay(input.storeWhatsapp),
          body: vendorBody,
          status: vendorResult.status,
          provider: vendorResult.provider,
        },
        {
          storeId: input.storeId,
          orderId: input.orderId,
          audience: "customer",
          to: formatPhoneDisplay(input.customerPhone),
          body: customerBody,
          status: customerResult.status,
          provider: customerResult.provider,
        },
      ],
    })
  } catch (e) {
    // Une notification ratée ne doit JAMAIS faire échouer la commande
    console.error("notifyNewOrder", e)
  }
}
