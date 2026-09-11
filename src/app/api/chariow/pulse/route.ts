// POST /api/chariow/pulse — Webhook Chariow (Pulses)
//
// Reçoit les notifications temps réel de Chariow (ex: successful.sale).
// Sécurité : signature HMAC-SHA256 du corps brut avec CHARIOW_PULSE_SECRET
// (header x-chariow-signature). Idempotence via x-pulse-delivery-id.
// Docs : https://chariow.dev/en/guides/pulse-security
//
// Traitement de successful.sale selon custom_metadata :
//   { store_slug } → active/prolonge le Premium de la boutique (+30 jours)
//   { order_ref }  → marque la commande correspondante comme « payée »

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyPulseSignature, type ChariowPulsePayload } from "@/lib/chariow"

const PREMIUM_DAYS = 30

export async function POST(req: NextRequest) {
  // Corps BRUT obligatoire — la signature porte sur les octets exacts reçus
  const rawBody = await req.text()

  const signature = req.headers.get("x-chariow-signature")
  if (!verifyPulseSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 })
  }

  let payload: ChariowPulsePayload
  try {
    payload = JSON.parse(rawBody) as ChariowPulsePayload
  } catch {
    return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
  }

  const deliveryId = req.headers.get("x-pulse-delivery-id")
  const event = payload.event || req.headers.get("x-pulse-event") || "unknown"
  const saleId = payload.sale?.id ?? ""

  // ─── Idempotence : Chariow peut retenter les livraisons ───
  if (deliveryId) {
    const existing = await db.pulseDelivery.findUnique({ where: { deliveryId } })
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true })
    }
    try {
      await db.pulseDelivery.create({ data: { deliveryId, event, saleId } })
    } catch {
      // Course concurrente : une autre instance vient de créer l'entrée
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  // ─── Traitement des événements ───
  if (event === "successful.sale") {
    const metadata = payload.sale?.custom_metadata ?? {}
    const storeSlug = (metadata.store_slug || "").trim()
    const orderRef = (metadata.order_ref || "").trim()

    try {
      if (storeSlug) {
        // Active / prolonge le Premium de la boutique
        const store = await db.store.findUnique({ where: { slug: storeSlug } })
        if (store) {
          const now = new Date()
          const base = store.premiumUntil && store.premiumUntil > now ? store.premiumUntil : now
          await db.store.update({
            where: { slug: storeSlug },
            data: {
              isPremium: true,
              premiumUntil: new Date(base.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000),
              chariowSaleId: saleId,
            },
          })
        }
      }

      if (orderRef) {
        // Marque la commande comme payée (paiement en ligne via Chariow)
        const order = await db.order.findUnique({ where: { ref: orderRef } })
        if (order) {
          await db.order.update({ where: { ref: orderRef }, data: { status: "paid" } })
        }
      }
    } catch (e) {
      console.error("Pulse processing error:", e)
      // 200 : Chariow ne doit pas retenter pour une erreur applicative interne
      // déjà enregistrée comme livrée.
    }
  }

  return NextResponse.json({ received: true })
}
