import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { OrderItem, TrackOrderData } from "@/lib/kinshop"

// GET /api/orders/track?ref=KIN-XXXX — Suivi public d'une commande par sa référence
// Renvoie uniquement les données nécessaires au client (jamais le numéro du client).
export async function GET(req: NextRequest) {
  try {
    const ref = (req.nextUrl.searchParams.get("ref") || "").trim().toUpperCase()
    if (!ref) return NextResponse.json({ error: "Paramètre ref requis." }, { status: 400 })

    const order = await db.order.findUnique({
      where: { ref },
      include: {
        store: { select: { name: true, logoEmoji: true, slug: true, whatsapp: true, status: true } },
      },
    })
    if (!order || order.store.status === "suspended") {
      return NextResponse.json({ error: "Commande introuvable. Vérifie ta référence (ex : KIN-XXXX)." }, { status: 404 })
    }

    let items: OrderItem[] = []
    try {
      const parsed = JSON.parse(order.items)
      if (Array.isArray(parsed)) items = parsed
    } catch {
      // items invalide : liste vide
    }

    const subtotalUSD = Math.round(items.reduce((s, it) => s + it.priceUSD * it.qty, 0) * 100) / 100

    const data: TrackOrderData = {
      ref: order.ref,
      status: order.status as TrackOrderData["status"],
      paymentMethod: order.paymentMethod as TrackOrderData["paymentMethod"],
      paymentStatus: order.paymentStatus as TrackOrderData["paymentStatus"],
      customerName: order.customerName,
      zone: order.zone,
      items,
      subtotalUSD,
      discountUSD: order.discountUSD,
      couponCode: order.couponCode,
      deliveryZone: order.deliveryZone,
      deliveryFeeFC: order.deliveryFeeFC,
      totalUSD: order.totalUSD,
      totalFC: order.totalFC,
      createdAt: order.createdAt.toISOString(),
      store: {
        name: order.store.name,
        logoEmoji: order.store.logoEmoji,
        slug: order.store.slug,
        whatsapp: order.store.whatsapp,
      },
    }

    return NextResponse.json({ order: data })
  } catch (e) {
    console.error("GET /api/orders/track", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
