import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isWebhookAuthorized } from "@/lib/mobile-money"

// POST /api/payments/webhook — Callback de l'agrégateur mobile money (pattern FlexPay)
// Payload type : { code: "0", reference: "KIN-XXXX", transactionRef: "...", ... }
// code === "0" → paiement réussi (le client a validé le push USSD avec son PIN).
export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON invalide." }, { status: 400 })
    }
    const body = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>

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
      // P3 — traçabilité : l'encaissement en ligne laisse une trace immuable dans
      // l'historique de la commande (même principe que l'encaissement cash).
      await db.orderEvent
        .create({
          data: {
            orderId: order.id,
            type: "payment_confirmed",
            actorType: "system",
            actorLabel: "Agrégateur (webhook)",
            newValue: "paid",
            reason: transactionRef
              ? `Paiement mobile money confirmé — réf opérateur ${transactionRef}`
              : "Paiement mobile money confirmé (callback agrégateur)",
          },
        })
        .catch((err) => console.error("orderEvent payment_confirmed (webhook)", err))
      return NextResponse.json({ ok: true, ref: updated.ref, paymentStatus: updated.paymentStatus })
    }

    // Tout autre code = échec du paiement
    await db.order.update({
      where: { id: order.id },
      data: { paymentStatus: "failed" },
    })
    // P3 — traçabilité : l'échec annoncé par l'agrégateur est historisé aussi.
    await db.orderEvent
      .create({
        data: {
          orderId: order.id,
          type: "payment_failed",
          actorType: "system",
          actorLabel: "Agrégateur (webhook)",
          newValue: "failed",
          reason: `Paiement mobile money échoué — code agrégateur ${code || "inconnu"}`,
        },
      })
      .catch((err) => console.error("orderEvent payment_failed (webhook)", err))
    return NextResponse.json({ ok: true, ref: order.ref, paymentStatus: "failed" })
  } catch (e) {
    console.error("POST /api/payments/webhook", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
