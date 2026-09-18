import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { PAYMENT_LABELS, normalizePhone } from "@/lib/kinshop"
import { initiateMomoPayment } from "@/lib/mobile-money"
import { isPaymentSimulationEnabled } from "@/lib/simulation"
import { getUserFromRequest } from "@/lib/auth"
import { getAdminUser } from "@/lib/admin"

// POST /api/payments/initiate — Lance le paiement mobile money d'une commande
// body : { ref, payerPhone? }
// P3 — encadrement : seul l'acheteur de la commande (session serveur) ou
// l'administration peut lancer une initiation de paiement.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const ref = String(body?.ref || "").trim()
    if (!ref) return NextResponse.json({ error: "Référence de commande requise." }, { status: 400 })

    const order = await db.order.findUnique({ where: { ref }, include: { store: { select: { name: true } } } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    // P3 — garde d'identité AVANT toute action : l'initiation est réservée à
    // l'acheteur propriétaire de la commande (dérivation serveur par session,
    // jamais un paramètre) ou à l'administration. Les commandes legacy sans
    // compte (userId null) passent uniquement par l'administration.
    const admin = await getAdminUser(req)
    if (!admin) {
      const user = await getUserFromRequest(req)
      if (!user) {
        return NextResponse.json({ error: "Connexion requise pour lancer le paiement." }, { status: 401 })
      }
      if (order.userId && order.userId !== user.id) {
        return NextResponse.json({ error: "Cette commande ne t'appartient pas." }, { status: 403 })
      }
      if (!order.userId) {
        return NextResponse.json(
          { error: "Cette commande n'est pas liée à un compte : contacte le support pour le paiement." },
          { status: 403 },
        )
      }
    }

    if (order.paymentMethod === "cash") {
      return NextResponse.json({ error: "Cette commande est payée en espèces à la livraison." }, { status: 400 })
    }
    if (order.paymentStatus === "paid") {
      return NextResponse.json({ ok: true, alreadyPaid: true, paymentStatus: "paid" })
    }

    // Aucun fournisseur réel branché ET simulation désactivée (défaut, production
    // incluse) → aucun flux de paiement proposé : on n'entre JAMAIS dans un
    // parcours de démonstration non explicite (audit F-02).
    const momoConfigured = Boolean(
      process.env.MOMO_TOKEN?.trim() && process.env.MOMO_MERCHANT?.trim(),
    )
    if (!momoConfigured && !isPaymentSimulationEnabled()) {
      return NextResponse.json(
        {
          error:
            "Le paiement mobile money n'est pas encore disponible sur la plateforme. Contacte le vendeur pour convenir d'un paiement direct.",
        },
        { status: 503 },
      )
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
