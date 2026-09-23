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

    await sendAndLog(
      "new_order",
      input.storeId,
      input.orderId,
      { to: input.storeWhatsapp, body: vendorBody },
      { to: input.customerPhone, body: customerBody },
    )
  } catch (e) {
    // Une notification ratée ne doit JAMAIS faire échouer la commande
    console.error("notifyNewOrder", e)
  }
}


/* ─────────── LOT 3 — Notifications d'événements (protocole §20) ───────────
   Avant ce lot, seul NEW_ORDER notifiait (PG4 du RAPPORT 8). Chaque événement
   métier prioritaire détermine désormais ses destinataires (client et/ou
   vendeur) et ses messages — un seul endroit, testable. Aucun canal nouveau :
   le canal réellement disponible (SMS, simulé tant que le fournisseur est
   absent) est exploité ; la séparation destinataires / messages / envoi est
   déjà prête pour email, WhatsApp et push (§20 : « préparer l'architecture »,
   « ne pas multiplier les intégrations »). Règle inchangée : une notification
   ratée ne fait JAMAIS échouer l'action métier (erreurs journalisées serveur). */

export type OrderNotificationEvent =
  | "order_confirmed"
  | "order_ready"
  | "order_ready_for_pickup"
  | "order_out_for_delivery"
  | "order_delivered"
  | "order_picked_up"
  | "order_cancelled"
  | "order_returned"
  | "delivery_failed"
  | "delivery_retry"
  | "payment_confirmed"
  | "payment_declared"

/** Envoie les messages disponibles et journalise (voie unique — new_order inclus). */
async function sendAndLog(
  event: string,
  storeId: string,
  orderId: string,
  vendor?: { to: string; body: string },
  customer?: { to: string; body: string },
): Promise<void> {
  const results = await Promise.all([
    vendor ? deliverSms(`+${vendor.to.replace(/^\+/, "")}`, vendor.body) : null,
    customer ? deliverSms(`+${customer.to.replace(/^\+/, "")}`, customer.body) : null,
  ])
  const rows: {
    storeId: string
    orderId: string
    event: string
    audience: string
    to: string
    body: string
    status: string
    provider: string
  }[] = []
  if (vendor && results[0]) {
    rows.push({
      storeId,
      orderId,
      event,
      audience: "vendor",
      to: formatPhoneDisplay(vendor.to),
      body: vendor.body,
      status: results[0].status,
      provider: results[0].provider,
    })
  }
  if (customer && results[1]) {
    rows.push({
      storeId,
      orderId,
      event,
      audience: "customer",
      to: formatPhoneDisplay(customer.to),
      body: customer.body,
      status: results[1].status,
      provider: results[1].provider,
    })
  }
  if (rows.length > 0) {
    await db.notificationLog.createMany({ data: rows })
  }
}

export interface OrderEventInput {
  storeId: string
  storeName: string
  storeWhatsapp: string
  orderId: string
  ref: string
  customerName: string
  customerPhone: string
  totalFC: number
  paymentStatus?: string
  actorType: string // customer | owner | admin | system
  reason?: string // motif de livraison, référence déclarée/opérateur…
}

/** Messages par événement — destinataires selon contexte (§20), un seul endroit. */
function eventMessages(
  event: OrderNotificationEvent,
  p: OrderEventInput,
): { vendor?: { to: string; body: string }; customer?: { to: string; body: string } } {
  const ref = p.ref
  const store = p.storeName
  const amount = formatFC(p.totalFC)
  switch (event) {
    case "order_confirmed":
      return {
        customer: { to: p.customerPhone, body: `✅ KinShop — Ta commande ${ref} chez ${store} est confirmée. Préparation en cours.` },
      }
    case "order_ready":
      return {
        customer: { to: p.customerPhone, body: `📦 KinShop — Ta commande ${ref} est prête ! Elle part bientôt en livraison.` },
      }
    case "order_ready_for_pickup":
      return {
        customer: { to: p.customerPhone, body: `🏪 KinShop — Ta commande ${ref} est prête pour le retrait chez ${store}. Montre cette référence à l'accueil.` },
      }
    case "order_out_for_delivery":
      return {
        customer: { to: p.customerPhone, body: `🚚 KinShop — Ta commande ${ref} est en route ! Le livreur arrive bientôt.` },
      }
    case "order_delivered":
      return {
        customer: { to: p.customerPhone, body: `✅ KinShop — Ta commande ${ref} a été livrée. Merci d'avoir acheté chez ${store} !` },
      }
    case "order_picked_up":
      return {
        customer: { to: p.customerPhone, body: `🏪 KinShop — Retrait confirmé pour ${ref}. Merci de ta visite chez ${store} !` },
      }
    case "order_cancelled":
      return {
        customer: {
          to: p.customerPhone,
          body: `❌ KinShop — Ta commande ${ref} chez ${store} a été annulée.${p.paymentStatus === "paid" ? " Ton remboursement sera traité par le vendeur." : ""}`,
        },
      }
    case "order_returned":
      return {
        customer: { to: p.customerPhone, body: `↩️ KinShop — La livraison de ${ref} nous a été retournée. Le vendeur te recontacte.` },
      }
    case "delivery_failed":
      return {
        customer: {
          to: p.customerPhone,
          body: `⚠️ KinShop — La livraison de ${ref} a échoué${p.reason ? ` (${p.reason})` : ""}. Le vendeur va organiser une nouvelle tentative.`,
        },
      }
    case "delivery_retry":
      return {
        customer: { to: p.customerPhone, body: `🚚 KinShop — Bonne nouvelle : une nouvelle tentative de livraison est prévue pour ${ref}.` },
      }
    case "payment_confirmed":
      return {
        customer: { to: p.customerPhone, body: `💳 KinShop — Paiement bien reçu pour ${ref} chez ${store} (${amount}). Merci !` },
        // Le vendeur est informé quand l'encaissement n'est pas son propre geste
        // (webhook agrégateur, administration) — pas s'il vient de confirmer lui-même.
        ...(p.actorType !== "owner"
          ? {
              vendor: {
                to: p.storeWhatsapp,
                body: `💳 KinShop — Encaissement confirmé pour ${ref} (${amount})${p.actorType === "admin" ? " par l'administration" : " en ligne"}.`,
              },
            }
          : {}),
      }
    case "payment_declared":
      return {
        vendor: {
          to: p.storeWhatsapp,
          body: `💳 KinShop — Le client déclare avoir payé ${ref} (${amount})${p.reason ? ` — réf : ${p.reason}` : ""}. Vérifie ton compte opérateur puis confirme dans ton tableau de bord.`,
        },
      }
  }
}

/**
 * Notifie les destinataires d'un événement métier (§20).
 * Jamais bloquant : toute erreur est journalisée serveur, jamais levée.
 */
export async function notifyOrderEvent(event: OrderNotificationEvent, input: OrderEventInput): Promise<void> {
  try {
    const msgs = eventMessages(event, input)
    await sendAndLog(event, input.storeId, input.orderId, msgs.vendor, msgs.customer)
  } catch (e) {
    console.error("notifyOrderEvent", event, e)
  }
}
