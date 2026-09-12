import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isMomoLive } from "@/lib/mobile-money"
import { getUserFromRequest, unauthorized, forbidden } from "@/lib/auth"
import { isAdminRequest } from "@/lib/admin"
import { isPaymentSimulationEnabled, simulationDisabledResponse } from "@/lib/simulation"

// POST /api/payments/simulate-confirm — simule la validation du push USSD par
// le client (comme si le PIN avait été saisi sur son téléphone).
//
// Kill-switch (audit F-02) : DÉSACTIVÉ par défaut — production incluse — même
// quand l'agrégateur mobile money n'est pas configuré. Nécessite
// PAYMENT_SIMULATION=on (mode démo explicite) ET agrégateur absent.
// Même en démo, la confirmation n'est JAMAIS anonyme : seul l'ACHETEUR de la
// commande (session) ou l'ADMINISTRATEUR peut simuler la confirmation. Les
// commandes legacy sans compte (userId null) ne sont confirmables que par
// l'admin. En production : seul le webhook agrégateur confirme les paiements.
export async function POST(req: NextRequest) {
  try {
    // Kill-switch EN TÊTE : aucun traitement si la simulation n'est pas
    // explicitement activée dans cet environnement (403 même anonyme).
    if (!isPaymentSimulationEnabled()) return simulationDisabledResponse()

    if (isMomoLive()) {
      return NextResponse.json(
        { error: "Mode live actif : la simulation est désactivée. Le webhook agrégateur confirme les paiements." },
        { status: 403 },
      )
    }

    const body = await req.json().catch(() => null)
    const ref = String(body?.ref || "").trim()
    if (!ref) return NextResponse.json({ error: "Référence requise." }, { status: 400 })

    const order = await db.order.findUnique({ where: { ref } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })
    if (order.paymentMethod === "cash") {
      return NextResponse.json({ error: "Cette commande est payée en espèces." }, { status: 400 })
    }
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, duplicate: true, paymentStatus: "paid" })
    }

    // Authentification OBLIGATOIRE même en mode démo (audit F-02) :
    // l'acheteur de la commande (session) ou l'administrateur — jamais un
    // anonyme, jamais un tiers.
    if (!isAdminRequest(req)) {
      const user = await getUserFromRequest(req)
      if (!user) return unauthorized()
      if (!order.userId || order.userId !== user.id) {
        return forbidden(
          "Seul l'acheteur de cette commande peut simuler la confirmation de son paiement.",
        )
      }
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "paid",
        paidAt: new Date(),
        paymentRef: order.paymentRef || `SIM-${order.ref}`,
        status: order.status === "new" ? "paid" : order.status,
      },
    })
    return NextResponse.json({ ok: true, ref: updated.ref, paymentStatus: updated.paymentStatus })
  } catch (e) {
    console.error("POST /api/payments/simulate-confirm", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
