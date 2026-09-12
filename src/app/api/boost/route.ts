import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner, quotaExceeded } from "@/lib/auth"
import { isFeatureOn, getConfigValue } from "@/lib/config-registry"
import { logAudit } from "@/lib/audit"

// Boost V10 — PROMOTION PAYANTE, indépendante de l'abonnement Premium :
// Premium = fonctionnalités ; Boost = visibilité (accueil « Sponsorisé »).
//
// POST /api/boost { slug, days: 7|30 }       → campagne en attente de paiement
// PATCH /api/boost { id, confirm: true }     → paiement confirmé → campagne active
// GET  /api/boost?slug=                      → campagnes de la boutique
export async function POST(req: NextRequest) {
  try {
    if (!(await isFeatureOn("boost"))) {
      return NextResponse.json({ error: "La promotion payante est désactivée pour le moment." }, { status: 403 })
    }

    const body = await req.json()
    const slug = String(body.slug || "")
    const days = Number(body.days)

    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })
    if (![7, 30].includes(days)) {
      return NextResponse.json({ error: "Durée invalide (7 ou 30 jours)." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const { store, user } = guard

    // Prix : DÉCIDÉ PAR LE SERVEUR (config admin) — jamais par le frontend
    const costUSD = await getConfigValue<number>(days === 7 ? "boost.price7USD" : "boost.price30USD")

    // Max de campagnes actives simultanées (anti-saturation de l'accueil)
    const maxActive = await getConfigValue<number>("boost.maxActivePerStore")
    const activeCount = await db.boostCampaign.count({
      where: { storeId: store.id, status: { in: ["pending_payment", "active"] } },
    })
    if (activeCount >= maxActive) {
      return quotaExceeded(
        `Tu as déjà ${activeCount} campagne(s) en cours (max ${maxActive}). Attends la fin de la campagne en cours.`,
      )
    }

    const startAt = new Date()
    const endAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

    const campaign = await db.boostCampaign.create({
      data: { storeId: store.id, placement: "home_featured", startAt, endAt, costUSD, status: "pending_payment" },
    })

    await logAudit({
      action: "boost.created",
      target: `boost:${campaign.id}`,
      detail: `${store.name} — ${days} j — $${costUSD.toFixed(2)} (paiement en attente)`,
      actorType: "owner",
      actorId: user.id,
      entityType: "boost",
      entityId: campaign.id,
    })

    return NextResponse.json({ campaign }, { status: 201 })
  } catch (e) {
    console.error("POST /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH : confirmation de paiement (simulateur agrégateur ; le vrai webhook Chariow
// se branchera ici sans changer le contrat).
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

    const campaign = await db.boostCampaign.findUnique({ where: { id }, include: { store: true } })
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: campaign.storeId })
    if (!guard.ok) return guard.response

    if (campaign.status !== "pending_payment") {
      return NextResponse.json({ error: "Cette campagne n'est plus en attente de paiement." }, { status: 400 })
    }

    const paymentRef = `BOOST-${Date.now().toString(36).toUpperCase()}`
    const updated = await db.boostCampaign.update({
      where: { id },
      data: { status: "active", paymentRef },
    })

    await logAudit({
      action: "boost.paid",
      target: `boost:${id}`,
      detail: `${campaign.store.name} — campagne ACTIVE jusqu'au ${updated.endAt.toISOString().slice(0, 10)} — réf ${paymentRef}`,
      actorType: "owner",
      actorId: guard.user.id,
      entityType: "boost",
      entityId: id,
    })

    return NextResponse.json({ campaign: updated })
  } catch (e) {
    console.error("PATCH /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET : campagnes de la boutique
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const campaigns = await db.boostCampaign.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return NextResponse.json({ campaigns })
  } catch (e) {
    console.error("GET /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
