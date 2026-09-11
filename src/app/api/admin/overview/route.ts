import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin } from "@/lib/admin"

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// GET /api/admin/overview — KPIs globaux de la plateforme
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const [stores, productsCount, orders, pulseCount] = await Promise.all([
      db.store.findMany({
        select: {
          id: true, slug: true, name: true, logoEmoji: true, ownerName: true,
          isPremium: true, premiumUntil: true, status: true, createdAt: true,
        },
      }),
      db.product.count(),
      db.order.findMany({
        select: {
          totalUSD: true, totalFC: true, status: true, paymentMethod: true,
          createdAt: true, storeId: true, ref: true, customerName: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      db.pulseDelivery.count(),
    ])

    const now = Date.now()
    const day7 = now - 7 * 86400_000

    const activeOrders = orders.filter((o) => o.status !== "cancelled")

    // Commandes des 14 derniers jours (série pour le graphique)
    const seriesMap = new Map<string, { count: number; totalUSD: number }>()
    for (const o of activeOrders) {
      const k = dayKey(new Date(o.createdAt))
      const cur = seriesMap.get(k) ?? { count: 0, totalUSD: 0 }
      cur.count += 1
      cur.totalUSD += o.totalUSD
      seriesMap.set(k, cur)
    }
    const series: { date: string; label: string; count: number; totalUSD: number }[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400_000)
      const k = dayKey(d)
      const v = seriesMap.get(k) ?? { count: 0, totalUSD: 0 }
      series.push({
        date: k,
        label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
        count: v.count,
        totalUSD: v.totalUSD,
      })
    }

    // Répartition par statut & moyen de paiement
    const ordersByStatus: Record<string, number> = {}
    const byPayment: Record<string, number> = {}
    for (const o of orders) {
      ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1
      byPayment[o.paymentMethod] = (byPayment[o.paymentMethod] || 0) + 1
    }

    // Chiffre d'affaires par boutique (commandes non annulées)
    const revenueByStore = new Map<string, { totalUSD: number; count: number }>()
    for (const o of activeOrders) {
      const cur = revenueByStore.get(o.storeId) ?? { totalUSD: 0, count: 0 }
      cur.totalUSD += o.totalUSD
      cur.count += 1
      revenueByStore.set(o.storeId, cur)
    }

    const topStores = [...revenueByStore.entries()]
      .sort((a, b) => b[1].totalUSD - a[1].totalUSD)
      .slice(0, 5)
      .map(([storeId, v]) => {
        const s = stores.find((x) => x.id === storeId)
        return {
          slug: s?.slug ?? "?",
          name: s?.name ?? "Boutique supprimée",
          emoji: s?.logoEmoji ?? "🏪",
          totalUSD: Math.round(v.totalUSD * 100) / 100,
          orders: v.count,
        }
      })

    const premiumActive = stores.filter(
      (s) => s.isPremium && s.premiumUntil && new Date(s.premiumUntil).getTime() > now,
    ).length

    // Premium expirant sous 7 jours
    const expiringSoon = stores
      .filter(
        (s) =>
          s.isPremium &&
          s.premiumUntil &&
          new Date(s.premiumUntil).getTime() > now &&
          new Date(s.premiumUntil).getTime() < now + 7 * 86400_000,
      )
      .map((s) => ({ slug: s.slug, name: s.name, emoji: s.logoEmoji, premiumUntil: s.premiumUntil }))

    const recentOrders = orders.slice(0, 8).map((o) => {
      const s = stores.find((x) => x.id === o.storeId)
      return {
        ref: o.ref,
        customerName: o.customerName,
        storeName: s?.name ?? "?",
        storeSlug: s?.slug ?? "",
        totalUSD: o.totalUSD,
        status: o.status,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      }
    })

    const recentStores = [...stores]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        emoji: s.logoEmoji,
        ownerName: s.ownerName,
        isPremium: s.isPremium,
        status: s.status,
        createdAt: s.createdAt,
      }))

    const gmvUSD = activeOrders.reduce((acc, o) => acc + o.totalUSD, 0)

    return NextResponse.json({
      storesTotal: stores.length,
      storesActive: stores.filter((s) => s.status === "active").length,
      storesSuspended: stores.filter((s) => s.status === "suspended").length,
      premiumActive,
      premiumRevenueUSD: premiumActive * 3,
      productsTotal: productsCount,
      ordersTotal: orders.length,
      ordersLast7d: orders.filter((o) => new Date(o.createdAt).getTime() > day7).length,
      newStoresLast7d: stores.filter((s) => new Date(s.createdAt).getTime() > day7).length,
      gmvUSD: Math.round(gmvUSD * 100) / 100,
      ordersByStatus,
      byPayment,
      topStores,
      recentOrders,
      recentStores,
      expiringPremium: expiringSoon,
      series,
      webhookDeliveries: pulseCount,
    })
  } catch (e) {
    console.error("GET /api/admin/overview", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
