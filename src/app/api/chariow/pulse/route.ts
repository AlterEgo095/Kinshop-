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
//   { store_slug }           → active/prolonge le Premium de la boutique (+30 jours)
//   { kind: "boost",         → active la campagne de boost payée (Phase F — produit
//     boost_id }               Chariow à prix fixe ; activation conditionnelle
//                              anti-course, paiementRef = vente, audit système)
// Garde-fous (Phase F) :
//   • produit : seule une vente du produit CONFIGURÉ (Premium ou palier boost)
//     déclenche une activation — le Pulse écoute « tous produits » du compte ;
//   • anti-commande : toute livraison portant une métadonnée de commande
//     (order_ref/order_id/amount/…) est JOURNALISÉE puis IGNORÉE — les
//     commandes ne passent JAMAIS par Chariow (recadrage paiement) ;
//   • kill-switch : `payments.chariowEnabled=false` → livraison enregistrée
//     (idempotence) mais AUCUNE activation (défaut sécuritaire : pas de
//     retrait de valeur déjà acquise).
// (P2 — la branche order_ref est supprimée : les commandes ne passent JAMAIS
// par Chariow ; leur paiement suit le parcours direct vendeur ou le COD.)

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  verifyPulseSignature,
  resolveChariowProductId,
  resolveChariowBoostProductId,
  findForbiddenOrderMetadataKey,
  isChariowDisabled,
  type ChariowPulsePayload,
} from "@/lib/chariow"
import { logAudit } from "@/lib/audit"
// Phase E — ledger en mode ombre : revenu KinShop reconnu (vente Chariow du
// produit configuré) journalisé en double écriture — jamais bloquant.
import { recordPlatformSaleEntry } from "@/lib/finance"

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
    const kind = (metadata.kind || "").trim()
    const boostId = (metadata.boost_id || "").trim()

    // ─── GARDE-FOU ANTI-COMMANDE (recadrage, défense en profondeur) ───
    // Une métadonnée de commande dans un Pulse = usage interdit (les montants
    // dynamiques des commandes ne passent JAMAIS par Chariow). On journalise
    // l'incident dans la chaîne d'audit et on ne traite RIEN.
    const forbiddenKey = findForbiddenOrderMetadataKey(metadata)
    if (forbiddenKey) {
      console.warn(`[pulse] métadonnée de commande interdite ignorée : ${forbiddenKey} (vente ${saleId})`)
      await logAudit({
        action: "chariow.pulse_rejected",
        target: `chariow_sale:${saleId || "?"}`,
        detail: `Livraison porteuse d'une métadonnée de commande interdite ("${forbiddenKey}") — ignorée (les commandes ne passent jamais par Chariow).`,
        actorType: "system",
        entityType: "config",
        entityId: "chariow-pulse",
      })
      return NextResponse.json({ received: true, ignored: "forbidden_metadata" })
    }

    // ─── KILL-SWITCH administrable : canal coupé → aucune activation ───
    // La livraison est déjà enregistrée ci-dessus (idempotence tenue) ; un
    // paiement effectué pendant la coupure reste récupérable hors webhook
    // (vérification à la demande Premium, activation administration Boost).
    if (await isChariowDisabled()) {
      console.warn("[pulse] canal Chariow désactivé (payments.chariowEnabled=false) — activation ignorée")
      return NextResponse.json({ received: true, ignored: "channel_disabled" })
    }

    try {
      if (kind === "boost" && boostId) {
        // ─── Phase F — Activation d'un boost payé via Chariow ───
        // Garde produit : seule une vente d'un produit boost CONFIGURÉ peut
        // activer une campagne (les metadata sont écrites par NOTRE serveur au
        // checkout, la garde empêche tout produit tiers d'agir par confusion).
        const camp = await db.boostCampaign.findUnique({
          where: { id: boostId },
          include: { store: true },
        })
        const days =
          camp && camp.status === "pending_payment"
            ? Math.round((camp.endAt.getTime() - camp.startAt.getTime()) / 86_400_000)
            : 0
        const expectedProduct =
          days === 7 || days === 30 ? await resolveChariowBoostProductId(days as 7 | 30) : ""
        if (camp && days !== 0 && expectedProduct && payload.product?.id === expectedProduct) {
          // Activation CONDITIONNELLE (anti-course / anti-double) : seule une
          // campagne encore « pending_payment » bascule. La durée payée démarre
          // à l'activation (fenêtre replanifiée = palier d'origine).
          const now = new Date()
          const updated = await db.boostCampaign.updateMany({
            where: { id: boostId, status: "pending_payment" },
            data: {
              status: "active",
              paymentRef: saleId,
              startAt: now,
              endAt: new Date(now.getTime() + days * 86_400_000),
            },
          })
          if (updated.count > 0) {
            await logAudit({
              action: "boost.paid",
              target: `boost:${boostId}`,
              detail: `PAIEMENT CHARIOW — ${camp.store.name} — campagne ACTIVE ${days} j jusqu'au ${new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10)} — vente ${saleId}`,
              actorType: "system",
              entityType: "boost",
              entityId: boostId,
            })
            // Phase E — Ledger (mode ombre) : revenu KinShop (boost payé) —
            // montant réel du payload vérifié, idempotent par vente Chariow.
            await recordPlatformSaleEntry({
              storeId: camp.storeId,
              kind: "boost",
              saleId,
              amount: payload.sale?.amount?.value,
              currency: payload.sale?.amount?.currency,
              productName: payload.product?.name,
            })
          }
          // count === 0 → déjà traitée (webhook rejoué) : no-op idempotent
        }
      } else if (storeSlug) {
        // ─── Active / prolonge le Premium de la boutique ───
        // Garde produit (Phase F) : seule une vente du produit Premium
        // CONFIGURÉ peut activer (le Pulse écoute « tous produits » du compte
        // Chariow). Payload sans produit identifiable → comportement historique
        // conservé (rétrocompatibilité), le rattachement reste contrôlé par
        // les metadata écrites par NOTRE serveur au checkout.
        const configuredProduct = await resolveChariowProductId()
        const pulseProductId = (payload.product?.id || "").trim()
        if (pulseProductId && configuredProduct && pulseProductId !== configuredProduct) {
          console.warn(`[pulse] vente d'un autre produit ignorée : ${pulseProductId} (vente ${saleId})`)
          return NextResponse.json({ received: true, ignored: "product_mismatch" })
        }
        const store = await db.store.findUnique({ where: { slug: storeSlug } })
        if (store) {
          const now = new Date()
          const base = store.premiumUntil && store.premiumUntil > now ? store.premiumUntil : now
          const newUntil = new Date(base.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000)
          await db.store.update({
            where: { slug: storeSlug },
            data: {
              isPremium: true,
              premiumUntil: newUntil,
              chariowSaleId: saleId,
            },
          })
          // Journalisation (opérations sensibles) : activation tracée dans la
          // chaîne d'audit — jamais bloquante pour le webhook.
          await logAudit({
            action: "premium.activated",
            target: `store:${storeSlug}`,
            detail: `Vente Chariow ${saleId} — Premium +${PREMIUM_DAYS} j jusqu'au ${newUntil.toISOString().slice(0, 10)} (produit ${pulseProductId || configuredProduct || "?"}).`,
            actorType: "system",
            entityType: "store",
            entityId: store.id,
          })
          // Phase E — Ledger (mode ombre) : revenu KinShop (Premium) — montant
          // réel du payload vérifié, idempotent par vente Chariow.
          await recordPlatformSaleEntry({
            storeId: store.id,
            kind: "premium",
            saleId,
            amount: payload.sale?.amount?.value,
            currency: payload.sale?.amount?.currency,
            productName: payload.product?.name,
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
