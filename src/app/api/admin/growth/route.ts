import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/growth — Vue globale « Croissance » : codes promo + zones de livraison
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const [coupons, zones] = await Promise.all([
      db.coupon.findMany({
        include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
      db.deliveryZone.findMany({
        include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
        orderBy: [{ storeId: "asc" }, { feeFC: "asc" }],
        take: 400,
      }),
    ])

    return NextResponse.json({
      coupons,
      zones,
      stats: {
        couponsActive: coupons.filter((c) => c.active).length,
        couponsTotal: coupons.length,
        usesTotal: coupons.reduce((s, c) => s + c.uses, 0),
        zonesActive: zones.filter((z) => z.active).length,
        zonesTotal: zones.length,
      },
    })
  } catch (e) {
    console.error("GET /api/admin/growth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/growth — Activer / désactiver un code promo (usage abusif)
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.coupon.findUnique({
      where: { id },
      include: { store: { select: { name: true, slug: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Code promo introuvable." }, { status: 404 })

    const nextActive = typeof body.active === "boolean" ? body.active : !existing.active
    const coupon = await db.coupon.update({ where: { id }, data: { active: nextActive } })

    await logAdminAction(
      nextActive ? "coupon-activate" : "coupon-deactivate",
      `coupon:${existing.code}`,
      `Code « ${existing.code} » ${nextActive ? "réactivé" : "désactivé"} — boutique ${existing.store.name}`,
    )

    return NextResponse.json({ coupon })
  } catch (e) {
    console.error("PATCH /api/admin/growth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/admin/growth?id=xxx — Supprimer un code promo
export async function DELETE(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.coupon.findUnique({
      where: { id },
      include: { store: { select: { name: true, slug: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Code promo introuvable." }, { status: 404 })

    await db.coupon.delete({ where: { id } })

    await logAdminAction(
      "coupon-delete",
      `coupon:${existing.code}`,
      `Code « ${existing.code} » supprimé — boutique ${existing.store.name}`,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/growth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
