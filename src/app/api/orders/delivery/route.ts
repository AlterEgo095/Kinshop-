import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import {
  canTransitionDelivery,
  DELIVERY_FAILURE_REASONS,
  DELIVERY_FAILURE_LABELS,
} from "@/lib/order-workflow"
import { restoreOrderStock } from "@/lib/stock"
import { notifyOrderEvent } from "@/lib/notifier"

// PATCH /api/orders/delivery — Dimension LIVRAISON indépendante (V10)
// Le vendeur (propriétaire dérivé serveur) fait avancer le statut de livraison :
// assigned → picked_up → in_transit → out_for_delivery → delivered
// Exceptions : failed (MOTIF OBLIGATOIRE structuré) → relance (assigned) ou returned.
// Chaque mouvement produit un événement immuable — aucune trace n'est écrasée.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const deliveryStatus = String(body.deliveryStatus || "")
    const reasonKey = String(body.reason || "").trim()
    const reasonNote = String(body.reasonNote || "").slice(0, 300)

    if (!id || !deliveryStatus) {
      return NextResponse.json({ error: "Paramètres id et deliveryStatus requis." }, { status: 400 })
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { store: { select: { name: true, whatsapp: true } } },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()
    const guard = await requireStoreOwner(req, { id: order.storeId })
    if (!guard.ok) return guard.response
    const actorLabel = user.name || user.email

    // LOT 2 — cohérence fulfillment : une commande en RETRAIT en boutique n'a
    // pas de livraison (le client vient chercher). Aucun livreur ne peut être
    // assigné ; la remise en main propre se fait via le statut « Remise »
    // (ready_for_pickup → delivered), jamais via la dimension livraison.
    if (order.fulfillment === "pickup") {
      return NextResponse.json(
        { error: "Commande en retrait en boutique : la livraison ne s'applique pas. Marquez la commande « Remise » au moment de la remise en main propre." },
        { status: 400 },
      )
    }

    if (deliveryStatus === order.deliveryStatus) {
      return NextResponse.json({ error: "La livraison est déjà dans cet état." }, { status: 400 })
    }

    // Transition validée par le graphe serveur
    if (!canTransitionDelivery(order.deliveryStatus, deliveryStatus)) {
      return NextResponse.json(
        { error: `Transition de livraison interdite : ${order.deliveryStatus} → ${deliveryStatus}.` },
        { status: 400 },
      )
    }

    // Échec : MOTIF STRUCTURÉ OBLIGATOIRE (jamais d'échec silencieux)
    let reasonLabel = ""
    if (deliveryStatus === "failed") {
      if (!DELIVERY_FAILURE_REASONS.includes(reasonKey as never)) {
        return NextResponse.json(
          { error: `Motif d'échec obligatoire (un parmi : ${DELIVERY_FAILURE_REASONS.join(", ")}).` },
          { status: 400 },
        )
      }
      reasonLabel = DELIVERY_FAILURE_LABELS[reasonKey] ?? reasonKey
    }

    const data: {
      deliveryStatus: string
      deliveryReason: string
      deliveryAttempts?: number
    } = {
      deliveryStatus,
      deliveryReason: reasonLabel || (deliveryStatus === "assigned" ? "" : order.deliveryReason),
    }

    // Relance après échec : on repart en « assigned » → tentative supplémentaire tracée
    if (order.deliveryStatus === "failed" && deliveryStatus === "assigned") {
      data.deliveryAttempts = order.deliveryAttempts + 1
    }
    // Retour définitif
    if (deliveryStatus === "returned") {
      data.deliveryReason = reasonLabel || reasonNote || order.deliveryReason
    }

    await db.order.update({ where: { id }, data })

    // Alignement commande : colis remis ⇒ commande livrée ; retour ⇒ commande retournée
    if (deliveryStatus === "delivered" && order.status !== "delivered") {
      await db.order.update({ where: { id }, data: { status: "delivered" } })
    }
    if (deliveryStatus === "returned" && !["returned", "refunded"].includes(order.status)) {
      await db.order.update({ where: { id }, data: { status: "returned" } })
      // LOT 1 — restitution du stock au retour définitif du colis (idempotent).
      await restoreOrderStock(
        order.id,
        { type: "owner", id: user.id, label: actorLabel },
        "Stock restitué (retour livraison)",
      )
    }

    // Réponse : état FRAIS (les alignements ci-dessus ne sont pas dans `data`)
    const updated = await db.order.findUniqueOrThrow({ where: { id } })

    // Événement immuable
    const eventType =
      deliveryStatus === "failed" ? "delivery_failed"
      : deliveryStatus === "returned" ? "delivery_returned"
      : order.deliveryStatus === "failed" && deliveryStatus === "assigned" ? "delivery_retry"
      : "delivery_updated"

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: eventType,
        actorType: "owner",
        actorId: user.id,
        actorLabel,
        oldValue: order.deliveryStatus,
        newValue: deliveryStatus,
        reason:
          reasonLabel || reasonNote
            ? `${reasonLabel}${reasonNote ? (reasonLabel ? " — " : "") + reasonNote : ""}`.trim()
            : undefined,
      },
    })

    await logAudit({
      action: `order.delivery.${eventType}`,
      target: `order:${order.ref}`,
      detail: `Livraison ${order.deliveryStatus} → ${deliveryStatus}${reasonLabel ? ` — motif : ${reasonLabel}` : ""}${data.deliveryAttempts ? ` (tentative #${data.deliveryAttempts})` : ""} — par ${actorLabel}`,
      actorType: "owner",
      actorId: user.id,
      entityType: "order",
      entityId: order.id,
    })

    // LOT 3 — Notifications d'événements (§20) — jamais bloquant.
    const notifyCtx = {
      storeId: order.storeId,
      storeName: order.store.name,
      storeWhatsapp: order.store.whatsapp,
      orderId: order.id,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      totalFC: order.totalFC,
      paymentStatus: order.paymentStatus,
      actorType: "owner",
    }
    if (deliveryStatus === "delivered") {
      await notifyOrderEvent("order_delivered", notifyCtx)
    } else if (deliveryStatus === "failed") {
      await notifyOrderEvent("delivery_failed", { ...notifyCtx, reason: reasonLabel })
    } else if (deliveryStatus === "returned") {
      await notifyOrderEvent("order_returned", notifyCtx)
    } else if (order.deliveryStatus === "failed" && deliveryStatus === "assigned") {
      await notifyOrderEvent("delivery_retry", notifyCtx)
    }

    return NextResponse.json({ order: { ...updated, status: updated.status } })
  } catch (e) {
    console.error("PATCH /api/orders/delivery", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
