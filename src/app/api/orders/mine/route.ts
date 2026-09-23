import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"
import type { OrderItem } from "@/lib/kinshop"
import { expireOverdueDeclarations } from "@/lib/direct-payments"

// GET /api/orders/mine — Historique des commandes du COMPTE CLIENT connecté (V10)
// Seules SES commandes (userId dérivé du serveur, jamais d'un paramètre client).
export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()

    const orders = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        store: { select: { name: true, logoEmoji: true, slug: true } },
        refunds: { select: { id: true, status: true, amountUSD: true } },
        invoices: { select: { number: true, status: true, totalFC: true } },
      },
    })

    // P8 (Phase C) — expiration paresseuse des déclarations dépassées
    // (l'acheteur peut re-déclarer une commande repassée en failed).
    await expireOverdueDeclarations(orders)

    // Aplatissement sûr des items JSON pour l'affichage client
    const data = orders.map((o) => {
      let items: OrderItem[] = []
      try {
        const parsed = JSON.parse(o.items)
        if (Array.isArray(parsed)) items = parsed
      } catch {
        // items invalide : liste vide
      }
      return {
        id: o.id,
        ref: o.ref,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        deliveryStatus: o.deliveryStatus,
        // LOT 2 — le client sait qu'une commande est un retrait en boutique
        fulfillment: o.fulfillment,
        totalUSD: o.totalUSD,
        totalFC: o.totalFC,
        createdAt: o.createdAt.toISOString(),
        itemsCount: items.reduce((s, it) => s + it.qty, 0),
        itemsPreview: items.slice(0, 3).map((it) => `${it.qty}× ${it.name}`),
        store: o.store,
        refunds: o.refunds,
        invoices: o.invoices,
      }
    })

    return NextResponse.json({ orders: data })
  } catch (e) {
    console.error("GET /api/orders/mine", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
