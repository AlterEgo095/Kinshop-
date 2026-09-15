"use client"

// KinShop — Mission Premium : aperçu « avant publication » d'une fiche produit.
// Reproduit fidèlement le rendu de la vitrine publique (store-view) : carte
// du catalogue + fiche détaillée avec galerie, description mise en forme et
// caractéristiques. Utilisé dans les dialogs d'ajout/édition du dashboard —
// le vendeur voit exactement ce que verra l'acheteur, sans publier.

import { useState } from "react"
import { ChevronLeft, ChevronRight, Images, ShoppingCart, Star } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatFC, formatUSD, descriptionPlainText, type ProductSpec } from "@/lib/kinshop"
import { ProductDescription } from "@/components/kinshop/product-description"
import { cn } from "@/lib/utils"

export interface StorefrontPreviewData {
  name: string
  emoji: string
  images: string[]
  priceUSD: number
  category?: string
  description: string
  specs: ProductSpec[]
}

/** Carte du catalogue (rendu vitrine, grille responsive). */
export function StorefrontCardPreview({ p, rate }: { p: StorefrontPreviewData; rate: number }) {
  const main = p.images[0] || ""
  const snippet = descriptionPlainText(p.description)
  return (
    <div className="rounded-xl border bg-white overflow-hidden shadow-sm max-w-[260px] w-full">
      <div className="p-3">
        <div className="relative rounded-xl mb-2 overflow-hidden bg-emerald-50">
          {main ? (
            <img src={main} alt={p.name} className="w-full h-32 object-cover" />
          ) : (
            <div className="w-full h-32 bg-emerald-50 flex items-center justify-center text-5xl">{p.emoji}</div>
          )}
          {p.images.length > 1 && (
            <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
              <Images className="w-3 h-3" />
              {p.images.length}
            </span>
          )}
        </div>
        {p.category && (
          <Badge variant="outline" className="text-[10px] w-fit mb-2 px-2 py-0">
            {p.category}
          </Badge>
        )}
        <p className="font-semibold text-sm leading-snug line-clamp-2">{p.name || "Nom du produit"}</p>
        {snippet && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{snippet}</p>}
        <p className="font-extrabold text-primary text-lg leading-tight mt-2">{formatFC(p.priceUSD * rate)}</p>
      </div>
    </div>
  )
}

/** Fiche détaillée (rendu vitrine, dialog). */
export function StorefrontDetailPreview({ p, rate }: { p: StorefrontPreviewData; rate: number }) {
  const [idx, setIdx] = useState(0)
  const gallery = p.images
  const current = gallery[idx] || gallery[0] || ""
  return (
    <div className="rounded-xl border bg-white overflow-hidden shadow-sm max-w-[340px] w-full mx-auto">
      {/* Grande image + navigation (identique store-view) */}
      <div className="relative bg-emerald-50">
        <div className="aspect-square w-full overflow-hidden flex items-center justify-center">
          {current ? (
            <img src={current} alt={`${p.name} — photo ${idx + 1}`} className="w-full h-full object-cover" />
          ) : (
            <span className="text-7xl">{p.emoji}</span>
          )}
        </div>
        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIdx((i) => (i - 1 + gallery.length) % gallery.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border shadow rounded-full p-1.5"
              aria-label="Photo précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIdx((i) => (i + 1) % gallery.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border shadow rounded-full p-1.5"
              aria-label="Photo suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full px-2.5 py-0.5 text-[11px] font-bold">
              {idx + 1}/{gallery.length}
            </span>
          </>
        )}
      </div>

      {/* Miniatures */}
      {gallery.length > 1 && (
        <div className="flex gap-2 px-3 pt-3 overflow-x-auto">
          {gallery.map((img, i) => (
            <button
              key={`thumb-${i}`}
              type="button"
              onClick={() => setIdx(i)}
              className={cn(
                "shrink-0 rounded-lg overflow-hidden border-2 transition-all",
                i === idx ? "border-emerald-600" : "border-transparent opacity-70",
              )}
              aria-label={`Voir la photo ${i + 1}`}
            >
              <img src={img} alt="" className="w-12 h-12 object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Infos — description mise en forme + specs (rendu réel ProductDescription) */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {p.category && (
              <Badge variant="outline" className="text-[10px] mb-1.5">
                {p.category}
              </Badge>
            )}
            <h4 className="font-bold text-base leading-snug">{p.name || "Nom du produit"}</h4>
          </div>
          <div className="text-right shrink-0">
            <p className="font-extrabold text-primary text-lg leading-tight">{formatFC(p.priceUSD * rate)}</p>
            <p className="text-xs text-muted-foreground">{formatUSD(p.priceUSD)}</p>
          </div>
        </div>
        <ProductDescription description={p.description} specs={p.specs} dense />
        <Button size="lg" className="w-full text-sm opacity-90 pointer-events-none" tabIndex={-1} aria-hidden>
          <ShoppingCart className="w-4 h-4 mr-2" />
          Ajouter au panier
        </Button>
        <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          Aperçu vendeur — rendu acheteur sur ta vitrine publique
        </p>
      </div>
    </div>
  )
}
