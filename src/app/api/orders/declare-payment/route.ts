import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { rateLimit, clientIp } from "@/lib/ratelimit"
import { getActiveInstruction } from "@/lib/direct-payments"

// P1 (Phase C) — Brique 2 : DÉCLARATION du paiement par l'acheteur.
//
// L'acheteur authentifié propriétaire de la commande (dérivation serveur par
// session, jamais un paramètre) déclare qu'il a effectué le transfert sur le
// numéro Mobile Money du vendeur. La route :
//   1. vérifie que le moyen est un moyen Mobile Money direct (pas le cash) ;
//   2. vérifie que le statut de paiement est unpaid ou failed (déclaration
//      initiale ou re-déclaration après expiration — P8) ;
//   3. écrit paymentStatus = declared + declaredAt + la référence de
//      transaction déclarée comme preuve préliminaire (paymentRef) ;
//   4. historise l'événement immuable payment_declared ;
//   5. journalise l'action dans le journal d'audit global.
//
// ⚠️ RÈGLE ABSOLUE (prompt §12) : la déclaration ne devient JAMAIS un paiement
// confirmé par elle-même — c'est l'état intermédiaire UNPAID → DECLARED → PAID,
// seul le vendeur (ou l'admin) confirme l'encaissement vérifié (confirmDirect).
//
// Anti-double-traitement : limitation de débit par IP et par commande ;
// re-déclarer une commande déjà declared est un no-op tracé (pas de double
// événement) ; la confirmation d'une commande déjà payée reste refusée.

const MM_METHODS = ["mpesa", "airtel", "orange"]

// Anti-rafale : 10 déclarations / 5 min / IP, et 5 / heure / commande.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ref = String(body.ref || "").trim().toUpperCase()
    const reference = String(body.reference || "").trim().slice(0, 80)
    const note = String(body.note || "").trim().slice(0, 200)

    if (!ref) return NextResponse.json({ error: "Paramètre ref requis." }, { status: 400 })

    // Garde anti-rafale IP (avant tout accès DB)
    if (!rateLimit(`declare:${clientIp(req)}`, 10, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de déclarations. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }
    if (!rateLimit(`declare-order:${ref}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de déclarations pour cette commande. Réessaie plus tard." },
        { status: 429, headers: { "Retry-After": "600" } },
      )
    }

    // Identité : acheteur de la commande (session) ou administrateur.
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized("Connecte-toi pour déclarer ton paiement.")

    const order = await db.order.findUnique({
      where: { ref },
      include: { store: { select: { paymentSettings: true } } },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const isAdmin = user.role === "admin"
    const isBuyer = order.userId !== null && order.userId === user.id
    if (!isBuyer && !isAdmin) {
      // Un tiers (même authentifié) ne peut pas provoquer l'état declared.
      return NextResponse.json({ error: "Seul l'acheteur de cette commande peut déclarer son paiement." }, { status: 403 })
    }

    // Le parcours direct s'applique uniquement aux moyens Mobile Money.
    if (!MM_METHODS.includes(order.paymentMethod)) {
      return NextResponse.json(
        { error: "La déclaration directe s'applique uniquement aux paiements Mobile Money." },
        { status: 400 },
      )
    }

    // Commandes clôturées : aucune déclaration possible.
    if (["cancelled", "returned", "refunded", "disputed"].includes(order.status)) {
      return NextResponse.json(
        { error: "Cette commande est clôturée : déclaration impossible." },
        { status: 400 },
      )
    }

    const actorType = isAdmin ? "admin" : "customer"
    const actorLabel = user.name || user.email

    // Idempotence : déclarer une commande déjà declared est un no-op tracé.
    if (order.paymentStatus === "declared") {
      await logAudit({
        action: "order.payment_declared_noop",
        target: `order:${order.ref}`,
        detail: `Déclaration répétée ignorée (déjà declared)${reference ? ` — réf ${reference}` : ""} (par ${actorLabel})`,
        actorType,
        actorId: user.id,
        entityType: "order",
        entityId: order.id,
      })
      return NextResponse.json({
        duplicate: true,
        order: { ref: order.ref, paymentStatus: order.paymentStatus },
        message: "Paiement déjà déclaré — en attente de confirmation du vendeur.",
      })
    }

    // États admissibles : unpaid (déclaration initiale) ou failed (re-déclaration
    // après expiration P8 ou échec en ligne). Les autres états sont refusés.
    if (!["unpaid", "failed"].includes(order.paymentStatus)) {
      return NextResponse.json(
        { error: `Déclaration impossible : paiement déjà en état « ${order.paymentStatus} ».` },
        { status: 400 },
      )
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "declared",
        declaredAt: new Date(),
        // La référence déclarée devient la preuve préliminaire (P6 : la vraie
        // référence arrivera du webhook en live, ou de la déclaration ici).
        ...(reference ? { paymentRef: reference } : {}),
      },
    })

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "payment_declared",
        actorType,
        actorId: user.id,
        actorLabel,
        oldValue: order.paymentStatus,
        newValue: "declared",
        reason: `Le client déclare avoir effectué le transfert${reference ? ` — référence déclarée : ${reference}` : " — référence non fournie"}${note ? ` — ${note}` : ""}`,
      },
    })

    await logAudit({
      action: "order.payment_declared",
      target: `order:${order.ref}`,
      detail: `Paiement déclaré par ${actorLabel}${reference ? ` — réf ${reference}` : ""}`,
      actorType,
      actorId: user.id,
      entityType: "order",
      entityId: order.id,
    })

    // Le snapshot (s'il existe) est renvoyé à l'acheteur pour confirmation d'écran.
    const instruction = getActiveInstruction(order.store.paymentSettings, order.paymentMethod)

    return NextResponse.json({
      order: { ref: updated.ref, paymentStatus: updated.paymentStatus },
      duplicate: false,
      directPayment: instruction,
      message: "Paiement déclaré — le vendeur va confirmer après vérification dans son compte opérateur.",
    })
  } catch (e) {
    console.error("POST /api/orders/declare-payment", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
