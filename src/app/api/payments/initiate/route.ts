import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { PAYMENT_LABELS, normalizePhone } from "@/lib/kinshop"
import { initiateMomoPayment } from "@/lib/mobile-money"

// POST /api/payments/initiate — Lance le paiement mobile money d'une commande
// body : { ref, payerPhone? }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const ref = String(body?.ref || "").trim()
    if (!ref) return NextResponse.json({ error: "Référence de commande requise." }, { status: 400 })

    const order = await db.order.findUnique({ where: { ref }, include: { store: { select: { name: true } } } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })
    if (order.paymentMethod === "cash") {
      return NextResponse.json({ error: "Cette commande est payée en espèces à la livraison." }, { status: 400 })
    }
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true, paymentStatus: "paid" })
    }

    const payerPhone = normalizePhone(String(body?.payerPhone || "") || order.customerPhone)
    if (payerPhone.length < 9) {
      return NextResponse.json({ error: "Numéro mobile money invalide." }, { status: 400 })
    }

    const result = await initiateMomoPayment({
      reference: order.ref,
      amountFC: order.totalFC,
      phone: payerPhone,
      description: `KinShop ${order.store.name} — commande ${order.ref}`,
    })

    if (!result.ok) {
      await db.order.update({
        where: { id: order.id },
        data: { paymentStatus: "failed", payerPhone },
      })
      return NextResponse.json({ error: result.message }, { status: 502 })
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "pending", paymentRef: result.paymentRef, payerPhone },
    })

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      order: {
        ref: updated.ref,
        totalFC: updated.totalFC,
        paymentMethod: updated.paymentMethod,
        paymentLabel: PAYMENT_LABELS[updated.paymentMethod as keyof typeof PAYMENT_LABELS] || updated.paymentMethod,
        paymentStatus: updated.paymentStatus,
        payerPhone: updated.payerPhone,
      },
    })
  } catch (e) {
    console.error("POST /api/payments/initiate", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
