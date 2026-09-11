import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isMomoLive } from "@/lib/mobile-money"

// POST /api/payments/simulate-confirm — Démo uniquement : simule la validation du
// push USSD par le client (comme si le PIN avait été saisi sur son téléphone).
// Refusé (403) dès que MOMO_TOKEN + MOMO_MERCHANT sont configurés (mode live).
export async function POST(req: NextRequest) {
  try {
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
