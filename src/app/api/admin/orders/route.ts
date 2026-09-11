import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

const ORDER_STATUSES = ["new", "paid", "confirmed", "delivered", "cancelled"]
const PAYMENT_STATUSES = ["unpaid", "pending", "paid", "failed"]

// GET /api/admin/orders — Toutes les commandes de la plateforme
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
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
    if (status && ORDER_STATUSES.includes(status)) {
      list = list.filter((o) => o.status === status)
    }
    // V2 — filtre par statut de paiement
    if (pay && PAYMENT_STATUSES.includes(pay)) {
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

// PATCH /api/admin/orders — Changer le statut d'une commande / confirmer un paiement (V2)
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
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
      if (!ORDER_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
      }
      data.status = status
    }
    if (paymentStatus) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return NextResponse.json({ error: "Statut de paiement invalide." }, { status: 400 })
      }
      data.paymentStatus = paymentStatus
      if (paymentStatus === "paid") {
        data.paidAt = new Date()
        if (order.status === "new") data.status = "paid"
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    const updated = await db.order.update({ where: { id }, data })
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

// DELETE /api/admin/orders?id=xxx — Supprimer une commande
export async function DELETE(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    await db.order.delete({ where: { id } })
    await logAdminAction("order.delete", `order:${order.ref}`, `Suppression de la commande ${order.ref}`)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
