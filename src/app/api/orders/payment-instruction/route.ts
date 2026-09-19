import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"
import { rateLimit, clientIp } from "@/lib/ratelimit"

// P1 (Phase C) — Brique 1/4 : lecture du SNAPSHOT des coordonnées de paiement
// direct figées à la création de la commande (OrderPaymentInstruction).
//
// ⚠️ SNAPSHOT PROTÉGÉ : les coordonnées d'encaissement du vendeur ne sont
// JAMAIS exposées publiquement. Cette route exige :
//   - la session de l'acheteur de la commande (dérivation serveur), ou
//   - la session administrateur.
// Un tiers (même authentifié) reçoit 403 — la référence séquentielle seule
// ne donne accès à aucune coordonnée bancaire de collecte.
//
// La route est utilisée par « Mes commandes » (bouton « Déclarer le paiement »)
// et par le suivi acheteur après coup. Le suivi PUBLIC (track) n'y a pas accès.

export async function GET(req: NextRequest) {
  try {
    if (!rateLimit(`payment-instruction:${clientIp(req)}`, 30, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }

    const ref = (req.nextUrl.searchParams.get("ref") || "").trim().toUpperCase()
    if (!ref) return NextResponse.json({ error: "Paramètre ref requis." }, { status: 400 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized("Connecte-toi pour voir les coordonnées de paiement.")

    const order = await db.order.findUnique({
      where: { ref },
      include: { paymentInstruction: true },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const isAdmin = user.role === "admin"
    const isBuyer = order.userId !== null && order.userId === user.id
    if (!isBuyer && !isAdmin) {
      return NextResponse.json(
        { error: "Seul l'acheteur de cette commande (ou l'administration) peut voir ces coordonnées." },
        { status: 403 },
      )
    }

    if (!order.paymentInstruction) {
      return NextResponse.json({
        instruction: null,
        note:
          "Le vendeur n'a pas configuré de coordonnées de paiement direct pour ce moyen. Contacte-le sur WhatsApp pour convenir du paiement.",
      })
    }

    return NextResponse.json({
      instruction: {
        provider: order.paymentInstruction.provider,
        accountName: order.paymentInstruction.accountName,
        accountNumber: order.paymentInstruction.accountNumber,
        network: order.paymentInstruction.network,
        instructions: order.paymentInstruction.instructions,
        createdAt: order.paymentInstruction.createdAt.toISOString(),
      },
      order: {
        ref: order.ref,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        totalFC: order.totalFC,
        totalUSD: order.totalUSD,
      },
    })
  } catch (e) {
    console.error("GET /api/orders/payment-instruction", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
