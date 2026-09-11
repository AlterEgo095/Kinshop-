import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  buildOrderMessage,
  buildWhatsAppLink,
  makeOrderRef,
  normalizePhone,
  usdToFC,
  type OrderItem,
  type PaymentMethod,
} from "@/lib/kinshop"

const VALID_PAYMENTS: PaymentMethod[] = ["mpesa", "airtel", "orange", "cash"]

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

    // Valider les articles contre la base (jamais faire confiance au client)
    const requested: { productId: string; qty: number }[] = Array.isArray(body.items) ? body.items : []
    if (requested.length === 0) {
      return NextResponse.json({ error: "Votre panier est vide." }, { status: 400 })
    }

    const dbProducts = await db.product.findMany({ where: { storeId: store.id } })
    const map = new Map(dbProducts.map((p) => [p.id, p]))

    const items: OrderItem[] = []
    let totalUSD = 0
    for (const r of requested) {
      const p = map.get(String(r.productId))
      if (!p) continue
      const qty = Math.max(1, Math.min(99, Number(r.qty) || 1))
      items.push({ productId: p.id, name: p.name, emoji: p.emoji, priceUSD: p.priceUSD, qty })
      totalUSD += p.priceUSD * qty
    }
    if (items.length === 0) {
      return NextResponse.json({ error: "Produits invalides ou introuvables." }, { status: 400 })
    }

    const totalFC = usdToFC(totalUSD, store.rateFC)
    const paymentMethod: PaymentMethod = VALID_PAYMENTS.includes(body.paymentMethod)
      ? body.paymentMethod
      : "mpesa"

    const order = await db.order.create({
      data: {
        ref: makeOrderRef(),
        storeId: store.id,
        customerName: customerName.slice(0, 80),
        customerPhone: normalizePhone(customerPhone),
        zone: String(body.zone || "").slice(0, 80),
        items: JSON.stringify(items),
        totalUSD,
        totalFC,
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
    })

    return NextResponse.json({ order, whatsappUrl: buildWhatsAppLink(store.whatsapp, message) }, { status: 201 })
  } catch (e) {
    console.error("POST /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET /api/orders?slug=xxx — Commandes d'une boutique
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const orders = await db.order.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    })

    return NextResponse.json({ orders })
  } catch (e) {
    console.error("GET /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/orders — Changer le statut d'une commande
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")

    const allowed = ["new", "confirmed", "delivered", "cancelled"]
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: "Statut invalide." }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id } })
    if (!order) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })

    const updated = await db.order.update({ where: { id }, data: { status } })
    return NextResponse.json({ order: updated })
  } catch (e) {
    console.error("PATCH /api/orders", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
