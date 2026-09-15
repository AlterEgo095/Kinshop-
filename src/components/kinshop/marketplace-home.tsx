"use client"

// V10 — Sections MARKETPLACE de la page d'accueil
// HONNÊTETÉ : sponsorisé = campagnes Boost payées (étiquette claire),
// populaire = visites réelles 30 j, nouveautés = dernières boutiques.

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Flame, Loader2, Sparkles, Megaphone, Package, ShieldCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatUSD } from "@/lib/kinshop"

interface HomeCategory {
  id: string
  name: string
  slug: string
  icon: string
}

interface HomeData {
  sponsored: { campaignId: string; slug: string; name: string; logoEmoji: string; city: string; description: string; verified?: boolean }[]
  popular: { slug: string; name: string; logoEmoji: string; city: string; description: string; visitors30d: number; verified?: boolean }[]
  newest: { slug: string; name: string; logoEmoji: string; city: string; description: string }[]
  products: { id: string; name: string; emoji: string; imageUrl: string; priceUSD: number; category: string; description?: string; store: { name: string; slug: string } }[]
  // P2 — navigation par catégories globales (barre d'icônes + filtre actif)
  categories?: HomeCategory[]
  category?: HomeCategory | null
}

function StoreCard({
  emoji,
  name,
  city,
  description,
  badge,
  verified,
  onOpen,
}: {
  emoji: string
  name: string
  city: string
  description: string
  badge?: React.ReactNode
  verified?: boolean
  onOpen: () => void
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="text-left w-full"
      aria-label={`Ouvrir la boutique ${name}`}
    >
      <Card className="h-full hover:shadow-md transition-shadow">
        <CardContent className="p-4 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-2xl" aria-hidden="true">{emoji}</span>
            {badge}
          </div>
          <p className="font-bold text-sm truncate flex items-center gap-1">
            {name}
            {/* P5 (F5-1) — statut vérifié confirmé par l'administration */}
            {verified && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-label="Boutique vérifiée" />}
          </p>
          <p className="text-xs text-muted-foreground">📍 {city}</p>
          {description && <p className="text-xs text-muted-foreground/80 line-clamp-2">{description}</p>}
        </CardContent>
      </Card>
    </motion.button>
  )
}

export function MarketplaceHome({ onOpenStore }: { onOpenStore: (slug: string) => void }) {
  const [data, setData] = useState<HomeData | null>(null)
  const [loaded, setLoaded] = useState(false)
  // P2 — catégorie globale active (slug) ; null = toutes catégories
  const [cat, setCat] = useState<string | null>(null)
  const [catLoading, setCatLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cat) setCatLoading(true)
      await Promise.resolve()
      if (cancelled) return
      try {
        const res = await fetch(`/api/home${cat ? `?cat=${encodeURIComponent(cat)}` : ""}`, { cache: "no-store" })
        const d = await res.json()
        if (!cancelled && res.ok) setData(d)
        else if (!cancelled && !res.ok) setData(null)
      } catch {
        // silencieux : la section reste masquée si le service est indisponible
      } finally {
        if (!cancelled) {
          setLoaded(true)
          setCatLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cat])

  const trackClick = (campaignId: string) => {
    fetch("/api/boost/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: campaignId }),
    }).catch(() => {})
  }

  if (loaded && (!data || (data.sponsored.length === 0 && data.popular.length === 0 && data.newest.length === 0 && data.products.length === 0 && !(data.categories && data.categories.length > 0)))) {
    return null // rien à montrer — aucune donnée fabriquée
  }

  return (
    <section className="max-w-6xl mx-auto px-4 py-10 space-y-8" aria-label="Marketplace KinShop">
      {/* P2 — Navigation par catégories (catalogue réel, navigation honnête) */}
      {data && data.categories && data.categories.length > 0 && (
        <div className="space-y-3">
          <p className="font-extrabold text-lg flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Explorer par catégorie
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setCat(null)}
              aria-pressed={!cat}
              className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-all ${
                !cat
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white border-border hover:border-primary/50"
              }`}
            >
              ✨ Tout
            </button>
            {data.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(cat === c.slug ? null : c.slug)}
                aria-pressed={cat === c.slug}
                className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-all ${
                  cat === c.slug
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white border-border hover:border-primary/50"
                }`}
              >
                {c.icon} {c.name}
              </button>
            ))}
          </div>
          {catLoading && (
            <div className="flex gap-2 items-center text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" /> Filtrage…
            </div>
          )}
          {data.category && !catLoading && (
            <p className="text-xs text-muted-foreground">
              Catégorie sélectionnée : <span className="font-semibold text-foreground">{data.category.icon} {data.category.name}</span>
            </p>
          )}
        </div>
      )}

      {/* Sponsorisé — campagnes Boost payées, clairement étiquetées */}
      {data && data.sponsored.length > 0 && (
        <div className="space-y-3">
          <p className="font-extrabold text-lg flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary" /> Boutiques sponsorisées
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">Publicité</Badge>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.sponsored.map((s) => (
              <StoreCard
                key={s.campaignId}
                emoji={s.logoEmoji}
                name={s.name}
                city={s.city}
                description={s.description}
                verified={s.verified}
                badge={<Badge className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px]">Sponsorisé</Badge>}
                onOpen={() => {
                  trackClick(s.campaignId)
                  onOpenStore(s.slug)
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Populaires — classement réel (visiteurs uniques 30 j, dédupliqués) */}
      {data && data.popular.length > 0 && (
        <div className="space-y-3">
          <p className="font-extrabold text-lg flex items-center gap-2">
            <Flame className="w-5 h-5 text-orange-500" /> Boutiques populaires
            <span className="text-xs font-normal text-muted-foreground">les plus visitées ces 30 derniers jours</span>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.popular.slice(0, 4).map((s) => (
              <StoreCard
                key={s.slug}
                emoji={s.logoEmoji}
                name={s.name}
                city={s.city}
                description={s.description}
                verified={s.verified}
                badge={<span className="text-[11px] text-muted-foreground">{s.visitors30d} visiteurs</span>}
                onOpen={() => onOpenStore(s.slug)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Nouveautés produits */}
      {data && data.products.length > 0 && (
        <div className="space-y-3">
          <p className="font-extrabold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Nouveautés du marketplace
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.products.slice(0, 4).map((p) => (
              <motion.button
                key={p.id}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpenStore(p.store.slug)}
                className="text-left w-full"
                aria-label={`Voir ${p.name} chez ${p.store.name}`}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-1">
                    <div className="h-16 flex items-center justify-center text-3xl" aria-hidden="true">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="h-16 w-16 object-cover rounded-lg" />
                      ) : (
                        p.emoji || <Package className="w-6 h-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <p className="font-bold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.store.name}</p>
                    {/* Mission Premium — extrait de description (accueil marketplace) */}
                    {p.description && (
                      <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2 min-h-[2em]">{p.description}</p>
                    )}
                    <p className="text-sm font-extrabold text-primary">{formatUSD(p.priceUSD)}</p>
                  </CardContent>
                </Card>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Nouvelles boutiques */}
      {data && data.newest.length > 0 && (
        <div className="space-y-3">
          <p className="font-extrabold text-lg flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> Dernières boutiques créées
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.newest.slice(0, 4).map((s) => (
              <StoreCard key={s.slug} emoji={s.logoEmoji} name={s.name} city={s.city} description={s.description} onOpen={() => onOpenStore(s.slug)} />
            ))}
          </div>
        </div>
      )}

      {!loaded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      )}
    </section>
  )
}
