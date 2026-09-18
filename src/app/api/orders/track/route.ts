import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { OrderItem, TrackOrderData } from "@/lib/kinshop"
import { PUBLIC_EVENT_TYPES } from "@/lib/order-workflow"
import { rateLimit, clientIp } from "@/lib/ratelimit"

// P7 — anti-énumération : la référence est séquentielle, donc l'espace est
// énumérable par un robot. Limite par IP : 30 requêtes / 5 minutes (l'usage
// normal d'un acheteur rafraîchissant son suivi est très en dessous).
const TRACK_RATE_MAX = 30
const TRACK_RATE_WINDOW_MS = 5 * 60 * 1000

// GET /api/orders/track?ref=CMD-2026-000001 — Suivi public d'une commande par sa référence
// Renvoie uniquement les données nécessaires au client (jamais le numéro du client)
// + la frise publique d'événements (types sûrs uniquement — pas de détails internes).
export async function GET(req: NextRequest) {
  try {
    // P7 — garde anti-énumération (avant tout accès DB)
    if (!rateLimit(`track:${clientIp(req)}`, TRACK_RATE_MAX, TRACK_RATE_WINDOW_MS)) {
      return NextResponse.json(
        { error: "Trop de requêtes. Réessaie dans quelques minutes." },
        { status: 429, headers: { "Retry-After": "300" } },
      )
    }

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

    // V10 — Frise publique : uniquement les événements sûrs pour le client
    const allEvents = await db.orderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    })
    const events = allEvents
      .filter((ev) => PUBLIC_EVENT_TYPES.includes(ev.type as never))
      .map((ev) => ({
        type: ev.type,
        newValue: ev.newValue || undefined,
        oldValue: ev.oldValue || undefined,
        reason: ev.reason || undefined,
        at: ev.createdAt.toISOString(),
      }))

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

    return NextResponse.json({ order: data, events, deliveryStatus: order.deliveryStatus })
  } catch (e) {
    console.error("GET /api/orders/track", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
