import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/home — Données de la page d'accueil MARKETPLACE (V10, public)
//
// HONNÊTETÉ DE L'AFFICHAGE :
// - sponsorisé   = campagnes Boost PAYÉES et actives uniquement — clairement étiquetées ;
// - populaire    = classement RÉEL (visites cumulées 30 j) — jamais fabriqué ;
// - nouveautés   = boutiques les plus récentes.
//
// P2 — NAVIGATION PAR CATÉGORIES GLOBALES :
// ?cat=<slug d'une GlobalCategory> filtre TOUTES les sections (sponsorisés,
// populaires, nouveautés, produits) sur les boutiques/produits rattachés à
// cette catégorie via StoreCategory.globalCategoryId. Sans ?cat, comportement
// historique (toutes catégories). La liste des catégories actives est renvoyée
// systématiquement pour construire la barre de navigation.
export async function GET(req: NextRequest) {
  try {
    const now = new Date()

    // ── P2 — résolution du filtre catégorie (optionnel) ──
    const catSlug = req.nextUrl.searchParams.get("cat")
    let selectedCategory: { id: string; name: string; slug: string; icon: string } | null = null
    let catStoreCategoryIds: string[] = []
    let catStoreIds: string[] = []
    if (catSlug) {
      const gc = await db.globalCategory.findUnique({ where: { slug: catSlug } })
      if (!gc || !gc.active) {
        return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 })
      }
      selectedCategory = { id: gc.id, name: gc.name, slug: gc.slug, icon: gc.icon }
      // Rayons de boutiques rattachés à cette catégorie globale
      const linkedCats = await db.storeCategory.findMany({
        where: { active: true, globalCategoryId: gc.id },
        select: { id: true, storeId: true },
      })
      catStoreCategoryIds = linkedCats.map((c) => c.id)
      // Seules les boutiques ayant AU MOINS UN produit dans la catégorie ressortent
      const withProducts = await db.storeCategory.findMany({
        where: { id: { in: catStoreCategoryIds }, products: { some: {} } },
        select: { storeId: true },
      })
      catStoreIds = Array.from(new Set(withProducts.map((c) => c.storeId)))
    }

    const categories = await db.globalCategory.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, icon: true },
    })

    // 1) Boutiques sponsorisées (campagnes actives payées)
    const activeBoosts = await db.boostCampaign.findMany({
      where: { status: "active", startAt: { lte: now }, endAt: { gte: now } },
      orderBy: { startAt: "asc" },
      take: 6,
      include: { store: { select: { id: true, slug: true, name: true, logoEmoji: true, city: true, description: true, status: true, isPremium: true, premiumUntil: true, verificationStatus: true } } },
    })
    const sponsored = activeBoosts
      .map((b) => ({ campaignId: b.id, store: b.store }))
      .filter((x) => x.store.status === "active")
      .filter((x) => !selectedCategory || catStoreIds.includes(x.store.id))

    // 2) Boutiques populaires : visites cumulées sur 30 jours (données réelles)
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const visits = await db.storeVisit.groupBy({
      by: ["storeId"],
      where: { day: { gte: since } },
      _sum: { count: true },
    })
    const visitMap = new Map(visits.map((v) => [v.storeId, v._sum.count ?? 0]))
    const stores = await db.store.findMany({
      where: {
        status: "active",
        // P2 — sous filtre catégorie : la boutique doit exposer la catégorie
        ...(selectedCategory ? { id: { in: catStoreIds } } : {}),
      },
      select: { id: true, slug: true, name: true, logoEmoji: true, city: true, description: true, isPremium: true, premiumUntil: true, verificationStatus: true, createdAt: true },
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
      // P2 — sous filtre catégorie : produits rattachés à un rayon de la catégorie
      ...(selectedCategory ? { where: { storeCategoryId: { in: catStoreCategoryIds } } } : {}),
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
          // P5 (F5-1) — badge « Vérifiée » exposé honnêtement (statut réel)
          verified: s.store.verificationStatus === "verified",
        })),
        popular: popular.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoEmoji: s.logoEmoji,
          city: s.city,
          description: s.description,
          visits30d: s.visits30d,
          isPremium: s.isPremium,
          verified: s.verificationStatus === "verified",
        })),
        newest: newest.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoEmoji: s.logoEmoji,
          city: s.city,
          description: s.description,
          isPremium: s.isPremium,
          verified: s.verificationStatus === "verified",
        })),
        products,
        // P2 — navigation catégories
        categories,
        category: selectedCategory,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/home", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
