import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/home — Données de la page d'accueil MARKETPLACE (V10, public)
//
// HONNÊTETÉ DE L'AFFICHAGE :
// - sponsorisé   = campagnes Boost PAYÉES et actives uniquement — clairement étiquetées ;
// - populaire    = classement RÉEL (visites cumulées 30 j) — jamais fabriqué ;
// - nouveautés   = boutiques les plus récentes.
export async function GET(_req: NextRequest) {
  try {
    const now = new Date()

    // 1) Boutiques sponsorisées (campagnes actives payées)
    const activeBoosts = await db.boostCampaign.findMany({
      where: { status: "active", startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { store: { select: { id: true, slug: true, name: true, logoEmoji: true, city: true, description: true, status: true, isPremium: true, premiumUntil: true } } },
    })
    const sponsored = activeBoosts
      .map((b) => ({ campaignId: b.id, store: b.store }))
      .filter((x) => x.store.status === "active")

    // 2) Boutiques populaires : visites cumulées sur 30 jours (données réelles)
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const visits = await db.storeVisit.groupBy({
      by: ["storeId"],
      where: { day: { gte: since } },
      _sum: { count: true },
    })
    const visitMap = new Map(visits.map((v) => [v.storeId, v._sum.count ?? 0]))
    const stores = await db.store.findMany({
      where: { status: "active" },
      select: { id: true, slug: true, name: true, logoEmoji: true, city: true, description: true, isPremium: true, premiumUntil: true, createdAt: true },
    })
    const popular = stores
      .map((s) => ({ ...s, visits30d: visitMap.get(s.id) ?? 0 }))
      .sort((a, b) => b.visits30d - a.visits30d)
      .filter((s) => s.visits30d > 0)
      .slice(0, 8)

    // 3) Nouveautés : dernières boutiques actives
    const newest = [...stores]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)

    // 4) Produits récents (nouveautés catalogue) — prix réels, pas de classement inventé
    const latestProducts = await db.product.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { store: { select: { name: true, slug: true, status: true } } },
    })
    const products = latestProducts
      .filter((p) => p.store.status === "active")
      .map((p) => ({
        id: p.id,
        name: p.name,
        emoji: p.emoji,
        imageUrl: p.imageUrl,
        priceUSD: p.priceUSD,
        category: p.category,
        store: { name: p.store.name, slug: p.store.slug },
      }))

    // Incrément d'impressions des campagnes affichées (mesure honnête, non bloquante)
    if (sponsored.length > 0) {
      db.boostCampaign
        .updateMany({ where: { id: { in: sponsored.map((s) => s.campaignId) } }, data: { impressions: { increment: 1 } } })
        .catch(() => {})
    }

    return NextResponse.json(
      {
        sponsored: sponsored.map((s) => ({
          campaignId: s.campaignId,
          slug: s.store.slug,
          name: s.store.name,
          logoEmoji: s.store.logoEmoji,
          city: s.store.city,
          description: s.store.description,
          isPremium: s.store.isPremium,
        })),
        popular: popular.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoEmoji: s.logoEmoji,
          city: s.city,
          description: s.description,
          visits30d: s.visits30d,
          isPremium: s.isPremium,
        })),
        newest: newest.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoEmoji: s.logoEmoji,
          city: s.city,
          description: s.description,
          isPremium: s.isPremium,
        })),
        products,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/home", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
