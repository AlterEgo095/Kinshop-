// POST /api/chariow/pulse — Webhook Chariow (Pulses)
//
// Reçoit les notifications temps réel de Chariow (ex: successful.sale).
// Sécurité : signature HMAC-SHA256 du corps brut avec CHARIOW_PULSE_SECRET
// (header x-chariow-signature). Idempotence à deux niveaux :
//   1. x-pulse-delivery-id (reprises immédiates de livraison) ;
//   2. couple (event, saleId) — index unique DB (P2) : Chariow régénère le
//      deliveryId à chaque reprise, le couple reste lui stable par vente.
// Docs : https://chariow.dev/en/guides/pulse-security
//
// Traitement de successful.sale selon custom_metadata :
//   { store_slug } → active/prolonge le Premium de la boutique (+30 jours)
// (P2 — la branche order_ref est supprimée : les commandes ne passent JAMAIS
// par Chariow ; leur paiement suit le parcours direct vendeur ou le COD.)

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

  // ─── Idempotence (2 contrôles AVANT toute écriture) ───
  // 1) deliveryId : reprises immédiates de la même livraison.
  if (deliveryId) {
    const existing = await db.pulseDelivery.findUnique({ where: { deliveryId } })
    if (existing) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  }
  // ─── P2 — Anti-replay durable : couple (event, saleId) ───
  // 2) Un replay Chariow arrive avec un deliveryId NEUF mais le même couple.
  // L'index unique @@unique([event, saleId]) fait foi au niveau DB ; ce contrôle
  // anticipé (AVANT le create — leçon de la matrice de tests : le create de la
  // première livraison ne doit JAMAIS être suivi d'un duplicate) évite tout
  // re-traitement métier (double +30 j Premium).
  if (saleId) {
    const replay = await db.pulseDelivery.findFirst({ where: { event, saleId } })
    if (replay) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  }
  // 3) Enregistrement de la livraison — après les deux contrôles. Le catch
  // couvre la course concurrente (index unique violé par une instance jumelle).
  if (deliveryId) {
    try {
      await db.pulseDelivery.create({ data: { deliveryId, event, saleId } })
    } catch {
      return NextResponse.json({ received: true, duplicate: true })
    }
  }

  // ─── Traitement des événements ───
  if (event === "successful.sale") {
    const metadata = payload.sale?.custom_metadata ?? {}
    const storeSlug = (metadata.store_slug || "").trim()

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

    } catch (e) {
      console.error("Pulse processing error:", e)
      // 200 : Chariow ne doit pas retenter pour une erreur applicative interne
      // déjà enregistrée comme livrée.
    }
  }

  return NextResponse.json({ received: true })
}
