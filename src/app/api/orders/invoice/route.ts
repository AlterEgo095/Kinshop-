import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { guardAdmin } from "@/lib/admin"
import { isFeatureOn } from "@/lib/config-registry"
import { makeSequentialInvoiceNumber, invoiceHashV2 } from "@/lib/invoice-integrity"
import { withStoreQuotaWrite } from "@/lib/quota-guard"
import { logAudit } from "@/lib/audit"
import type { OrderItem } from "@/lib/kinshop"

// POST /api/orders/invoice — Émettre la FACTURE de commande (V10)
// Accès : propriétaire de la boutique (dérivé serveur) ou admin.
// - numéro séquentiel INV-YYYY-NNNNNN (compteur atomique, jamais réutilisé)
// - empreinte d'intégrité sha256 V2 (contenu canonique COMPLET : totaux +
//   lignes + client + échéance/note) — la facture émise n'est jamais modifiée
//   silencieusement : rectification = annulation/avoir + nouvelle facture
// - une seule facture active par commande — vérification + création dans UNE
//   transaction atomique (mutex boutique, P4 F4-7 : pas de course TOCTOU)
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

    let items: OrderItem[] = []
    try {
      const parsed = JSON.parse(order.items)
      if (Array.isArray(parsed)) items = parsed
    } catch {
      // items invalide
    }

    // Items de facture au format KinFacture [{desc, qty, unitFC}] — prix GELÉS au
    // moment de la commande (taux dérivé de la commande, jamais du frontend).
    const orderRate = order.totalUSD > 0 ? order.totalFC / order.totalUSD : 0
    const invoiceItems = items.map((it) => ({
      desc: it.name,
      qty: it.qty,
      unitFC: Math.round(it.priceUSD * orderRate),
    }))
    const itemsJson = JSON.stringify(invoiceItems)
    const note = `Commande ${order.ref} — paiement ${order.paymentMethod} (${order.paymentStatus})${order.deliveryZone ? ` — livraison : ${order.deliveryZone}` : ""}`

    // P4 (F4-7) : le contrôle « une seule facture active » et la création
    // partagent la même unité atomique (mutex boutique + transaction).
    const result = await withStoreQuotaWrite(order.storeId, async (tx) => {
      const existingActive = await tx.invoice.findFirst({
        where: { orderId, status: { notIn: ["cancelled", "credited"] } },
      })
      if (existingActive) {
        return { conflict: true as const, invoice: null, number: existingActive.number }
      }

      const number = await makeSequentialInvoiceNumber(tx)
      const now = new Date()
      const hash = invoiceHashV2({
        number,
        orderId: order.id,
        storeId: order.storeId,
        totalUSD: order.totalUSD,
        totalFC: order.totalFC,
        issuedAt: now.toISOString(),
        itemsJson,
        clientName: order.customerName,
        clientPhone: order.customerPhone,
        dueDate: "",
        note,
      })

      const invoice = await tx.invoice.create({
        data: {
          number,
          storeId: order.storeId,
          orderId: order.id,
          source: "order",
          hash,
          version: 2,
          clientName: order.customerName,
          clientPhone: order.customerPhone,
          items: itemsJson,
          totalFC: order.totalFC,
          totalUSD: order.totalUSD,
          note,
          status: order.paymentStatus === "paid" ? "paid" : "sent",
          paidAt: order.paidAt,
          createdAt: now,
        },
      })

      await tx.orderEvent.create({
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

      return { conflict: false as const, invoice, number: "" }
    })

    if (result.conflict) {
      return NextResponse.json(
        { error: `Une facture active existe déjà pour cette commande (${result.number}).`, number: result.number },
        { status: 409 },
      )
    }

    await logAudit({
      action: "invoice.generated",
      target: `invoice:${result.invoice.number}`,
      detail: `Commande ${order.ref} — ${order.totalFC} FC — émise par ${isAdmin ? "admin" : "vendeur"}`,
      actorType: isAdmin ? "admin" : "owner",
      actorId: user.id,
      entityType: "invoice",
      entityId: result.invoice.id,
    })

    return NextResponse.json({ invoice: result.invoice }, { status: 201 })
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
