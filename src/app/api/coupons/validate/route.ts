import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { computeCouponDiscount, couponCondition, type CouponType } from "@/lib/kinshop"

// POST /api/coupons/validate — Validation publique d'un code promo au checkout
// Le serveur fait toujours foi : le total final est recalculé dans POST /api/orders.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const code = String(body.code || "").trim().toUpperCase()
    const subtotalUSD = Number(body.subtotalUSD) || 0

    if (!slug || !code) {
      return NextResponse.json({ ok: false, error: "Boutique et code requis." }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ ok: false, error: "Boutique introuvable." }, { status: 404 })

    const coupon = await db.coupon.findUnique({
      where: { storeId_code: { storeId: store.id, code } },
    })
    if (!coupon) {
      return NextResponse.json({ ok: false, error: `Le code ${code} n'existe pas.` }, { status: 404 })
    }
    if (!coupon.active) {
      return NextResponse.json({ ok: false, error: `Le code ${code} n'est plus actif.` }, { status: 400 })
    }
    if (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) {
      return NextResponse.json({ ok: false, error: `Le code ${code} a atteint sa limite d'utilisation.` }, { status: 400 })
    }
    if (subtotalUSD < coupon.minTotalUSD) {
      return NextResponse.json(
        { ok: false, error: `Ce code demande un panier minimum de $${coupon.minTotalUSD.toFixed(2)}.` },
        { status: 400 },
      )
    }

    const discountUSD = computeCouponDiscount(
      { type: coupon.type as CouponType, value: coupon.value, minTotalUSD: coupon.minTotalUSD },
      subtotalUSD,
    )
    if (discountUSD <= 0) {
      return NextResponse.json({ ok: false, error: "Ce code n'apporte aucune remise sur ce panier." }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      coupon: {
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discountUSD,
        label: couponCondition(coupon.type as CouponType, coupon.value, coupon.minTotalUSD),
      },
    })
  } catch (e) {
    console.error("POST /api/coupons/validate", e)
    return NextResponse.json({ ok: false, error: "Erreur serveur." }, { status: 500 })
  }
}
