import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"

// GET /api/orders/events?orderId=xxx — Historique immuable d'une commande (V10)
// Accès : propriétaire de la boutique concernée (dérivé serveur) OU admin (PIN).
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId) return NextResponse.json({ error: "Paramètre orderId requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // 1) Admin PIN → accès total
    const { guardAdmin } = await import("@/lib/admin")
    const denied = guardAdmin(req)
    if (!denied) {
      const events = await db.orderEvent.findMany({
        where: { orderId },
        orderBy: { createdAt: "asc" },
      })
      return NextResponse.json({ events, refunds: await db.refund.findMany({ where: { orderId } }) })
    }

    // 2) Propriétaire de la boutique
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()
    const guard = await requireStoreOwner(req, { id: order.storeId })
    if (!guard.ok) return guard.response

    const events = await db.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
    })
    const refunds = await db.refund.findMany({ where: { orderId } })

    return NextResponse.json({ events, refunds })
  } catch (e) {
    console.error("GET /api/orders/events", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
