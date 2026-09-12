import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas } from "@/lib/config-registry"
import type {
  DailyPoint,
  OrderItem,
  OrderStatus,
  PaymentMethod,
  TopProductStat,
  VendorStats,
} from "@/lib/kinshop"

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fillSeries(rows: { day: Date; count: number }[], days: string[]): DailyPoint[] {
  const map = new Map(rows.map((r) => [dayKey(r.day), r.count]))
  return days.map((day) => ({ day, count: map.get(day) ?? 0 }))
}

// GET /api/stats?slug=xxx&days=N — Statistiques vendeur (V8 : propriétaire uniquement,
// historique plafonné selon le plan : Free 7 jours, Premium 60 jours)
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const slug = sp.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const plan = planOf(guard.store)

    // Historique dynamique (plan configurable dans la console admin)
    const quotas = await getPlanQuotas(plan.id)
    const requestedDays = Math.min(730, Math.max(7, Number(sp.get("days")) || 14))
    const days = Math.min(requestedDays, quotas.statsDays)

    // Série des N derniers jours (aujourd'hui inclus)
    const dayLabels: string[] = []
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    since.setUTCDate(since.getUTCDate() - (days - 1))
    for (let i = 0; i < days; i++) {
      const d = new Date(since)
      d.setUTCDate(d.getUTCDate() + i)
      dayLabels.push(dayKey(d))
    }

    const [visitRows, orderRows, viewsAgg, allOrders] = await Promise.all([
      db.storeVisit.findMany({
        where: { storeId: guard.store.id, day: { gte: since } },
        orderBy: { day: "asc" },
      }),
      db.order.findMany({
        where: {
          storeId: guard.store.id,
          createdAt: { gte: since, lt: new Date(since.getTime() + (days + 1) * 86400000) },
        },
        select: {
          items: true,
          totalUSD: true,
          status: true,
          paymentMethod: true,
          customerPhone: true,
          createdAt: true,
        },
      }),
      db.storeVisit.aggregate({ where: { storeId: guard.store.id }, _sum: { count: true } }),
      db.order.findMany({ where: { storeId: guard.store.id }, select: { customerPhone: true, status: true } }),
    ])

    const viewsSeries = fillSeries(visitRows, dayLabels)
    const ordersSeries: DailyPoint[] = dayLabels.map((day) => ({ day, count: 0 }))
    for (const o of orderRows) {
      const k = dayKey(o.createdAt)
      const pt = ordersSeries.find((p) => p.day === k)
      if (pt) pt.count += 1
    }

    const viewsPeriod = viewsSeries.reduce((s, p) => s + p.count, 0)
    const ordersPeriod = orderRows.length

    // Tendance : 7 derniers jours vs 7 précédents (vues)
    const last7 = viewsSeries.slice(-7).reduce((s, p) => s + p.count, 0)
    const prev7 = viewsSeries.slice(-14, -7).reduce((s, p) => s + p.count, 0)
    const trendPct = prev7 > 0 ? Math.round(((last7 - prev7) / prev7) * 100) : last7 > 0 ? 100 : 0

    // Conversion (commandes non annulées / vues sur la période) — plafonnée à 100 %
    const validOrders = orderRows.filter((o) => o.status !== "cancelled")
    const conversionPct =
      viewsPeriod > 0 ? Math.min(100, Math.round((validOrders.length / viewsPeriod) * 1000) / 10) : 0

    // Panier moyen
    const avgBasketUSD =
      validOrders.length > 0
        ? Math.round((validOrders.reduce((s, o) => s + o.totalUSD, 0) / validOrders.length) * 100) / 100
        : 0

    // Produits stars — agrégation depuis les items JSON des commandes valides
    const productMap = new Map<string, TopProductStat>()
    for (const o of validOrders) {
      let items: OrderItem[] = []
      try {
        items = JSON.parse(o.items)
      } catch {
        continue
      }
      for (const it of items) {
        const key = it.productId || it.name
        const cur = productMap.get(key) ?? {
          productId: it.productId,
          name: it.name,
          emoji: it.emoji || "📦",
          qty: 0,
          revenueUSD: 0,
          orders: 0,
        }
        cur.qty += it.qty
        cur.revenueUSD = Math.round((cur.revenueUSD + it.priceUSD * it.qty) * 100) / 100
        cur.orders += 1
        productMap.set(key, cur)
      }
    }
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.qty - a.qty || b.revenueUSD - a.revenueUSD)
      .slice(0, 5)

    // Entonnoir statuts + paiements (période)
    const statusFunnel: Record<OrderStatus, number> = { new: 0, paid: 0, confirmed: 0, delivered: 0, cancelled: 0 }
    const payments: Record<PaymentMethod, number> = { mpesa: 0, airtel: 0, orange: 0, cash: 0 }
    for (const o of orderRows) {
      if (o.status in statusFunnel) statusFunnel[o.status as OrderStatus] += 1
      if (o.paymentMethod in payments) payments[o.paymentMethod as PaymentMethod] += 1
    }

    // Clients fidèles (≥ 2 commandes, toutes périodes)
    const phoneCounts = new Map<string, number>()
    for (const o of allOrders) {
      phoneCounts.set(o.customerPhone, (phoneCounts.get(o.customerPhone) ?? 0) + 1)
    }
    let repeatCustomers = 0
    for (const c of phoneCounts.values()) if (c >= 2) repeatCustomers += 1

    const stats: VendorStats = {
      views: {
        total: viewsAgg._sum.count ?? 0,
        period: viewsPeriod,
        series: viewsSeries,
      },
      orders: { total: allOrders.length, period: ordersPeriod, series: ordersSeries },
      conversionPct,
      avgBasketUSD,
      repeatCustomers,
      topProducts,
      statusFunnel,
      payments,
      trendPct,
    }

    return NextResponse.json({ stats, plan: { id: plan.id, statsDays: plan.statsDays } })
  } catch (e) {
    console.error("GET /api/stats", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
