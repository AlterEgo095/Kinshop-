import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/payments/status?ref=KIN-XXXX — Statut du paiement d'une commande (polling client)
export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("ref")?.trim()
    if (!ref) return NextResponse.json({ error: "Référence requise." }, { status: 400 })

    const order = await db.order.findUnique({
      where: { ref },
      select: {
        ref: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentRef: true,
        payerPhone: true,
        paidAt: true,
        totalFC: true,
        status: true,
      },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    return NextResponse.json({
      ref: order.ref,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      paidAt: order.paidAt,
      totalFC: order.totalFC,
      orderStatus: order.status,
    })
  } catch (e) {
    console.error("GET /api/payments/status", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
