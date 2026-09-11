"use client"

// Statut Studio — Génère l'image promo de la boutique pour le statut WhatsApp
// Carte 1080×1920 (format statut 9:16) : fond IA + QR code du lien boutique.
// Le vendeur télécharge le PNG et le poste dans son statut → chaque vue amène
// de nouveaux clients ET de nouveaux vendeurs (boucle virale KinShop).

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Download, Loader2, Share2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import QRCode from "qrcode"
import type { StoreData } from "@/lib/kinshop"

const W = 1080
const H = 1920

const DESIGNS = [
  { id: "fond-1", label: "Émeraude marché", url: "/status/fond-1.png" },
  { id: "fond-2", label: "Nuit kinois", url: "/status/fond-2.png" },
  { id: "fond-3", label: "Luxe ambre", url: "/status/fond-3.png" },
]

interface StatusStudioProps {
  store: StoreData
  storeLink: string
}

export function StatusStudio({ store, storeLink }: StatusStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [design, setDesign] = useState(DESIGNS[0].id)
  const [bgReady, setBgReady] = useState(false)
  const [qrReady, setQrReady] = useState(false)
  const [rendering, setRendering] = useState(false)

  const slogan =
    store.description?.trim().slice(0, 90) ||
    "Commande directement en ligne — livraison à Kinshasa 🚚"

  // Préchargement du fond
  useEffect(() => {
    let cancelled = false
    setBgReady(false)
    const img = new Image()
    img.onload = () => {
      if (!cancelled) setBgReady(true)
    }
    img.src = DESIGNS.find((d) => d.id === design)?.url ?? DESIGNS[0].url
    return () => {
      cancelled = true
    }
  }, [design])

  // Génération du QR code (sombre sur blanc, lisible en statut)
  useEffect(() => {
    let cancelled = false
    setQrReady(false)
    QRCode.toDataURL(storeLink, {
      margin: 1,
      width: 560,
      errorCorrectionLevel: "M",
      color: { dark: "#065f46", light: "#ffffff" },
    })
      .then((url) => {
        if (cancelled) return
        const img = new Image()
        img.onload = () => {
          if (!cancelled) setQrReady(true)
        }
        img.src = url
      })
      .catch(() => {
        if (!cancelled) toast.error("Impossible de générer le QR code.")
      })
    return () => {
      cancelled = true
    }
  }, [storeLink])

  const roundRect = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath()
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, r)
      } else {
        ctx.moveTo(x + r, y)
        ctx.arcTo(x + w, y, x + w, y + h, r)
        ctx.arcTo(x + w, y + h, x, y + h, r)
        ctx.arcTo(x, y + h, x, y, r)
        ctx.arcTo(x, y, x + w, y, r)
        ctx.closePath()
      }
    },
    [],
  )

  const drawImageCover = useCallback(
    (ctx: CanvasRenderingContext2D, img: HTMLImageElement) => {
      const ratio = Math.max(W / img.width, H / img.height)
      const dw = img.width * ratio
      const dh = img.height * ratio
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    },
    [],
  )

  const wrapText = useCallback(
    (ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] => {
      const words = text.split(/\s+/)
      const lines: string[] = []
      let current = ""
      for (const w of words) {
        const test = current ? `${current} ${w}` : w
        if (ctx.measureText(test).width > maxWidth && current) {
          lines.push(current)
          current = w
          if (lines.length === maxLines) break
        } else {
          current = test
        }
      }
      if (lines.length < maxLines && current) lines.push(current)
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1]
        if (ctx.measureText(last).width > maxWidth - 10) lines[maxLines - 1] = last.slice(0, -1) + "…"
      }
      return lines
    },
    [],
  )

  /** Dessine la carte complète sur le canvas 1080×1920 */
  const renderCard = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    setRendering(true)

    try {
      const [bgImg, qrImg] = await Promise.all([
        new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = reject
          i.src = DESIGNS.find((d) => d.id === design)?.url ?? DESIGNS[0].url
        }),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image()
          i.onload = () => resolve(i)
          i.onerror = reject
          i.src = ""
          QRCode.toDataURL(storeLink, {
            margin: 1,
            width: 560,
            errorCorrectionLevel: "M",
            color: { dark: "#065f46", light: "#ffffff" },
          }).then((url) => {
            i.src = url
          })
        }),
      ])

      // 1. Fond (cover) + voiles pour la lisibilité
      ctx.clearRect(0, 0, W, H)
      drawImageCover(ctx, bgImg)
      const veil = ctx.createLinearGradient(0, 0, 0, H)
      veil.addColorStop(0, "rgba(6, 26, 20, 0.72)")
      veil.addColorStop(0.38, "rgba(6, 26, 20, 0.28)")
      veil.addColorStop(0.62, "rgba(6, 26, 20, 0.55)")
      veil.addColorStop(1, "rgba(4, 18, 14, 0.92)")
      ctx.fillStyle = veil
      ctx.fillRect(0, 0, W, H)

      // 2. Badge haut "Propulsé par KinShop"
      ctx.textAlign = "center"
      ctx.fillStyle = "rgba(255,255,255,0.16)"
      roundRect(ctx, W / 2 - 260, 84, 520, 80, 40)
      ctx.fill()
      ctx.fillStyle = "#fbbf24"
      ctx.font = "700 34px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText("🛍️ Propulsé par KinShop", W / 2, 138)

      // 3. Pastille emoji boutique
      const badgeY = 370
      const badgeR = 140
      const grad = ctx.createLinearGradient(W / 2 - badgeR, badgeY - badgeR, W / 2 + badgeR, badgeY + badgeR)
      grad.addColorStop(0, "rgba(255,255,255,0.98)")
      grad.addColorStop(1, "rgba(240,253,250,0.92)")
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(W / 2, badgeY, badgeR, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(251,191,36,0.9)"
      ctx.lineWidth = 8
      ctx.stroke()
      ctx.font = "140px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText(store.logoEmoji || "🛍️", W / 2, badgeY + 48)

      // 4. Nom de la boutique (grande typo, 2 lignes max)
      ctx.fillStyle = "#ffffff"
      ctx.font = "800 92px system-ui, -apple-system, 'Segoe UI', sans-serif"
      const nameLines = wrapText(ctx, store.name, W - 180, 2)
      const NAME_START = 630
      const NAME_STEP = 108
      let nameY = NAME_START + (2 - nameLines.length) * (NAME_STEP / 2)
      for (const line of nameLines) {
        ctx.fillText(line, W / 2, nameY)
        nameY += NAME_STEP
      }

      // 5. Slogan
      ctx.fillStyle = "rgba(255,255,255,0.88)"
      ctx.font = "500 40px system-ui, -apple-system, 'Segoe UI', sans-serif"
      const slogLines = wrapText(ctx, slogan, W - 260, 2)
      let slogY = nameY + 25
      for (const line of slogLines) {
        ctx.fillText(line, W / 2, slogY)
        slogY += 54
      }

      // 6. Pastille WhatsApp
      const pillY = slogY + 26
      ctx.fillStyle = "rgba(16,185,129,0.95)"
      roundRect(ctx, W / 2 - 330, pillY, 660, 86, 43)
      ctx.fill()
      ctx.fillStyle = "#ffffff"
      ctx.font = "700 36px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText("✅ Commandes via WhatsApp", W / 2, pillY + 55)

      // 7. Carte QR code (compacte, toujours au-dessus du footer)
      const qrCardY = pillY + 86 + 110
      const cardW = 460
      const cardH = 500
      ctx.fillStyle = "#ffffff"
      roundRect(ctx, W / 2 - cardW / 2, qrCardY, cardW, cardH, 44)
      ctx.shadowColor = "rgba(0,0,0,0.35)"
      ctx.shadowBlur = 40
      ctx.shadowOffsetY = 12
      ctx.fill()
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      const qrSize = 340
      ctx.drawImage(qrImg, W / 2 - qrSize / 2, qrCardY + 40, qrSize, qrSize)

      const scanY = qrCardY + 40 + qrSize + 62
      ctx.fillStyle = "#064e3b"
      ctx.font = "700 38px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText("Scanne pour commander 🛒", W / 2, scanY)

      ctx.fillStyle = "rgba(6,78,59,0.65)"
      ctx.font = "500 28px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText(`kinshop.cd/${store.slug}`, W / 2, scanY + 46)

      // 8. Pied de page (positions fixes, sous la carte QR : carte bas = qrCardY + 500 ≤ 1749)
      ctx.fillStyle = "rgba(255,255,255,0.55)"
      ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText("Prix en Francs Congolais & USD — M-Pesa, Airtel, Orange Money", W / 2, 1778)
      ctx.fillStyle = "#fbbf24"
      ctx.font = "700 32px system-ui, -apple-system, 'Segoe UI', sans-serif"
      ctx.fillText("Crée ta boutique gratuitement sur KinShop", W / 2, 1840)
    } finally {
      setRendering(false)
    }
  }, [design, store.logoEmoji, store.name, store.slug, slogan, storeLink, drawImageCover, roundRect, wrapText])

  // Rendu initial + re-rendu
  useEffect(() => {
    if (bgReady && qrReady) {
      void renderCard()
    }
  }, [bgReady, qrReady, renderCard])

  const download = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (rendering) return
    canvas.toBlob(
      (blob) => {
        if (!blob) return toast.error("Génération de l'image impossible.")
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `statut-${store.slug}.png`
        a.click()
        URL.revokeObjectURL(url)
        toast.success("Image téléchargée ! Poste-la dans ton statut 📲")
      },
      "image/png",
      0.95,
    )
  }

  const share = async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95))
      if (!blob) throw new Error()
      const file = new File([blob], `statut-${store.slug}.png`, { type: "image/png" })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: store.name,
          text: `🛍️ ${store.name} — Commande directement ici : ${storeLink}`,
        })
      } else {
        // Fallback desktop : téléchargement
        await download()
      }
    } catch {
      toast.error("Partage annulé ou non supporté.")
    }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      {/* Aperçu canvas */}
      <Card className="overflow-hidden">
        <CardContent className="p-4 md:p-6 flex justify-center bg-muted/40">
          <div className="relative w-full max-w-[360px] aspect-[9/16] rounded-2xl overflow-hidden shadow-xl border bg-background">
            <canvas ref={canvasRef} width={W} height={H} className="w-full h-full" />
            {(rendering || !bgReady || !qrReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Génération de l&apos;image…</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Contrôles */}
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Choisis ton design
            </p>
            <div className="grid grid-cols-3 gap-2">
              {DESIGNS.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDesign(d.id)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all aspect-[9/16] ${
                    design === d.id ? "border-primary ring-2 ring-primary/30 scale-[1.02]" : "border-transparent opacity-75 hover:opacity-100"
                  }`}
                  aria-label={`Design ${d.label}`}
                >
                  <img src={d.url} alt={`Fond ${d.label}`} loading="lazy" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[10px] py-1 text-center">
                    {d.label}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Ton image statut contient le <strong>QR code de ta boutique</strong> 📲 Poste-la dans ton
                statut WhatsApp 2×/semaine : chaque scan amène un client — et chaque client découvre
                KinShop. C&apos;est comme ça qu&apos;on grandit ensemble. 🚀
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={download} disabled={rendering || !bgReady || !qrReady} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Télécharger l&apos;image (PNG)
                </Button>
                <Button onClick={share} variant="outline" disabled={rendering || !bgReady || !qrReady} className="w-full">
                  <Share2 className="w-4 h-4 mr-2" />
                  Partager directement
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
