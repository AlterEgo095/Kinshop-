import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, getAdminUser, logAdminAction } from "@/lib/admin"
// P4 — le vocabulaire et le graphe de transitions font foi depuis lib/order-workflow
// (source unique partagée vendeur/serveur) : plus aucune liste locale V2.
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  canTransitionOrder,
  type OrderStatus,
  type PaymentStatus,
} from "@/lib/order-workflow"

// GET /api/admin/orders — Toutes les commandes de la plateforme
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").toLowerCase().trim()
    const status = sp.get("status") || ""
    const pay = sp.get("pay") || ""
    const storeId = sp.get("storeId") || ""

    const orders = await db.order.findMany({
      include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    })

    let list = orders
    if (status && ORDER_STATUSES.includes(status as OrderStatus)) {
      list = list.filter((o) => o.status === status)
    }
    // V10 — filtre par statut de paiement (vocabulaire workflow complet)
    if (pay && PAYMENT_STATUSES.includes(pay as PaymentStatus)) {
      list = list.filter((o) => o.paymentStatus === pay)
    }
    if (storeId) list = list.filter((o) => o.storeId === storeId)
    if (q) {
      list = list.filter(
        (o) =>
          o.ref.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerPhone.includes(q.replace(/\D/g, "") || "␀") ||
          o.store.name.toLowerCase().includes(q),
      )
    }

    return NextResponse.json({ orders: list, total: list.length })
  } catch (e) {
    console.error("GET /api/admin/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/orders — Changer le statut d'une commande / confirmer un paiement (V10)
// P4 — aligné sur le workflow serveur : mêmes constantes que les routes vendeur,
// transitions validées par le graphe, et chaque correction écrit un OrderEvent
// (actorType admin) dans l'historique immuable de la commande.
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const paymentStatus = String(body.paymentStatus || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const data: { status?: string; paymentStatus?: string; paidAt?: Date } = {}
    if (status) {
      if (!ORDER_STATUSES.includes(status as OrderStatus)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
      }
      if (status !== order.status && !canTransitionOrder(order.status, status)) {
        return NextResponse.json(
          { error: `Transition interdite : ${order.status} → ${status}. Utilise la séquence du workflow (ex : new → confirmed).` },
          { status: 400 },
        )
      }
      data.status = status
    }
    if (paymentStatus) {
      if (!PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)) {
        return NextResponse.json({ error: "Statut de paiement invalide." }, { status: 400 })
      }
      data.paymentStatus = paymentStatus
      if (paymentStatus === "paid") {
        data.paidAt = new Date()
        // Sémantique paiement (miroir du webhook agrégateur) : la commande
        // « new » passe à « paid » — hors graphe, comme pour l'encaissement en ligne.
        if (order.status === "new") data.status = "paid"
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    const updated = await db.order.update({ where: { id }, data })

    // P4 — traçabilité : la correction entre dans l'historique immuable de la
    // commande (le privilège admin reste total — seule la trace change).
    const admin = await getAdminUser(req)
    const adminLabel = admin ? `${admin.name || admin.email} (admin)` : "Administration"
    const events: {
      orderId: string
      type: string
      actorType: "admin"
      actorId: string
      actorLabel: string
      oldValue?: string
      newValue: string
      reason: string
    }[] = []
    if (status && status !== order.status) {
      events.push({
        orderId: order.id,
        type: "status_changed",
        actorType: "admin",
        actorId: admin?.id ?? "",
        actorLabel: adminLabel,
        oldValue: order.status,
        newValue: data.status ?? status,
        reason: "Correction manuelle (console admin)",
      })
    }
    if (paymentStatus && paymentStatus !== order.paymentStatus) {
      events.push({
        orderId: order.id,
        type:
          paymentStatus === "paid"
            ? "payment_confirmed"
            : paymentStatus === "failed"
              ? "payment_failed"
              : "note",
        actorType: "admin",
        actorId: admin?.id ?? "",
        actorLabel: adminLabel,
        oldValue: order.paymentStatus,
        newValue: paymentStatus,
        reason:
          paymentStatus === "paid"
            ? "Paiement confirmé manuellement par l'administration"
            : `Statut de paiement → ${paymentStatus} (correction admin)`,
      })
    }
    if (events.length > 0) {
      await db.orderEvent
        .createMany({ data: events })
        .catch((err) => console.error("orderEvent correction admin (P4)", err))
    }

    if (status) {
      await logAdminAction("order.status", `order:${order.ref}`, `Statut de ${order.ref} → ${status} (admin)`)
    }
    if (paymentStatus) {
      await logAdminAction(
        "order.payment",
        `order:${order.ref}`,
        `Paiement de ${order.ref} → ${paymentStatus} (admin, confirmé manuellement)`,
      )
    }

    return NextResponse.json({ order: updated })
  } catch (e) {
    console.error("PATCH /api/admin/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/admin/orders?id=xxx — Supprimer une commande (gouvernance restreinte V10)
// INTERDIT sur une commande réglée (paid/refunded) : l'historique financier et
// la traçabilité ne sont jamais détruits. Motif exigé pour les autres cas.
export async function DELETE(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    const reason = (req.nextUrl.searchParams.get("reason") || "").trim()
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })
    if (reason.length < 5) {
      return NextResponse.json({ error: "Motif de suppression obligatoire (min. 5 caractères)." }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    if (["paid", "refunded"].includes(order.paymentStatus)) {
      return NextResponse.json(
        { error: "Suppression interdite : cette commande est réglée. Utilise le remboursement ou l'annulation (trace conservée)." },
        { status: 409 },
      )
    }

    await db.order.delete({ where: { id } })
    await logAdminAction(
      "order.delete",
      `order:${order.ref}`,
      `Suppression de la commande ${order.ref} (${order.totalFC} FC) — motif : ${reason}`,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
