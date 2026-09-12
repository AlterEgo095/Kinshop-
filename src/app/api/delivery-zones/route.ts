import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { forbidden, requireStoreOwner, quotaExceeded } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas, isFeatureOn } from "@/lib/config-registry"

// GET /api/delivery-zones?slug=xxx — Zones de livraison (public : la vitrine affiche les frais)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const zones = await db.deliveryZone.findMany({
      where: { storeId: store.id },
      orderBy: [{ active: "desc" }, { feeFC: "asc" }, { createdAt: "asc" }],
    })
    return NextResponse.json({ zones })
  } catch (e) {
    console.error("GET /api/delivery-zones", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// POST /api/delivery-zones — Ajouter une zone tarifée (V8 : propriétaire + quota du plan)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const name = String(body.name || "").trim()
    const feeFC = Math.max(0, Math.round(Number(body.feeFC) || 0))

    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: "Nom de zone invalide (2 à 60 caractères)." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const plan = planOf(guard.store)

    // ── Feature flag + quota zones de livraison (serveur, paramétrables admin) ──
    if (!(await isFeatureOn("deliveryZones"))) {
      return forbidden("Les zones de livraison sont momentanément désactivées sur la plateforme.")
    }
    const quotas = await getPlanQuotas(plan.id)
    const count = await db.deliveryZone.count({ where: { storeId: guard.store.id } })
    if (count >= quotas.maxDeliveryZones) {
      return quotaExceeded(
        plan.id === "free"
          ? `Limite du plan Free atteinte (${quotas.maxDeliveryZones} zones). Passe Premium pour desservir davantage de quartiers.`
          : `Limite de ${quotas.maxDeliveryZones} zones atteinte.`,
      )
    }

    try {
      const zone = await db.deliveryZone.create({
        data: { storeId: guard.store.id, name, feeFC, active: true },
      })
      return NextResponse.json({ zone }, { status: 201 })
    } catch {
      // viol de l'unicité @@unique([storeId, name])
      return NextResponse.json({ error: `La zone « ${name} » existe déjà.` }, { status: 409 })
    }
  } catch (e) {
    console.error("POST /api/delivery-zones", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/delivery-zones — Modifier une zone (V8 : propriétaire uniquement)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.deliveryZone.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Zone introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: existing.storeId })
    if (!guard.ok) return guard.response

    const data: { name?: string; feeFC?: number; active?: boolean } = {}
    if (typeof body.name === "string" && body.name.trim().length >= 2) {
      data.name = body.name.trim().slice(0, 60)
    }
    if (body.feeFC !== undefined) {
      data.feeFC = Math.max(0, Math.round(Number(body.feeFC) || 0))
    }
    if (typeof body.active === "boolean") data.active = body.active

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    try {
      const zone = await db.deliveryZone.update({ where: { id }, data })
      return NextResponse.json({ zone })
    } catch {
      return NextResponse.json({ error: `La zone « ${data.name} » existe déjà.` }, { status: 409 })
    }
  } catch (e) {
    console.error("PATCH /api/delivery-zones", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/delivery-zones?id=xxx — Supprimer une zone (V8 : propriétaire uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.deliveryZone.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Zone introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: existing.storeId })
    if (!guard.ok) return guard.response

    await db.deliveryZone.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/delivery-zones", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
