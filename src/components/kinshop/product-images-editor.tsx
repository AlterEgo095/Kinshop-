"use client"

// KinShop V4 → Mission Premium — Éditeur de galerie photos produit (dashboard vendeur)
// - Ajout depuis l'appareil (compression client instantanée → aperçu immédiat)
//   puis optimisation SERVEUR (sharp : rotation EXIF, redimensionnement 1280,
//   JPEG progressif qualité uniforme) avec repli gracieux hors ligne/3G ;
// - Ajout par lien, remplacement d'une photo existante (position conservée),
//   réorganisation (la 1ʳᵉ = image principale), suppression ;
// - Règles d'abonnement affichées : quota du plan effectif (maxImages) +
//   bandeau d'upsell Premium lorsque la galerie multi-photos est verrouillée.
// Le serveur reste l'autorité finale (/api/products revérifie le quota du plan).

import { useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Crown, ImagePlus, Link2, Loader2, RefreshCw, Star, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { compressImageFile, dataUrlSize } from "@/lib/images"
import { MAX_PRODUCT_IMAGES } from "@/lib/kinshop"

interface ProductImagesEditorProps {
  images: string[]
  onChange: (images: string[]) => void
  /** Quota du plan effectif (photos max). Défaut : 5 (référence Premium). */
  maxImages?: number
  /** true = abonnement actif (galerie multi-photos débloquée). */
  premiumUnlocked?: boolean
  /** storeId propriétaire — active l'optimisation serveur (sharp) après ajout. */
  optimizeStoreId?: string
  /** Ouvre l'offre Premium (dialog existant du dashboard). */
  onUpgrade?: () => void
}

export function ProductImagesEditor({
  images,
  onChange,
  maxImages = MAX_PRODUCT_IMAGES,
  premiumUnlocked = false,
  optimizeStoreId,
  onUpgrade,
}: ProductImagesEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetIdx = useRef<number>(-1)
  const [busy, setBusy] = useState(false)
  const [urlValue, setUrlValue] = useState("")
  // Optimisation serveur en cours par index (spinner sur la vignette)
  const [optimizing, setOptimizing] = useState<Record<number, boolean>>({})

  const remaining = Math.max(0, maxImages - images.length)
  const galleryLocked = !premiumUnlocked

  // Miroir de la prop images (rafraîchi à chaque rendu) — évite les closures
  // obsolètes dans les callbacks asynchrones d'optimisation serveur.
  const latestImagesRef = useRef(images)
  useEffect(() => {
    latestImagesRef.current = images
  }, [images])

  /** Optimisation serveur (sharp) — repli silencieux sur la version client si indisponible. */
  const optimizeOnServer = async (dataUrl: string, index: number) => {
    if (!optimizeStoreId || !dataUrl.startsWith("data:")) return
    setOptimizing((o) => ({ ...o, [index]: true }))
    try {
      const res = await fetch("/api/products/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: optimizeStoreId, dataUrl }),
      })
      if (!res.ok) return // repli : la version compressée côté appareil reste en place
      const data = await res.json()
      if (typeof data.dataUrl === "string" && data.dataUrl.startsWith("data:")) {
        // On ne remplace que si la photo visée est toujours à la même place avec
        // le même contenu (sinon l'utilisateur a déjà réorganisé/édité entre-temps).
        const cur = latestImagesRef.current
        if (index < cur.length && cur[index] === dataUrl) {
          const next = [...cur]
          next[index] = data.dataUrl
          onChange(next)
        }
      }
    } catch {
      // réseau instable (3G) : la version client suffit — jamais bloquant
    } finally {
      setOptimizing((o) => {
        const n = { ...o }
        delete n[index]
        return n
      })
    }
  }

  const handleFiles = async (files: FileList | null, replaceIndex?: number) => {
    if (!files || files.length === 0) return
    const isReplace = typeof replaceIndex === "number" && replaceIndex >= 0
    const slots = isReplace ? 1 : remaining
    if (slots <= 0) {
      toast.error(`Maximum ${maxImages} photo(s) par produit avec ton plan.`)
      return
    }
    setBusy(true)
    try {
      if (isReplace) {
        try {
          const dataUrl = await compressImageFile(files[0])
          const next = [...images]
          next[replaceIndex] = dataUrl
          onChange(next)
          toast.success("Photo remplacée ✅")
          void optimizeOnServer(dataUrl, replaceIndex)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Image refusée.")
        }
      } else {
        const added: string[] = []
        for (const file of Array.from(files).slice(0, slots)) {
          try {
            const dataUrl = await compressImageFile(file)
            added.push(dataUrl)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : `« ${file.name} » refusée.`)
          }
        }
        if (added.length) {
          const startIndex = images.length
          onChange([...images, ...added])
          const kb = Math.round(added.reduce((s, d) => s + dataUrlSize(d), 0) / 1024)
          toast.success(
            `${added.length} photo(s) ajoutée(s) (${kb} Ko)${optimizeStoreId ? " — optimisation serveur en cours…" : ""} 📸`,
          )
          added.forEach((d, i) => void optimizeOnServer(d, startIndex + i))
        }
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
      if (replaceInputRef.current) replaceInputRef.current.value = ""
    }
  }

  const addUrl = () => {
    const url = urlValue.trim()
    if (!url) return
    if (images.length >= maxImages) {
      toast.error(`Maximum ${maxImages} photo(s) par produit avec ton plan.`)
      return
    }
    if (!/^(https?:\/\/|data:image\/)/i.test(url)) {
      toast.error("Colle un lien d'image valide (https://…).")
      return
    }
    const idx = images.length
    onChange([...images, url])
    setUrlValue("")
    toast.success("Photo ajoutée ✅")
    void optimizeOnServer(url, idx) // no-op pour les liens https (data: seulement)
  }

  const removeAt = (idx: number) => onChange(images.filter((_, i) => i !== idx))

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...images]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Photos du produit</p>
        <div className="flex items-center gap-1.5">
          {!premiumUnlocked && (
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              Plan Free
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px]">
            {images.length}/{maxImages}
          </Badge>
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={`${idx}-${img.slice(0, 32)}`}
              className="relative group rounded-xl overflow-hidden border bg-muted"
            >
              <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-20 object-cover" />
              {optimizing[idx] && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center" aria-live="polite">
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                  <span className="sr-only">Optimisation en cours</span>
                </div>
              )}
              {idx === 0 && (
                <span className="absolute top-1 left-1 bg-amber-400 text-amber-950 rounded-full px-1.5 py-0.5 text-[9px] font-bold flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-amber-950" />
                  Principale
                </span>
              )}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                aria-label={`Retirer la photo ${idx + 1}`}
              >
                <X className="w-3 h-3" />
              </button>
              <div className="absolute bottom-1 right-1 flex gap-1">
                {/* Mission Premium — remplacement sans changer la position */}
                <button
                  type="button"
                  onClick={() => {
                    replaceTargetIdx.current = idx
                    replaceInputRef.current?.click()
                  }}
                  className="bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition-opacity"
                  aria-label={`Remplacer la photo ${idx + 1}`}
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 disabled:opacity-30 transition-opacity"
                      aria-label={`Déplacer la photo ${idx + 1} à gauche`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={idx === images.length - 1}
                      className="bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 disabled:opacity-30 transition-opacity"
                      aria-label={`Déplacer la photo ${idx + 1} à droite`}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input caché pour le remplacement d'une photo existante (position conservée) */}
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const idx = replaceTargetIdx.current
          replaceTargetIdx.current = -1
          handleFiles(e.target.files, idx >= 0 ? idx : undefined)
        }}
        aria-label="Choisir une photo de remplacement"
      />

      {/* Ajout de photos — verrouillé si quota plan atteint */}
      {remaining > 0 ? (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-11"
              onClick={() => {
                replaceTargetIdx.current = -1
                fileRef.current?.click()
              }}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1.5" />}
              {busy ? "Compression…" : "Ajouter des photos"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              aria-label="Choisir des photos depuis l'appareil"
            />
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Link2 className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Ou colle un lien d'image…"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrl()}
                aria-label="Lien de l'image"
              />
            </div>
            <Button type="button" variant="secondary" onClick={addUrl}>
              Ajouter
            </Button>
          </div>
        </>
      ) : (
        galleryLocked && (
          /* Mission Premium — verrou clair : la galerie multi-photos nécessite l'abonnement */
          <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-emerald-50/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400 flex items-center justify-center shrink-0 shadow-sm">
                <Crown className="w-5 h-5 text-amber-950" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">Galerie multi-photos</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Avec Premium : jusqu&apos;à {MAX_PRODUCT_IMAGES} photos par produit, réorganisation et choix de
                  l&apos;image principale, optimisation serveur professionnelle.
                </p>
              </div>
            </div>
            {onUpgrade && (
              <Button
                type="button"
                onClick={onUpgrade}
                className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
              >
                <Crown className="w-4 h-4 mr-1.5" />
                Débloquer avec Premium
              </Button>
            )}
          </div>
        )
      )}

      {/* Aide contextuelle (quota premium atteint → info, pas de blocage d'usage) */}
      {remaining === 0 && !galleryLocked && (
        <p className="text-xs text-muted-foreground">Limite de ton plan atteinte ({maxImages} photos).</p>
      )}
      {images.length > 0 && (
        <p className="text-xs text-muted-foreground">
          La 1ʳᵉ photo est l&apos;image principale. Photos compressées puis optimisées automatiquement (rendu
          professionnel, idéal réseau 3G).
        </p>
      )}
    </div>
  )
}
