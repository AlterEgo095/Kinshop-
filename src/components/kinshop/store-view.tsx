"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatFC,
  formatPhoneDisplay,
  formatUSD,
  usdToFC,
  type PaymentMethod,
  type ProductData,
  type StoreData,
} from "@/lib/kinshop"

interface StoreViewProps {
  slug: string
  onBack: () => void
}

interface CartLine {
  product: ProductData
  qty: number
}

// V2 — Flux de paiement mobile money en ligne (push USSD agrégateur)
interface PaymentFlow {
  ref: string
  totalFC: number
  totalUSD: number
  whatsappUrl: string
  operatorLabel: string
  status: "idle" | "initiating" | "waiting" | "paid" | "failed"
  mode: "live" | "simulation" | null
  errorMsg?: string
}

const PAYMENTS: { id: PaymentMethod; label: string; sub: string; emoji: string }[] = [
  { id: "mpesa", label: "M-Pesa", sub: "Vodacom", emoji: "🔴" },
  { id: "airtel", label: "Airtel Money", sub: "Airtel", emoji: "🔴" },
  { id: "orange", label: "Orange Money", sub: "Orange", emoji: "🟠" },
  { id: "cash", label: "Espèces", sub: "À la livraison", emoji: "💵" },
]

const ZONES_KIN = [
  "Gombe", "Lingwala", "Kalamu", "Limete", "Ngaliema", "Bandalungwa",
  "Kintambo", "Masina", "Matete", "N'djili", "Kimbanseke", "Lemba",
  "Selembao", "Ngaba", "Makala", "Kasa-Vubu", "Barumbu", "Kinshasa",
]

