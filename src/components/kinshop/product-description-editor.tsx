"use client"

// KinShop — Mission Premium : éditeur de description produit + caractéristiques
// structurées (dashboard vendeur).
// - Plan Premium actif  → édition complète (mise en forme légère : paragraphes,
//   puces « - », gras « **…** ») + caractéristiques (dimensions, avantages…).
// - Plan Free / expiré  → fonctionnalité VERROUILLÉE : bloc explicite avec
//   bénéfices + bouton d'upsell (ouvre l'offre Premium du dashboard). Si une
//   description préexistante (abonnement expiré) elle reste affichée en
//   lecture seule — jamais de perte de contenu.
// Le serveur est l'autorité finale : ces limites sont revérifiées par /api/products.

import { Crown, Info, Lock, Plus, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { MAX_SPECS } from "@/lib/kinshop"
import type { ProductSpec } from "@/lib/kinshop"
import { ProductDescription } from "@/components/kinshop/product-description"

interface ProductDescriptionEditorProps {
  description: string
  onDescriptionChange: (value: string) => void
  specs: ProductSpec[]
  onSpecsChange: (specs: ProductSpec[]) => void
  /** Quota du plan effectif (caractères). 0 = fonctionnalité verrouillée. */
  maxDescriptionChars: number
  /** Quota du plan effectif (nombre d'entrées). 0 = fonctionnalité verrouillée. */
  maxSpecs: number
  /** true = abonnement actif → édition déverrouillée. */
  premiumUnlocked: boolean
  /** Ouvre l'offre Premium (dialog existant du dashboard). */
  onUpgrade: () => void
}

const BENEFITS = [
  "Description commerciale complète, modifiable à tout moment",
  "Mise en forme professionnelle : paragraphes, puces, texte en gras",
  "Caractéristiques structurées : dimensions, avantages, variantes…",
  "Aperçu avant publication sur ta vitrine",
]

export function ProductDescriptionEditor({
  description,
  onDescriptionChange,
  specs,
  onSpecsChange,
  maxDescriptionChars,
  maxSpecs,
  premiumUnlocked,
  onUpgrade,
}: ProductDescriptionEditorProps) {
  const locked = maxDescriptionChars <= 0 && maxSpecs <= 0 && !premiumUnlocked
  const hasLegacy = !premiumUnlocked && (description.trim().length > 0 || specs.length > 0)

  /* ─────────── Verrouillé : bloc d'upsell (règles commerciales affichées) ─────────── */
  if (locked) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Présentation commerciale</p>
          <Badge variant="outline" className="text-[11px] gap-1 border-amber-300 bg-amber-50 text-amber-800">
            <Lock className="w-3 h-3" />
            Premium
          </Badge>
        </div>
        {hasLegacy && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Ta description existante reste visible sur ta vitrine — active Premium pour la modifier.
            </p>
            <ProductDescription description={description} specs={specs} dense className="opacity-80" />
          </div>
        )}
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-emerald-50/60 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shrink-0 shadow-sm">
              <Crown className="w-5 h-5 text-amber-950" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">Décris tes produits comme un pro</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fonctionnalité réservée à l&apos;abonnement Premium actif.
              </p>
            </div>
          </div>
          <ul className="space-y-1">
            {BENEFITS.map((b) => (
              <li key={b} className="flex gap-2 text-xs text-foreground/80">
                <span aria-hidden className="text-emerald-600 font-bold">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={onUpgrade}
            className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
          >
            <Crown className="w-4 h-4 mr-1.5" />
            Débloquer avec Premium
          </Button>
        </div>
      </div>
    )
  }

  /* ─────────── Déverrouillé : édition complète ─────────── */
  const updateSpec = (idx: number, patch: Partial<ProductSpec>) => {
    onSpecsChange(specs.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }
  const removeSpec = (idx: number) => onSpecsChange(specs.filter((_, i) => i !== idx))
  const addSpec = () => {
    if (specs.length >= Math.min(maxSpecs, MAX_SPECS)) return
    onSpecsChange([...specs, { label: "", value: "" }])
  }

  return (
    <div className="space-y-4">
      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Description du produit</Label>
          <span
            className={`text-[11px] ${description.length > maxDescriptionChars ? "text-red-600 font-semibold" : "text-muted-foreground"}`}
          >
            {description.length}/{maxDescriptionChars}
          </span>
        </div>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          maxLength={maxDescriptionChars}
          rows={6}
          placeholder={
            "Décris ton produit : **Points forts** en gras, avantages, usage…\n\n- Une ligne qui commence par « - » devient une puce\n- Ligne vide = nouveau paragraphe"
          }
          className="min-h-[130px] resize-y"
          aria-label="Description du produit"
        />
        <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
          <Info className="w-3 h-3 mt-0.5 shrink-0" />
          Mise en forme : ligne vide = paragraphe, « - » en début de ligne = puce, **texte** = gras.
        </p>
      </div>

      {/* Aperçu immédiat de la mise en forme */}
      {(description.trim() || specs.some((s) => s.label && s.value)) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Aperçu de la mise en forme</p>
          <div className="rounded-xl border bg-white p-3">
            <ProductDescription description={description} specs={specs} dense />
          </div>
        </div>
      )}

      {/* Caractéristiques structurées */}
      {maxSpecs > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Caractéristiques</Label>
            <Badge variant="outline" className="text-[11px]">
              {specs.filter((s) => s.label || s.value).length}/{maxSpecs}
            </Badge>
          </div>
          {specs.length > 0 && (
            <div className="space-y-2">
              {specs.map((s, i) => (
                <div key={`spec-${i}`} className="flex gap-2 items-center">
                  <Input
                    value={s.label}
                    onChange={(e) => updateSpec(i, { label: e.target.value })}
                    placeholder="Label (ex. Couleur)"
                    maxLength={40}
                    className="flex-1"
                    aria-label={`Label de la caractéristique ${i + 1}`}
                  />
                  <Input
                    value={s.value}
                    onChange={(e) => updateSpec(i, { value: e.target.value })}
                    placeholder="Valeur (ex. Rouge)"
                    maxLength={200}
                    className="flex-1"
                    aria-label={`Valeur de la caractéristique ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(i)}
                    className="rounded-full p-1.5 hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                    aria-label={`Retirer la caractéristique ${i + 1}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {specs.length < Math.min(maxSpecs, MAX_SPECS) ? (
            <Button type="button" variant="outline" size="sm" onClick={addSpec} className="w-full">
              <Plus className="w-4 h-4 mr-1.5" />
              Ajouter une caractéristique
            </Button>
          ) : (
            <p className="text-[11px] text-muted-foreground">Maximum {maxSpecs} caractéristiques.</p>
          )}
        </div>
      )}
    </div>
  )
}
