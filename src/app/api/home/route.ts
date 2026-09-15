import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createHash } from "crypto"
import { expireDueCampaigns } from "@/lib/boost"

// GET /api/home — Données de la page d'accueil MARKETPLACE (V10, public)
//
// HONNÊTETÉ DE L'AFFICHAGE :
// - sponsorisé   = campagnes Boost PAYÉES et actives uniquement — clairement étiquetées
//                  (P6 : boutique avec ≥1 produit, rotation équitable par jour) ;
// - populaire    = classement RÉEL par VISITEURS UNIQUES dédupliqués (30 j) —
//                  jamais fabriqué (P7 F7-6 : plus de classement par pages vues brutes,
//                  falsifiable par refresh) ;
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

    // P6 F6-1 — purge paresseuse : les campagnes expirées quittent l'accueil
    // ET leur statut DB devient honnête (ended) pour le compteur maxActive,
    // le GET owner et la console admin.
    await expireDueCampaigns()

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
    // P6 F6-5 — prise ÉLARGIE (24) AVANT filtres : sous ?cat=, prendre 6
    // globalement puis filtrer laissait la section vide à tort.
    // P6 F6-6 — la boutique sponsorisée doit avoir ≥ 1 produit (jamais de
    // publicité payante vers une boutique vide).
    const activeBoosts = await db.boostCampaign.findMany({
      where: {
        status: "active",
        startAt: { lte: now },
        endAt: { gte: now },
        // Résilience : un filtre sur la relation exclut toute campagne orpheline
        // (storeId sans store — ex. surgery DB manuelle) au lieu de faire 500.
        store: { status: "active" },
      },
      orderBy: { startAt: "asc" },
      take: 24,
      include: {
        store: {
          select: {
            id: true, slug: true, name: true, logoEmoji: true, city: true, description: true,
            status: true, isPremium: true, premiumUntil: true, verificationStatus: true,
            _count: { select: { products: true } },
          },
        },
      },
    })
    const eligible = activeBoosts
      .filter((b) => b.store.status === "active" && b.store._count.products > 0)
      .filter((b) => !selectedCategory || catStoreIds.includes(b.store.id))
    // P6 F6-5 — rotation ÉQUITAble déterministe par jour (les mêmes 6 anciennes
    // n'écrasent plus indéfiniment les suivantes quand il y a plus de 6 campagnes)
    const dayIndex = Math.floor(now.getTime() / 86_400_000)
    const rotated = eligible.length > 0 ? eligible.map((_, i) => eligible[(i + dayIndex) % eligible.length]) : []
    const sponsored = rotated.slice(0, 6).map((b) => ({ campaignId: b.id, store: b.store }))

    // 2) Boutiques populaires : VISITEURS UNIQUES dédupliqués sur 30 jours
    //    (P7 F7-6 — le classement par pages vues brutes était falsifiable par
    //    refresh ; le compteur unique est dédupliqué hash(ip|ua|jour))
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const visits = await db.storeVisit.groupBy({
      by: ["storeId"],
      where: { day: { gte: since } },
      _sum: { count: true, unique: true },
    })
    const visitMap = new Map(visits.map((v) => [v.storeId, v._sum.unique ?? 0]))
    const stores = await db.store.findMany({
      where: {
        status: "active",
        // P2 — sous filtre catégorie : la boutique doit exposer la catégorie
        ...(selectedCategory ? { id: { in: catStoreIds } } : {}),
      },
      select: { id: true, slug: true, name: true, logoEmoji: true, city: true, description: true, isPremium: true, premiumUntil: true, verificationStatus: true, createdAt: true },
    })
    const popular = stores
      .map((s) => ({ ...s, visitors30d: visitMap.get(s.id) ?? 0 }))
      .sort((a, b) => b.visitors30d - a.visitors30d)
      .filter((s) => s.visitors30d > 0)
      .slice(0, 8)

    // 3) Nouveautés : dernières boutiques actives
    const newest = [...stores]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6)

    // 4) Produits récents (nouveautés catalogue) — prix réels, pas de classement inventé
    const latestProducts = await db.product.findMany({
      orderBy: { createdAt: "desc" },
      // Résilience : filtre relationnel dans le where (sémantique inner-join) —
      // les produits orphelins/de boutique inactive sont exclus dès le SQL.
      where: {
        store: { status: "active" },
        // P2 — sous filtre catégorie : produits rattachés à un rayon de la catégorie
        ...(selectedCategory ? { storeCategoryId: { in: catStoreCategoryIds } } : {}),
      },
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
        // Mission Premium — extrait de description pour l'accueil marketplace
        // (raccourci texte brut, la mise en forme complète vitrine sur la boutique)
        description: p.description
          ? p.description.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/\s+/g, " ").trim().slice(0, 140)
          : "",
        store: { name: p.store.name, slug: p.store.slug },
      }))

    // Incrément d'impressions des campagnes AFFICHÉES (mesure honnête, non bloquante)
    // P6 F6-3 — dédup journalier par visiteur×campagne (hash ip|ua|jour) :
    // un refresh ne gonfle plus les impressions. Best effort, jamais bloquant.
    if (sponsored.length > 0) {
      void (async () => {
        try {
          const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local"
          const ua = (req.headers.get("user-agent") || "").slice(0, 120)
          const day = new Date()
          day.setUTCHours(0, 0, 0, 0)
          const dayStr = day.toISOString().slice(0, 10)
          for (const s of sponsored) {
            const key = createHash("sha256")
              .update(`boostimp|${s.campaignId}|${ip}|${ua}|${dayStr}`)
              .digest("hex")
            try {
              await db.visitDedup.create({ data: { key } })
              await db.boostCampaign.update({
                where: { id: s.campaignId },
                data: { impressions: { increment: 1 } },
              })
            } catch {
              // déjà comptée aujourd'hui pour ce visiteur
            }
          }
        } catch {
          // mesure honnête, jamais bloquante
        }
      })()
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
          visitors30d: s.visitors30d,
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
