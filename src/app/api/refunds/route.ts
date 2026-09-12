import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { isFeatureOn, getConfigValue } from "@/lib/config-registry"
import { logAudit } from "@/lib/audit"

// POST /api/refunds — Demande de remboursement (V10)
// Client (propriétaire de la commande via userId serveur) OU vendeur (boutique).
// La validation et l'exécution restent des décisions ADMIN (jamais automatiques).
export async function POST(req: NextRequest) {
  try {
    if (!(await isFeatureOn("refunds"))) {
      return NextResponse.json({ error: "Les remboursements sont désactivés pour le moment." }, { status: 403 })
    }

    const body = await req.json()
    const orderId = String(body.orderId || "")
    const reason = String(body.reason || "").slice(0, 300)
    if (!orderId) return NextResponse.json({ error: "orderId requis." }, { status: 400 })
    if (!reason) return NextResponse.json({ error: "Explique le motif de ta demande." }, { status: 400 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // Autorisation : client propriétaire de la commande OU propriétaire de la boutique
    let requestedByType: "customer" | "owner" = "customer"
    const isOrderCustomer = order.userId === user.id
    if (!isOrderCustomer) {
      const guard = await requireStoreOwner(req, { id: order.storeId })
      if (!guard.ok) return guard.response
      requestedByType = "owner"
    }

    // Conditions métier : un remboursement se demande sur une commande réglée
    // (payée en ligne ou encaissée) — pas sur une commande annulée déjà clôturée.
    if (!["paid", "delivered", "returned", "disputed"].includes(order.status) &&
        order.paymentStatus !== "paid") {
      return NextResponse.json(
        { error: "Le remboursement ne s'applique qu'à une commande réglée (payée, livrée, retournée ou en litige)." },
        { status: 400 },
      )
    }

    // Anti-abus : max N demandes ouvertes par boutique
    const maxOpen = await getConfigValue<number>("business.maxOpenRefundsPerStore")
    const openCount = await db.refund.count({
      where: { order: { storeId: order.storeId }, status: { in: ["requested", "approved"] } },
    })
    if (openCount >= maxOpen) {
      return NextResponse.json(
        { error: "Trop de demandes de remboursement ouvertes pour cette boutique — traitement en cours par l'équipe." },
        { status: 429 },
      )
    }

    // Une seule demande active par commande
    const existing = await db.refund.findFirst({
      where: { orderId, status: { in: ["requested", "approved"] } },
    })
    if (existing) {
      return NextResponse.json({ error: "Une demande de remboursement est déjà en cours pour cette commande." }, { status: 409 })
    }

    // Montant : total par défaut (clampé) — l'admin peut ajuster à la validation
    const amountUSD = Math.max(0, Math.min(order.totalUSD, Number(body.amountUSD) || order.totalUSD))

    const refund = await db.refund.create({
      data: {
        orderId,
        amountUSD,
        method: ["mobile_money", "cash", "other"].includes(String(body.method)) ? String(body.method) : "mobile_money",
        reason,
        status: "requested",
        requestedByType,
        requestedById: user.id,
      },
    })

    // La commande passe en litige le temps de l'analyse (traçable, réversible)
    if (!["disputed"].includes(order.status)) {
      await db.order.update({ where: { id: orderId }, data: { status: "disputed" } })
    }

    await db.orderEvent.create({
      data: {
        orderId,
        type: "refund_requested",
        actorType: requestedByType === "customer" ? "customer" : "owner",
        actorId: user.id,
        actorLabel: user.name || user.email,
        newValue: `$${amountUSD.toFixed(2)}`,
        reason,
      },
    })

    await logAudit({
      action: "refund.requested",
      target: `order:${order.ref}`,
      detail: `${requestedByType === "customer" ? "Client" : "Vendeur"} ${user.name || user.email} demande $${amountUSD.toFixed(2)} — ${reason}`,
      actorType: requestedByType === "customer" ? "customer" : "owner",
      actorId: user.id,
      entityType: "order",
      entityId: orderId,
    })

    return NextResponse.json({ refund }, { status: 201 })
  } catch (e) {
    console.error("POST /api/refunds", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/refunds?orderId= — Voir les remboursements d'une commande (client propriétaire / owner / admin)
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId) return NextResponse.json({ error: "Paramètre orderId requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()

    const isOrderCustomer = order.userId === user.id
    const isAdmin = (await import("@/lib/admin")).guardAdmin(req) === null
    if (!isOrderCustomer && !isAdmin) {
      const guard = await requireStoreOwner(req, { id: order.storeId })
      if (!guard.ok) return guard.response
    }

    const refunds = await db.refund.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } })
    return NextResponse.json({ refunds })
  } catch (e) {
    console.error("GET /api/refunds", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
