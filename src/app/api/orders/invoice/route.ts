import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { guardAdmin } from "@/lib/admin"
import { isFeatureOn } from "@/lib/config-registry"
import { makeSequentialInvoiceNumber, invoiceHash } from "@/lib/invoice-integrity"
import { logAudit } from "@/lib/audit"
import type { OrderItem } from "@/lib/kinshop"

// POST /api/orders/invoice — Émettre la FACTURE de commande (V10)
// Accès : propriétaire de la boutique (dérivé serveur) ou admin.
// - numéro séquentiel INV-YYYY-NNNNNN (compteur atomique, jamais réutilisé)
// - empreinte d'intégrité sha256 (contenu canonique) — la facture émise n'est
//   jamais modifiée silencieusement : rectification = annulation/avoir + nouvelle facture
// - une seule facture active par commande
export async function POST(req: NextRequest) {
  try {
    if (!(await isFeatureOn("invoices"))) {
      return NextResponse.json({ error: "La facturation est désactivée pour le moment." }, { status: 403 })
    }

    const body = await req.json()
    const orderId = String(body.orderId || "")
    if (!orderId) return NextResponse.json({ error: "orderId requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId }, include: { store: true } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // Autorisation : owner de la boutique OU admin PIN
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()
    const isAdmin = guardAdmin(req) === null
    if (!isAdmin) {
      const guard = await requireStoreOwner(req, { id: order.storeId })
      if (!guard.ok) return guard.response
    }

    // Une commande doit être au minimum confirmée pour être facturée
    if (["new", "paid", "cancelled"].includes(order.status)) {
      return NextResponse.json(
        { error: "La facturation est possible une fois la commande confirmée (pas avant)." },
        { status: 400 },
      )
    }

    // Une seule facture ACTIVE par commande (annulée/avoir → nouvelle autorisée)
    const existingActive = await db.invoice.findFirst({
      where: { orderId, status: { notIn: ["cancelled", "credited"] } },
    })
    if (existingActive) {
      return NextResponse.json(
        { error: `Une facture active existe déjà pour cette commande (${existingActive.number}).`, number: existingActive.number },
        { status: 409 },
      )
    }

    let items: OrderItem[] = []
    try {
      const parsed = JSON.parse(order.items)
      if (Array.isArray(parsed)) items = parsed
    } catch {
      // items invalide
    }

    const number = await makeSequentialInvoiceNumber()
    const now = new Date()
    // Items de facture au format KinFacture [{desc, qty, unitFC}] — prix GELÉS au
    // moment de la commande (taux dérivé de la commande, jamais du frontend).
    const orderRate = order.totalUSD > 0 ? order.totalFC / order.totalUSD : 0
    const invoiceItems = items.map((it) => ({
      desc: it.name,
      qty: it.qty,
      unitFC: Math.round(it.priceUSD * orderRate),
    }))
    const hash = invoiceHash({
      number,
      orderId: order.id,
      storeId: order.storeId,
      totalUSD: order.totalUSD,
      totalFC: order.totalFC,
      issuedAt: now.toISOString(),
    })

    const invoice = await db.invoice.create({
      data: {
        number,
        storeId: order.storeId,
        orderId: order.id,
        source: "order",
        hash,
        clientName: order.customerName,
        clientPhone: order.customerPhone,
        items: JSON.stringify(invoiceItems),
        totalFC: order.totalFC,
        totalUSD: order.totalUSD,
        note: `Commande ${order.ref} — paiement ${order.paymentMethod} (${order.paymentStatus})${order.deliveryZone ? ` — livraison : ${order.deliveryZone}` : ""}`,
        status: order.paymentStatus === "paid" ? "paid" : "sent",
        paidAt: order.paidAt,
        createdAt: now,
      },
    })

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "invoice_generated",
        actorType: isAdmin ? "admin" : "owner",
        actorId: user.id,
        actorLabel: user.name || user.email,
        newValue: number,
        reason: `Facture ${number} émise (${order.totalFC} FC)`,
      },
    })

    await logAudit({
      action: "invoice.generated",
      target: `invoice:${number}`,
      detail: `Commande ${order.ref} — ${order.totalFC} FC — émise par ${isAdmin ? "admin" : "vendeur"}`,
      actorType: isAdmin ? "admin" : "owner",
      actorId: user.id,
      entityType: "invoice",
      entityId: invoice.id,
    })

    return NextResponse.json({ invoice }, { status: 201 })
  } catch (e) {
    console.error("POST /api/orders/invoice", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/orders/invoice?orderId= — Facture(s) de la commande (owner / client / admin)
export async function GET(req: NextRequest) {
  try {
    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId) return NextResponse.json({ error: "Paramètre orderId requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const user = await getUserFromRequest(req)
    const isAdmin = user ? guardAdmin(req) === null : false
    const isCustomer = user && order.userId === user.id
    if (!isAdmin && !isCustomer) {
      if (!user) return unauthorized()
      const guard = await requireStoreOwner(req, { id: order.storeId })
      if (!guard.ok) return guard.response
    }

    const invoices = await db.invoice.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } })
    return NextResponse.json({ invoices })
  } catch (e) {
    console.error("GET /api/orders/invoice", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
