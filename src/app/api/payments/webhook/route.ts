import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isWebhookAuthorized } from "@/lib/mobile-money"

// POST /api/payments/webhook — Callback de l'agrégateur mobile money (pattern FlexPay)
// Payload type : { code: "0", reference: "KIN-XXXX", transactionRef: "...", ... }
// code === "0" → paiement réussi (le client a validé le push USSD avec son PIN).
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    let body: Record<string, unknown> | null = null
    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
    }

    // Authentification du callback (token configuré via MOMO_CALLBACK_TOKEN)
    const tokenInBody = typeof body.callbackToken === "string" ? body.callbackToken : null
    const tokenInQuery = req.nextUrl.searchParams.get("token")
    if (!isWebhookAuthorized(tokenInBody, tokenInQuery)) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 })
    }

    const code = String(body.code ?? "")
    const reference = String(body.reference ?? "").trim()
    const transactionRef = String(body.transactionRef ?? "").trim()
    if (!reference) return NextResponse.json({ error: "Référence manquante." }, { status: 400 })

    const order = await db.order.findUnique({ where: { ref: reference } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // Idempotence : déjà traitée
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    if (code === "0") {
      const updated = await db.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "paid",
          paidAt: new Date(),
          paymentRef: transactionRef || order.paymentRef,
          // Une commande payée en ligne est automatiquement marquée "paid" côté vendeur
          status: order.status === "new" ? "paid" : order.status,
        },
      })
      return NextResponse.json({ ok: true, ref: updated.ref, paymentStatus: updated.paymentStatus })
    }

    // Tout autre code = échec du paiement
    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed" },
    })
    return NextResponse.json({ ok: true, ref: order.ref, paymentStatus: "failed" })
  } catch (e) {
    console.error("POST /api/payments/webhook", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
