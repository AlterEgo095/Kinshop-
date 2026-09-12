import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { CouponType } from "@/lib/kinshop"
import { requireStoreOwner, forbidden, quotaExceeded } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas, isFeatureOn } from "@/lib/config-registry"

const CODE_RE = /^[A-Z0-9]{3,16}$/

// GET /api/coupons?slug=xxx — Codes promo d'une boutique (V8 : propriétaire uniquement)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const coupons = await db.coupon.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ coupons })
  } catch (e) {
    console.error("GET /api/coupons", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// POST /api/coupons — Créer un code promo (V8 : propriétaire + quota du plan)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const code = String(body.code || "").trim().toUpperCase()
    const type = String(body.type || "percent") as CouponType

    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })
    if (!CODE_RE.test(code)) {
      return NextResponse.json(
        { error: "Code invalide : 3 à 16 caractères, lettres majuscules et chiffres uniquement." },
        { status: 400 },
      )
    }
    if (type !== "percent" && type !== "fixed") {
      return NextResponse.json({ error: "Type de remise invalide." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const plan = planOf(guard.store)

    // ── Feature flag + quota codes promo (serveur, paramétrables admin) ──
    if (!(await isFeatureOn("coupons"))) {
      return forbidden("Les codes promo sont momentanément désactivés sur la plateforme.")
    }
    const quotas = await getPlanQuotas(plan.id)
    const existingCount = await db.coupon.count({ where: { storeId: guard.store.id } })
    if (existingCount >= quotas.maxCoupons) {
      return quotaExceeded(
        plan.id === "free"
          ? `Limite du plan Free atteinte (${quotas.maxCoupons} codes promo). Passe Premium pour en créer davantage.`
          : `Limite de ${quotas.maxCoupons} codes promo atteinte.`,
      )
    }

    const value = Number(body.value)
    if (type === "percent" && (!Number.isFinite(value) || value < 1 || value > 90)) {
      return NextResponse.json({ error: "Pourcentage invalide (1 à 90 %)." }, { status: 400 })
    }
    if (type === "fixed" && (!Number.isFinite(value) || value < 0.1 || value > 1000)) {
      return NextResponse.json({ error: "Montant fixe invalide ($0.10 à $1000)." }, { status: 400 })
    }

    const minTotalUSD = Math.max(0, Number(body.minTotalUSD) || 0)
    const maxUses = Math.max(0, Math.floor(Number(body.maxUses) || 0))

    try {
      const coupon = await db.coupon.create({
        data: { storeId: guard.store.id, code, type, value, minTotalUSD, maxUses, active: true },
      })
      return NextResponse.json({ coupon }, { status: 201 })
    } catch {
      // viol de l'unicité @@unique([storeId, code])
      return NextResponse.json({ error: `Le code ${code} existe déjà pour cette boutique.` }, { status: 409 })
    }
  } catch (e) {
    console.error("POST /api/coupons", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/coupons — Activer / désactiver un code promo (V8 : propriétaire uniquement)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.coupon.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Code promo introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: existing.storeId })
    if (!guard.ok) return guard.response

    const coupon = await db.coupon.update({
      where: { id },
      data: { active: typeof body.active === "boolean" ? body.active : !existing.active },
    })
    return NextResponse.json({ coupon })
  } catch (e) {
    console.error("PATCH /api/coupons", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/coupons?id=xxx — Supprimer un code promo (V8 : propriétaire uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.coupon.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Code promo introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: existing.storeId })
    if (!guard.ok) return guard.response

    await db.coupon.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/coupons", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