export function StoreView({ slug, onBack }: StoreViewProps) {
  const [store, setStore] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [platform, setPlatform] = useState<{ maintenance: boolean; announcement: string }>({
    maintenance: false,
    announcement: "",
  })

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("Tout")

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ ref: string; totalFC: number; totalUSD: number; whatsappUrl: string } | null>(null)

  // V2 — Paiement mobile money de la commande
  const [payment, setPayment] = useState<PaymentFlow | null>(null)
  const [payerPhone, setPayerPhone] = useState("")

  // Formulaire de commande
  const [cName, setCName] = useState("")
  const [cPhone, setCPhone] = useState("")
  const [cZone, setCZone] = useState("")
  const [cPayment, setCPayment] = useState<PaymentMethod>("mpesa")
  const [cNote, setCNote] = useState("")

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [resStore, resPlatform] = await Promise.all([
          fetch(`/api/stores?slug=${encodeURIComponent(slug)}`),
          fetch("/api/platform"),
        ])
        const [data, dataPlatform] = await Promise.all([resStore.json(), resPlatform.json().catch(() => null)])
        if (cancelled) return
        if (dataPlatform && typeof dataPlatform.maintenance === "boolean") {
          setPlatform({
            maintenance: dataPlatform.maintenance,
            announcement: dataPlatform.announcement || "",
          })
        }
        if (!resStore.ok) setFailed(true)
        else setStore(data.store)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug])

  // V2 — Comptabiliser la visite (1× max par session navigateur et par boutique)
  useEffect(() => {
    const key = `ks_v2_visit_${slug}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {
      // sessionStorage indisponible : on compte quand même (mode privé)
    }
    fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {
      // silencieux : la visite ne doit jamais casser la boutique
    })
  }, [slug])

  const categories = useMemo(() => {
    if (!store?.products) return []
    return Array.from(new Set(store.products.map((p) => p.category)))
  }, [store])

  const filtered = useMemo(() => {
    if (!store?.products) return []
    return store.products.filter((p) => {
      const matchCat = category === "Tout" || p.category === category
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [store, category, search])

  const cartCount = cart.reduce((s, l) => s + l.qty, 0)
  const totalUSD = cart.reduce((s, l) => s + l.product.priceUSD * l.qty, 0)

  const addToCart = (product: ProductData) => {
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id)
      if (existing) {
        return c.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...c, { product, qty: 1 }]
    })
    toast.success(`${product.emoji} ${product.name} ajouté au panier`, {
      action: { label: "Voir", onClick: () => setCartOpen(true) },
    })
  }

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((c) => c.filter((l) => l.product.id !== productId))
      return
    }
    setCart((c) => c.map((l) => (l.product.id === productId ? { ...l, qty: Math.min(99, qty) } : l)))
  }

  const submitOrder = async () => {
    if (!store) return
    if (!cName.trim()) return toast.error("Ton nom est requis pour commander.")
    if (cPhone.replace(/\D/g, "").length < 9) return toast.error("Ton numéro de téléphone est requis.")

    setSubmitting(true)
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          customerName: cName.trim(),
          customerPhone: cPhone,
          zone: cZone,
          paymentMethod: cPayment,
          note: cNote,
          items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la commande.")
      const done = {
        ref: data.order.ref,
        totalFC: data.order.totalFC,
        totalUSD: data.order.totalUSD,
        whatsappUrl: data.whatsappUrl,
      }
      setCart([])
      setCartOpen(false)
      if (cPayment !== "cash") {
        // V2 — Passer à l'écran de paiement mobile money (push USSD)
        setPayerPhone(cPhone)
        setPayment({
          ...done,
          operatorLabel: PAYMENTS.find((p) => p.id === cPayment)?.label || "mobile money",
          status: "idle",
          mode: null,
        })
      } else {
        setSuccess(done)
        toast.success(`Commande ${data.order.ref} envoyée ! ✅`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setSubmitting(false)
    }
  }

  /* ─────────── V2 — Paiement mobile money ─────────── */

  const startPayment = async () => {
    if (!payment) return
    setPayment({ ...payment, status: "initiating", errorMsg: undefined })
    try {
      const res = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: payment.ref, payerPhone: payerPhone || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Impossible de lancer le paiement.")
      if (data.alreadyPaid || data.paymentStatus === "paid") {
        setPayment({ ...payment, status: "paid" })
        return
      }
      setPayment({ ...payment, status: "waiting", mode: data.mode })
    } catch (e) {
      setPayment({
        ...payment,
        status: "failed",
        errorMsg: e instanceof Error ? e.message : "Erreur inconnue",
      })
    }
  }

  const confirmSimPayment = async () => {
    if (!payment) return
    try {
      const res = await fetch("/api/payments/simulate-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: payment.ref }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la confirmation.")
      setPayment((p) => (p ? { ...p, status: "paid" } : p))
      toast.success(`Paiement confirmé — ${payment.ref} ✅`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }

  // Polling du statut pendant l'attente du push USSD (toutes les 4 s)
  const payStatus = payment?.status
  const payRef = payment?.ref
  useEffect(() => {
    if (payStatus !== "waiting" || !payRef) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/payments/status?ref=${encodeURIComponent(payRef)}`)
        const data = await res.json()
        if (cancelled || !res.ok) return
        if (data.paymentStatus === "paid") {
          setPayment((p) => (p ? { ...p, status: "paid" } : p))
          toast.success(`Paiement confirmé — ${payRef} ✅`)
        } else if (data.paymentStatus === "failed") {
          setPayment((p) =>
            p ? { ...p, status: "failed", errorMsg: "Le paiement a été refusé ou a expiré. Tu peux réessayer." } : p,
          )
        }
      } catch {
        // silencieux : on retentera au prochain tick
      }
    }
    const iv = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
  }, [payStatus, payRef])

  /* ─────────── Rendu ─────────── */

  if (loading) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto px-4 py-10">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="w-20 h-20 rounded-3xl" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (failed || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-6xl">🤷</p>
          <h1 className="text-2xl font-bold">Boutique introuvable</h1>
          <p className="text-muted-foreground">Vérifie le lien, ou retourne à l&apos;accueil pour créer ta propre boutique.</p>
          <Button onClick={onBack}>Aller sur KinShop</Button>
        </div>
      </div>
    )
  }

  // Boutique suspendue par l'administration de la plateforme
  if (store.status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-6xl">⛔</p>
          <h1 className="text-2xl font-bold">Boutique indisponible</h1>
          <p className="text-muted-foreground">
            Cette boutique a été temporairement désactivée par l&apos;équipe KinShop. Si tu es le propriétaire,
            contacte le support pour la réactiver.
          </p>
          <Button onClick={onBack}>Aller sur KinShop</Button>
        </div>
      </div>
    )
  }

  // Mode maintenance global de la plateforme
  if (platform.maintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4 max-w-md">
          <p className="text-6xl">🛠️</p>
          <h1 className="text-2xl font-bold">KinShop en maintenance</h1>
          <p className="text-muted-foreground">
            La plateforme est momentanément en maintenance. Reviens dans quelques minutes — toutes les
            boutiques seront de retour très vite&nbsp;!
          </p>
          <Button onClick={onBack}>Retour à l&apos;accueil</Button>
        </div>
      </div>
    )
  }

  const rate = store.rateFC

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/50 to-background pb-24">
      {/* Bandeau d'annonce globale (console admin) */}
      {platform.announcement && (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-sm px-4 py-2.5 text-center font-medium">
          📣 {platform.announcement}
        </div>
      )}

      {/* Barre supérieure */}
      <header className="border-b bg-background/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            KinShop
          </Button>
          <Badge variant="outline" className="text-xs">
            🇨🇩 {store.city}
          </Badge>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4">
        {/* En-tête boutique */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="py-8 flex flex-col sm:flex-row items-start sm:items-center gap-5"
        >
          <div className="w-20 h-20 rounded-3xl bg-white border-2 shadow-md flex items-center justify-center text-5xl shrink-0">
            {store.logoEmoji}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-extrabold tracking-tight">{store.name}</h1>
            {store.description && <p className="text-muted-foreground mt-1">{store.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" /> {store.city}
              </Badge>
              <Badge variant="secondary">Par {store.ownerName}</Badge>
              <Badge variant="outline" className="bg-white">Commandes via WhatsApp ✅</Badge>
            </div>
          </div>
        </motion.section>

        {/* Recherche + catégories */}
        <section className="space-y-3 mb-6">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Chercher un produit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 rounded-xl"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {["Tout", ...categories].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-all ${
                  category === c
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white border-border hover:border-primary/50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>

        {/* Catalogue */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center space-y-2">
              <p className="text-5xl">🔍</p>
              <p className="font-semibold">Aucun produit trouvé</p>
              <p className="text-sm text-muted-foreground">Essaie une autre recherche ou une autre catégorie.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {filtered.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
              >
                <Card className="h-full flex flex-col overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <CardContent className="p-3 md:p-4 flex flex-col flex-1">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.name} className="w-full h-32 md:h-36 object-cover rounded-xl mb-3" />
                    ) : (
                      <div className="w-full h-32 md:h-36 rounded-xl bg-emerald-50 flex items-center justify-center text-5xl md:text-6xl mb-3 group-hover:scale-105 transition-transform">
                        {p.emoji}
                      </div>
                    )}
                    <Badge variant="outline" className="text-[10px] w-fit mb-2 px-2 py-0">
                      {p.category}
                    </Badge>
                    <p className="font-semibold text-sm leading-snug mb-1 line-clamp-2">{p.name}</p>
                    <div className="mt-auto">
                      <p className="font-extrabold text-primary text-lg leading-tight">
                        {formatFC(p.priceUSD * rate)}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{formatUSD(p.priceUSD)}</span>
                        <Button size="sm" className="h-8 px-3" onClick={() => addToCart(p)} aria-label={`Ajouter ${p.name} au panier`}>
                          <Plus className="w-4 h-4 mr-0.5" />
                          Ajouter
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Info vendeur */}
        <section className="mt-10 mb-6">
          <Card className="bg-white/70">
            <CardContent className="p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="text-3xl">🤝</div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-semibold text-sm">Commande simple et sûre</p>
                <p className="text-xs text-muted-foreground">
                  1. Ajoute au panier → 2. Donne ton nom et ta zone → 3. Envoie sur WhatsApp.
                  Tu paies par M-Pesa, Airtel Money, Orange Money ou à la livraison.
                </p>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      {/* Barre panier collante */}
      {cartCount > 0 && !success && !payment && (
        <motion.div
          initial={{ y: 80 }}
          animate={{ y: 0 }}
          className="fixed bottom-0 inset-x-0 z-40 p-3 bg-gradient-to-t from-background via-background to-transparent"
        >
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full bg-primary text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-primary/30 hover:bg-primary/95 transition-colors"
              aria-label="Ouvrir le panier"
            >
              <span className="flex items-center gap-3 font-semibold">
                <span className="relative">
                  <ShoppingCart className="w-5 h-5" />
                  <span className="absolute -top-2 -right-2 bg-amber-400 text-amber-950 text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {cartCount}
                  </span>
                </span>
                {formatFC(totalUSD * rate)}
              </span>
              <span className="font-bold flex items-center">
                Voir le panier
                <ShoppingBag className="w-4 h-4 ml-2" />
              </span>
            </button>
          </div>
        </motion.div>
      )}

      {/* Sheet panier */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl flex flex-col" aria-describedby={undefined}>
          <SheetHeader className="pb-2 border-b">
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              Ton panier
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto scrollbar-thin py-3 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-16 space-y-2">
                <p className="text-5xl">🛒</p>
                <p className="font-semibold">Panier vide</p>
                <p className="text-sm text-muted-foreground">Ajoute des produits pour commander.</p>
              </div>
            ) : (
              cart.map((line) => (
                <div key={line.product.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
                  <span className="text-3xl">{line.product.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{line.product.name}</p>
                    <p className="text-sm text-primary font-bold">{formatFC(line.product.priceUSD * rate)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(line.product.id, line.qty - 1)} aria-label="Diminuer">
                      <Minus className="w-3.5 h-3.5" />
                    </Button>
                    <span className="w-7 text-center font-bold text-sm">{line.qty}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(line.product.id, line.qty + 1)} aria-label="Augmenter">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setQty(line.product.id, 0)} aria-label="Retirer">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {cart.length > 0 && (
            <SheetFooter className="border-t pt-4">
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between text-lg font-extrabold">
                  <span>Total</span>
                  <span className="text-primary">
                    {formatFC(totalUSD * rate)}{" "}
                    <span className="text-sm font-medium text-muted-foreground">({formatUSD(totalUSD)})</span>
                  </span>
                </div>
                <Button
                  size="lg"
                  className="w-full text-base"
                  onClick={() => {
                    setCartOpen(false)
                    setCheckoutOpen(true)
                  }}
                >
                  Commander maintenant
                  <ShoppingBag className="w-5 h-5 ml-2" />
                </Button>
              </div>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog commande / paiement / succès */}
      <Dialog
        open={checkoutOpen || !!success || !!payment}
        onOpenChange={(open) => {
          if (!open) {
            setCheckoutOpen(false)
            setSuccess(null)
            setPayment(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin">
          {payment ? (
            /* ── PAIEMENT MOBILE MONEY (V2) ── */
            payment.status === "idle" || payment.status === "initiating" ? (
              <div className="space-y-4 py-1">
                <DialogHeader className="space-y-1.5">
                  <DialogTitle className="text-xl font-bold text-center flex items-center justify-center gap-2">
                    <Smartphone className="w-5 h-5 text-primary" />
                    Payer par {payment.operatorLabel}
                  </DialogTitle>
                  <DialogDescription className="text-center">
                    Commande <strong className="font-mono text-foreground">{payment.ref}</strong>
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <p className="text-xs font-medium text-muted-foreground">Montant à payer</p>
                  <p className="text-3xl font-extrabold text-primary">{formatFC(payment.totalFC)}</p>
                  <p className="text-sm text-muted-foreground">({formatUSD(payment.totalUSD)})</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="payerPhone">Numéro à débiter *</Label>
                  <Input
                    id="payerPhone"
                    type="tel"
                    placeholder="081 234 5678"
                    value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    maxLength={20}
                  />
                  <p className="text-xs text-muted-foreground">
                    Le numéro mobile money qui recevra le push de paiement et validera avec son code PIN.
                  </p>
                </div>

                {payment.errorMsg && (
                  <p className="text-sm text-destructive flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {payment.errorMsg}
                  </p>
                )}

                <Button size="lg" className="w-full text-base" onClick={startPayment} disabled={payment.status === "initiating"}>
                  {payment.status === "initiating" ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Envoi du push…
                    </>
                  ) : (
                    <>
                      <Smartphone className="w-5 h-5 mr-2" />
                      Payer {formatFC(payment.totalFC)}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSuccess(payment)
                    setPayment(null)
                  }}
                >
                  Payer plus tard via WhatsApp
                </Button>
              </div>
            ) : payment.status === "waiting" ? (
              <div className="space-y-5 py-2 text-center">
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                  className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center"
                >
                  <Smartphone className="w-10 h-10 text-amber-600" />
                </motion.div>
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-xl font-bold text-center">Push envoyé 📲</DialogTitle>
                  <DialogDescription className="text-center">
                    Un push a été envoyé au <strong className="text-foreground">{formatPhoneDisplay(payerPhone)}</strong>
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-2xl border bg-muted/50 p-4 text-left text-sm space-y-1.5">
                  <p className="font-semibold">Sur ton téléphone :</p>
                  <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
                    <li>Déverrouille ton écran</li>
                    <li>
                      Valide <strong className="text-foreground">{formatFC(payment.totalFC)}</strong> avec ton code PIN{" "}
                      {payment.operatorLabel}
                    </li>
                  </ol>
                </div>

                <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  En attente de confirmation…
                </p>

                {payment.mode === "simulation" && (
                  <Button
                    size="lg"
                    className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
                    onClick={confirmSimPayment}
                  >
                    ✅ J&apos;ai validé le PIN (démo)
                  </Button>
                )}

                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSuccess(payment)
                    setPayment(null)
                  }}
                >
                  Payer plus tard via WhatsApp
                </Button>
              </div>
            ) : payment.status === "failed" ? (
              <div className="space-y-4 py-2 text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-xl font-bold text-center">Paiement non abouti</DialogTitle>
                  <DialogDescription className="text-center">
                    {payment.errorMsg || "Le paiement n'a pas pu être confirmé."}
                  </DialogDescription>
                </DialogHeader>
                <Button size="lg" className="w-full" onClick={startPayment}>
                  <Smartphone className="w-5 h-5 mr-2" />
                  Réessayer le paiement
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setPayment({ ...payment, status: "idle" })}>
                  Modifier le numéro
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSuccess(payment)
                    setPayment(null)
                  }}
                >
                  Continuer via WhatsApp
                </Button>
              </div>
            ) : (
              /* ── PAYÉ ✅ ── */
              <div className="text-center space-y-4 py-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 15 }}
                  className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </motion.div>
                <DialogHeader className="space-y-1.5">
                  <DialogTitle className="text-2xl font-bold text-center">Paiement confirmé ! 🎉</DialogTitle>
                  <DialogDescription className="text-center">
                    Réf : <strong className="text-foreground font-mono">{payment.ref}</strong> —{" "}
                    {formatFC(payment.totalFC)} payés
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-left space-y-1">
                  <p className="font-semibold">✅ Commande payée en ligne</p>
                  <p className="text-muted-foreground">
                    Le vendeur a reçu ta commande et va préparer la livraison. Garde ta référence sous la main.
                  </p>
                </div>
                <Button size="lg" className="w-full text-base bg-emerald-600 hover:bg-emerald-700" asChild>
                  <a href={payment.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    📲 Suivre la livraison sur WhatsApp
                  </a>
                </Button>
                <Button variant="outline" className="w-full" onClick={() => { setPayment(null); setCheckoutOpen(false) }}>
                  Retour à la boutique
                </Button>
              </div>
            )
          ) : success ? (
            /* ── SUCCÈS ── */
            <div className="text-center space-y-4 py-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 15 }}
                className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center"
              >
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </motion.div>
              <DialogHeader className="space-y-1.5">
                <DialogTitle className="text-2xl font-bold text-center">Commande envoyée ! 🎉</DialogTitle>
                <DialogDescription className="text-center text-muted-foreground">
                  Réf : <strong className="text-foreground font-mono">{success.ref}</strong> — {formatFC(success.totalFC)} ({formatUSD(success.totalUSD)})
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-left">
                <p className="font-semibold mb-1">💳 Paiement — {PAYMENTS.find((p) => p.id === cPayment)?.label}</p>
                <p className="text-muted-foreground">
                  {cPayment === "cash"
                    ? "Tu paieras en espèces à la livraison."
                    : `Envoie ${formatFC(success.totalFC)} au numéro ${formatPhoneDisplay(store.whatsapp)} puis envoie la capture au vendeur.`}
                </p>
              </div>
              <Button size="lg" className="w-full text-base bg-emerald-600 hover:bg-emerald-700" asChild>
                <a href={success.whatsappUrl} target="_blank" rel="noopener noreferrer">
                  📲 Confirmer sur WhatsApp
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => { setSuccess(null); setCheckoutOpen(false) }}>
                Retour à la boutique
              </Button>
            </div>
          ) : (
            /* ── FORMULAIRE ── */
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Finaliser la commande</DialogTitle>
                <DialogDescription>
                  {cartCount} article(s) — {formatFC(totalUSD * rate)} ({formatUSD(totalUSD)})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cName">Ton nom *</Label>
                  <Input id="cName" placeholder="Ex : Kabongo Jean" value={cName} onChange={(e) => setCName(e.target.value)} maxLength={80} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="cPhone">Ton téléphone *</Label>
                    <Input id="cPhone" type="tel" placeholder="081 234 5678" value={cPhone} onChange={(e) => setCPhone(e.target.value)} maxLength={20} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cZone">Zone / Commune</Label>
                    <Input id="cZone" list="zones-kin" placeholder="Gombe" value={cZone} onChange={(e) => setCZone(e.target.value)} maxLength={60} />
                    <datalist id="zones-kin">
                      {ZONES_KIN.map((z) => <option key={z} value={z} />)}
                    </datalist>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Mode de paiement</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENTS.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setCPayment(pm.id)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          cPayment === pm.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                      >
                        <p className="font-semibold text-sm">{pm.emoji} {pm.label}</p>
                        <p className="text-xs text-muted-foreground">{pm.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cNote">Note (optionnel)</Label>
                  <Textarea
                    id="cNote"
                    placeholder="Ex : livrer après 17h, taille M si disponible…"
                    value={cNote}
                    onChange={(e) => setCNote(e.target.value)}
                    rows={2}
                    maxLength={300}
                  />
                </div>
              </div>

              <Button size="lg" className="w-full text-base" onClick={submitOrder} disabled={submitting || cartCount === 0}>
                {submitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    Envoyer la commande
                    <ShoppingBag className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Ta commande sera enregistrée et envoyée au vendeur sur WhatsApp ({formatPhoneDisplay(store.whatsapp)}).
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
