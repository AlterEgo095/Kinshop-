import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"
import { logAudit } from "@/lib/audit"
import { rateLimit, clientIp } from "@/lib/ratelimit"
import { normalizeProofImage, ProofImageError } from "@/lib/payment-proof"

// Phase D — Preuve photographique du paiement direct (justificatif).
//
// POST : l'acheteur authentifié propriétaire de la commande (ou l'admin) joint
//   la capture d'écran de son transfert Mobile Money. La capture est
//   normalisée côté serveur (sharp — même pipeline que les photos produit),
//   stockée en data URL sur OrderPaymentProof (une preuve active par commande,
//   le remplacement est tracé) et historisée par un événement immuable
//   payment_proof. L'événement n'est JAMAIS public (absent de
//   PUBLIC_EVENT_TYPES) : la preuve n'est visible que de l'acheteur, du
//   vendeur propriétaire de la boutique et de l'administration.
//
// GET : lecture de la preuve par l'acheteur, le vendeur propriétaire de la
//   boutique ou l'admin — jamais par un tiers, jamais sans session.
//
// Anti-double-traitement : limitation de débit par IP et par commande ;
// re-uploader remplace la preuve active et laisse un nouvel événement tracé
// (l'historique immuable conserve les deux, une seule image est active).

const MM_METHODS = ["mpesa", "airtel", "orange"]

// États de paiement admissibles pour JOINDRE une preuve : le parcours direct
// avant encaissement (unpaid, declared) et après échec (failed, re-déclaration).
// Après paid, la preuve reste LISIBLE (GET) mais plus MODIFIABLE.
const PROOF_WRITABLE_STATUSES = ["unpaid", "failed", "declared"]

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
    }
    const ref = String((body as Record<string, unknown>).ref || "").trim().toUpperCase()
    const image = String((body as Record<string, unknown>).image || "")
    const note = String((body as Record<string, unknown>).note || "").trim().slice(0, 300)

    if (!ref) return NextResponse.json({ error: "Paramètre ref requis." }, { status: 400 })
    if (!image) return NextResponse.json({ error: "Capture requise — joins l'image du transfert." }, { status: 400 })

    // Garde anti-rafale IP (avant tout accès DB)
    if (!rateLimit(`proof:${clientIp(req)}`, 10, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }
    if (!rateLimit(`proof-order:${ref}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop d'envois pour cette commande. Réessaie plus tard." },
        { status: 429, headers: { "Retry-After": "600" } },
      )
    }

    // Identité : acheteur de la commande (session) ou administrateur.
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized("Connecte-toi pour joindre une preuve de paiement.")

    const order = await db.order.findUnique({ where: { ref } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const isAdmin = user.role === "admin"
    const isBuyer = order.userId !== null && order.userId === user.id
    if (!isBuyer && !isAdmin) {
      // Un tiers (même authentifié) ne peut pas joindre de preuve sur une commande étrangère.
      return NextResponse.json({ error: "Seul l'acheteur de cette commande peut joindre une preuve." }, { status: 403 })
    }

    // Le justificatif photographique concerne le parcours Mobile Money direct.
    if (!MM_METHODS.includes(order.paymentMethod)) {
      return NextResponse.json(
        { error: "La preuve photographique s'applique uniquement aux paiements Mobile Money." },
        { status: 400 },
      )
    }

    // Commandes clôturées : aucune preuve modifiable.
    if (["cancelled", "returned", "refunded", "disputed"].includes(order.status)) {
      return NextResponse.json(
        { error: "Cette commande est clôturée : preuve non modifiable." },
        { status: 400 },
      )
    }

    // États de paiement admissibles (la preuve reste lisible après paid).
    if (!PROOF_WRITABLE_STATUSES.includes(order.paymentStatus)) {
      return NextResponse.json(
        { error: `Preuve non modifiable : paiement en état « ${order.paymentStatus} ».` },
        { status: 400 },
      )
    }

    // Normalisation serveur (peut lever ProofImageError → 400/413, avant toute écriture)
    let normalized: string
    try {
      normalized = await normalizeProofImage(image)
    } catch (e) {
      if (e instanceof ProofImageError) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
      throw e
    }

    const actorType = isAdmin ? "admin" : "customer"
    const actorLabel = user.name || user.email

    // Une seule preuve active par commande — le remplacement est tracé.
    await db.orderPaymentProof.upsert({
      where: { orderId: order.id },
      update: {
        image: normalized,
        note,
        uploadedById: user.id,
        uploadedByLabel: actorLabel,
        createdAt: new Date(),
      },
      create: {
        orderId: order.id,
        image: normalized,
        note,
        uploadedById: user.id,
        uploadedByLabel: actorLabel,
      },
    })

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "payment_proof",
        actorType,
        actorId: user.id,
        actorLabel,
        oldValue: "",
        newValue: "capture jointe",
        reason: `Capture du transfert jointe comme justificatif${note ? ` — ${note}` : ""}`,
      },
    })

    await logAudit({
      action: "order.payment_proof_uploaded",
      target: `order:${order.ref}`,
      detail: `Preuve photographique jointe par ${actorLabel}${note ? ` — ${note}` : ""}`,
      actorType,
      actorId: user.id,
      entityType: "order",
      entityId: order.id,
    })

    return NextResponse.json({
      ok: true,
      proof: { hasProof: true, note, createdAt: new Date().toISOString() },
      message: "Preuve jointe — le vendeur pourra la vérifier avant de confirmer l'encaissement.",
    })
  } catch (e) {
    console.error("POST /api/orders/payment-proof", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const ref = req.nextUrl.searchParams.get("ref")?.trim().toUpperCase() || ""
    if (!ref) return NextResponse.json({ error: "Paramètre ref requis." }, { status: 400 })

    // Hygiène (pattern P7) : lecture authentifiée bornée par IP.
    if (!rateLimit(`proof-get:${clientIp(req)}`, 60, 5 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized("Connecte-toi pour voir la preuve de paiement.")

    const order = await db.order.findUnique({
      where: { ref },
      include: { store: { select: { ownerId: true } } },
    })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const isAdmin = user.role === "admin"
    const isBuyer = order.userId !== null && order.userId === user.id
    const isOwner = order.store.ownerId !== null && order.store.ownerId === user.id
    if (!isBuyer && !isOwner && !isAdmin) {
      return NextResponse.json({ error: "Accès réservé à l'acheteur, au vendeur et à l'administration." }, { status: 403 })
    }

    const proof = await db.orderPaymentProof.findUnique({ where: { orderId: order.id } })
    if (!proof) {
      return NextResponse.json({ hasProof: false })
    }

    return NextResponse.json({
      hasProof: true,
      image: proof.image,
      note: proof.note,
      createdAt: proof.createdAt.toISOString(),
      uploadedByLabel: proof.uploadedByLabel,
    })
  } catch (e) {
    console.error("GET /api/orders/payment-proof", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
