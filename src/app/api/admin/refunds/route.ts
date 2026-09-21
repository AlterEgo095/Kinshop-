import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
// Phase E — ledger en mode ombre : contrepartie comptable du remboursement
// exécuté (écriture négative idempotente, jamais bloquante)
import { recordRefundEntry } from "@/lib/finance"

const REFUND_STATUSES = ["requested", "approved", "rejected", "executed"]

// GET /api/admin/refunds — Toutes les demandes de remboursement (Super Admin)
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const refunds = await db.refund.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        order: {
          select: {
            ref: true, totalUSD: true, totalFC: true, status: true, paymentStatus: true,
            paymentMethod: true, customerName: true,
            store: { select: { name: true, slug: true } },
          },
        },
      },
    })
    return NextResponse.json({ refunds })
  } catch (e) {
    console.error("GET /api/admin/refunds", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/refunds — Décision admin : approuver / refuser / exécuter
// Body : { id, action: "approve" | "reject" | "execute", amountUSD?, reference?, proofNote? }
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const action = String(body.action || "")
    if (!id || !["approve", "reject", "execute"].includes(action)) {
      return NextResponse.json({ error: "Paramètres requis : id + action (approve|reject|execute)." }, { status: 400 })
    }

    const refund = await db.refund.findUnique({ where: { id }, include: { order: true } })
    if (!refund) return NextResponse.json({ error: "Remboursement introuvable." }, { status: 404 })

    const amount = body.amountUSD !== undefined
      ? Math.max(0, Math.min(refund.order.totalUSD, Number(body.amountUSD) || 0))
      : refund.amountUSD

    let newStatus = refund.status
    if (action === "approve") {
      if (refund.status !== "requested") {
        return NextResponse.json({ error: `Action impossible depuis le statut « ${refund.status} ».` }, { status: 400 })
      }
      newStatus = "approved"
    } else if (action === "reject") {
      if (refund.status === "executed") {
        return NextResponse.json({ error: "Un remboursement exécuté ne peut pas être refusé." }, { status: 400 })
      }
      newStatus = "rejected"
    } else if (action === "execute") {
      if (refund.status !== "approved") {
        return NextResponse.json({ error: "Un remboursement doit d'abord être approuvé avant exécution." }, { status: 400 })
      }
      newStatus = "executed"
    }

    const updated = await db.refund.update({
      where: { id },
      data: {
        status: newStatus,
        amountUSD: amount,
        reference: body.reference !== undefined ? String(body.reference).slice(0, 100) : refund.reference,
        proofNote: body.proofNote !== undefined ? String(body.proofNote).slice(0, 300) : refund.proofNote,
        handledBy: "Super Admin (console)",
      },
    })

    // Exécution : paiement de la commande → refunded + commande clôturée
    if (newStatus === "executed") {
      await db.order.update({
        where: { id: refund.orderId },
        data: { paymentStatus: "refunded", status: "refunded" },
      })
      // Phase E — Ledger (mode ombre) : contrepartie comptable du
      // remboursement (écriture négative) — idempotent par remboursement.
      await recordRefundEntry({
        storeId: refund.order.storeId,
        orderId: refund.orderId,
        orderRef: refund.order.ref,
        refundId: refund.id,
        amountUSD: amount,
        totalUSD: refund.order.totalUSD,
        totalFC: refund.order.totalFC,
        reference:
          body.reference !== undefined ? String(body.reference).slice(0, 100) : refund.reference,
      })
    }
    // Refus : la commande repart du litige vers son état antérieur pertinent
    if (newStatus === "rejected" && refund.order.status === "disputed") {
      const restored = refund.order.paymentStatus === "paid" ? "delivered" : "confirmed"
      await db.order.update({ where: { id: refund.orderId }, data: { status: restored } })
    }

    const eventType =
      newStatus === "approved" ? "refund_approved"
      : newStatus === "rejected" ? "refund_rejected"
      : "refund_executed"

    await db.orderEvent.create({
      data: {
        orderId: refund.orderId,
        type: eventType,
        actorType: "admin",
        actorLabel: "Super Admin",
        oldValue: refund.status,
        newValue: newStatus,
        reason:
          (body.proofNote ? String(body.proofNote).slice(0, 300) : "") ||
          `$${amount.toFixed(2)}${body.reference ? ` — réf ${String(body.reference).slice(0, 100)}` : ""}`,
      },
    })

    await logAdminAction(
      `refund.${newStatus}`,
      `order:${refund.order.ref}`,
      `Remboursement $${amount.toFixed(2)} → ${newStatus}${body.reference ? ` (réf ${body.reference})` : ""}`,
    )

    return NextResponse.json({ refund: updated })
  } catch (e) {
    console.error("PATCH /api/admin/refunds", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
