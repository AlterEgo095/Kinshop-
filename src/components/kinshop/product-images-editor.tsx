"use client"

// KinShop V4 — Éditeur de galerie photos produit (dashboard vendeur)
// Upload depuis l'appareil (compressé) + ajout par lien + réordre + suppression.

import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, ImagePlus, Link2, Loader2, Star, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { compressImageFile, dataUrlSize } from "@/lib/images"
import { MAX_PRODUCT_IMAGES } from "@/lib/kinshop"

interface ProductImagesEditorProps {
  images: string[]
  onChange: (images: string[]) => void
}

export function ProductImagesEditor({ images, onChange }: ProductImagesEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [urlValue, setUrlValue] = useState("")

  const remaining = MAX_PRODUCT_IMAGES - images.length

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const slots = MAX_PRODUCT_IMAGES - images.length
    if (slots <= 0) {
      toast.error(`Maximum ${MAX_PRODUCT_IMAGES} photos par produit.`)
      return
    }
    setBusy(true)
    const added: string[] = []
    try {
      for (const file of Array.from(files).slice(0, slots)) {
        try {
          const dataUrl = await compressImageFile(file)
          added.push(dataUrl)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `« ${file.name} » refusée.`)
        }
      }
      if (added.length) {
        onChange([...images, ...added])
        const kb = Math.round(added.reduce((s, d) => s + dataUrlSize(d), 0) / 1024)
        toast.success(`${added.length} photo(s) ajoutée(s) (${kb} Ko) 📸`)
      }
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const addUrl = () => {
    const url = urlValue.trim()
    if (!url) return
    if (images.length >= MAX_PRODUCT_IMAGES) {
      toast.error(`Maximum ${MAX_PRODUCT_IMAGES} photos par produit.`)
      return
    }
    if (!/^(https?:\/\/|data:image\/)/i.test(url)) {
      toast.error("Colle un lien d'image valide (https://…).")
      return
    }
    onChange([...images, url])
    setUrlValue("")
    toast.success("Photo ajoutée ✅")
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
        <Badge variant="outline" className="text-[11px]">
          {images.length}/{MAX_PRODUCT_IMAGES}
        </Badge>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={`${idx}-${img.slice(0, 32)}`}
              className="relative group rounded-xl overflow-hidden border bg-muted"
            >
              <img src={img} alt={`Photo ${idx + 1}`} className="w-full h-20 object-cover" />
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
              {images.length > 1 && (
                <div className="absolute bottom-1 right-1 flex gap-1">
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
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1 h-11"
          onClick={() => fileRef.current?.click()}
          disabled={busy || remaining <= 0}
        >
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-1.5" />}
          {busy ? "Compression…" : remaining > 0 ? "Ajouter des photos" : "Limite atteinte"}
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
        <Button type="button" variant="secondary" onClick={addUrl} disabled={remaining <= 0}>
          Ajouter
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        La 1ʳᵉ photo est l'image principale. Photos compressées automatiquement (idéal réseau 3G).
      </p>
    </div>
  )
}
