import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, clientIp } from "@/lib/ratelimit"

// P7 — anti-énumération : 30 requêtes / 5 min / IP (référence séquentielle,
// polling de paiement ponctuel seulement — l'usage légitime tient largement).
const PAY_STATUS_RATE_MAX = 30
const PAY_STATUS_RATE_WINDOW_MS = 5 * 60 * 1000

// GET /api/payments/status?ref=KIN-XXXX — Statut du paiement d'une commande (polling client)
export async function GET(req: NextRequest) {
  try {
    // P7 — garde anti-énumération (avant tout accès DB)
    if (!rateLimit(`paystatus:${clientIp(req)}`, PAY_STATUS_RATE_MAX, PAY_STATUS_RATE_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }

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
