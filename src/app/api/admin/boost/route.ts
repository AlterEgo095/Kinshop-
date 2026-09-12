import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/boost — Toutes les campagnes de promotion (Super Admin)
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied
  try {
    const campaigns = await db.boostCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
    })
    return NextResponse.json({ campaigns })
  } catch (e) {
    console.error("GET /api/admin/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/boost — Valider / rejeter / clore une campagne
// Body : { id, action: "activate" | "reject" | "end" }
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const action = String(body.action || "")
    if (!id || !["activate", "reject", "end"].includes(action)) {
      return NextResponse.json({ error: "Paramètres requis : id + action (activate|reject|end)." }, { status: 400 })
    }

    const campaign = await db.boostCampaign.findUnique({ where: { id }, include: { store: true } })
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })

    const now = new Date()
    const data: { status?: string; startAt?: Date; endAt?: Date } = {}
    if (action === "activate") {
      // (Re)lance la campagne maintenant pour 30 j ou la durée restante si déjà datée
      data.status = "active"
      data.startAt = now
      data.endAt = campaign.endAt > now ? campaign.endAt : new Date(now.getTime() + 30 * 86400_000)
    } else if (action === "reject") {
      data.status = "rejected"
    } else if (action === "end") {
      data.status = "ended"
      data.endAt = now // fin immédiate — la disparition de l'accueil est automatique
    }

    const updated = await db.boostCampaign.update({ where: { id }, data })
    await logAdminAction(
      `boost.${action}`,
      `boost:${id}`,
      `Campagne ${campaign.store.name} → ${updated.status} (impressions ${updated.impressions}, clics ${updated.clicks})`,
    )

    return NextResponse.json({ campaign: updated })
  } catch (e) {
    console.error("PATCH /api/admin/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
