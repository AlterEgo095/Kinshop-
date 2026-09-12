import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  PAYMENT_LABELS,
  buildOrderMessage,
  buildWhatsAppLink,
  computeCouponDiscount,
  computeOrderTotals,
  makeOrderRef,
  normalizePhone,
  type CouponType,
  type OrderItem,
  type PaymentMethod,
} from "@/lib/kinshop"
import { notifyNewOrder } from "@/lib/notifier"
import { requireStoreOwner } from "@/lib/auth"
import { getEnabledPayments, getConfigValue } from "@/lib/config-registry"

// POST /api/orders — Créer une commande (calcul côté serveur) + lien WhatsApp
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const customerName = String(body.customerName || "").trim()
    const customerPhone = String(body.customerPhone || "").trim()

    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })
    if (!customerName) return NextResponse.json({ error: "Votre nom est requis." }, { status: 400 })
    if (normalizePhone(customerPhone).length < 9) {
      return NextResponse.json({ error: "Numéro de téléphone invalide." }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })
    // Gouvernance : une boutique suspendue par l'admin ne peut plus recevoir de commandes
    if (store.status !== "active") {
      return NextResponse.json({ error: "Cette boutique est momentanément indisponible." }, { status: 403 })
    }

    // Valider les articles contre la base (jamais faire confiance au client)
    const requested: { productId: string; qty: number }[] = Array.isArray(body.items) ? body.items : []
    if (requested.length === 0) {
      return NextResponse.json({ error: "Votre panier est vide." }, { status: 400 })
    }

    const dbProducts = await db.product.findMany({ where: { storeId: store.id } })
    const map = new Map(dbProducts.map((p) => [p.id, p]))

    // Quantité max par article : règle métier paramétrable côté admin
    const maxQty = await getConfigValue<number>("business.orderMaxQtyPerItem")
    const items: OrderItem[] = []
    let subtotalRaw = 0
    for (const r of requested) {
      const p = map.get(String(r.productId))
      if (!p) continue
      const qty = Math.max(1, Math.min(maxQty, Number(r.qty) || 1))
      items.push({ productId: p.id, name: p.name, emoji: p.emoji, priceUSD: p.priceUSD, qty })
      subtotalRaw += p.priceUSD * qty
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Produits invalides ou introuvables." }, { status: 400 })
    }
    const subtotalUSD = Math.round(subtotalRaw * 100) / 100

    // V6 — Zone de livraison tarifée (si le vendeur en a configuré et qu'une zone est choisie)
    let zoneName = String(body.zone || "").slice(0, 80)
    let deliveryFeeFC = 0
    const zoneId = String(body.zoneId || "")
    if (zoneId) {
      const zone = await db.deliveryZone.findFirst({ where: { id: zoneId, storeId: store.id, active: true } })
      if (zone) {
        zoneName = zone.name
        deliveryFeeFC = zone.feeFC
      }
    }

    // V6 — Code promo : validation serveur (jamais faire confiance au client)
    let discountUSD = 0
    let couponCode = ""
    const requestedCode = String(body.couponCode || "").trim().toUpperCase()
    if (requestedCode) {
      const coupon = await db.coupon.findUnique({
        where: { storeId_code: { storeId: store.id, code: requestedCode } },
      })
      if (!coupon || !coupon.active || (coupon.maxUses > 0 && coupon.uses >= coupon.maxUses)) {
        return NextResponse.json({ error: `Code promo ${requestedCode} invalide ou expiré.` }, { status: 400 })
      }
      const d = computeCouponDiscount(
        { type: coupon.type as CouponType, value: coupon.value, minTotalUSD: coupon.minTotalUSD },
        subtotalUSD,
      )
      if (d <= 0) {
        return NextResponse.json(
          { error: `Ce code demande un panier minimum de $${coupon.minTotalUSD.toFixed(2)}.` },
          { status: 400 },
        )
      }
      discountUSD = d
      couponCode = coupon.code
    }

    // V6 — Totaux calculés côté serveur (FC d'abord, USD dérivé)
    const { totalUSD, totalFC } = computeOrderTotals({
      subtotalUSD,
      discountUSD,
      deliveryFeeFC,
      rate: store.rateFC,
    })

    // Moyens de paiement actifs (paramétrables côté admin — autorité serveur)
    const enabledPayments = await getEnabledPayments()
    if (enabledPayments.length === 0) {
      return NextResponse.json(
        { error: "Aucun moyen de paiement n'est disponible pour le moment." },
        { status: 503 },
      )
    }
    const paymentMethod: PaymentMethod = enabledPayments.includes(body.paymentMethod)
      ? body.paymentMethod
      : enabledPayments[0]

    const order = await db.order.create({
      data: {
        ref: makeOrderRef(),
        storeId: store.id,
        customerName: customerName.slice(0, 80),
        customerPhone: normalizePhone(customerPhone),
        zone: zoneName,
        items: JSON.stringify(items),
        totalUSD,
        totalFC,
        // V6 — récap commerce détaillé
        couponCode,
        discountUSD,
        deliveryZone: zoneName,
        deliveryFeeFC,
        paymentMethod,
        note: String(body.note || "").slice(0, 300),
        status: "new",
      },
    })

    const message = buildOrderMessage({
      storeName: store.name,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      zone: order.zone,
      items,
      totalUSD,
      totalFC,
      paymentMethod,
      note: order.note,
      discountUSD,
      couponCode,
      deliveryFeeFC,
    })

    // V2 — Notification SMS vendeur + client (jamais bloquante, simulée si fournisseur absent)
    await notifyNewOrder({
      storeId: store.id,
      storeName: store.name,
      storeWhatsapp: store.whatsapp,
      orderId: order.id,
      ref: order.ref,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      zone: order.zone,
      items,
      totalFC,
      paymentLabel: PAYMENT_LABELS[paymentMethod],
    })

    // V6 — Incrémenter le compteur d'utilisation du code promo (jamais bloquant)
    if (couponCode) {
      db.coupon
        .update({ where: { storeId_code: { storeId: store.id, code: couponCode } }, data: { uses: { increment: 1 } } })
        .catch((err) => console.error("coupon uses increment", err))
    }

    return NextResponse.json({ order, whatsappUrl: buildWhatsAppLink(store.whatsapp, message) }, { status: 201 })
  } catch (e) {
    console.error("POST /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/orders?slug=xxx — Commandes d'une boutique (V8 : propriétaire uniquement)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const orders = await db.order.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return NextResponse.json({ orders })
  } catch (e) {
    console.error("GET /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/orders — Changer le statut d'une commande (+ paiement espèces reçu)
// V8 : propriétaire uniquement — la boutique est dérivée de la commande (anti-IDOR).
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const paymentStatus = String(body.paymentStatus || "")

    const allowed = ["new", "paid", "confirmed", "delivered", "cancelled"]
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: order.storeId })
    if (!guard.ok) return guard.response

    const data: { status?: string; paymentStatus?: string; paidAt?: Date } = {}
    if (status) {
      if (!allowed.includes(status)) {
        return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
      }
      data.status = status
    }
    // Le vendeur peut enregistrer un paiement reçu (espèces à la livraison uniquement)
    if (paymentStatus === "paid") {
      if (order.paymentMethod === "cash") {
        data.paymentStatus = "paid"
        data.paidAt = new Date()
      } else {
        return NextResponse.json(
          { error: "Ce paiement passe par mobile money — il est confirmé automatiquement." },
          { status: 400 },
        )
      }
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Rien à mettre à jour." }, { status: 400 })
    }

    const updated = await db.order.update({ where: { id }, data })
    return NextResponse.json({ order: updated })
  } catch (e) {
    console.error("PATCH /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
