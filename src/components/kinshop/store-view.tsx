"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Images,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  ShieldCheck,
  Smartphone,
  Star,
  Store,
  TicketPercent,
  Trash2,
  Truck,
  ImagePlus,
} from "lucide-react"
import { toast } from "sonner"
import { compressImageFile, dataUrlSize } from "@/lib/images"
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
  DEFAULT_RATE_FC,
  computeCouponDiscount,
  computeOrderTotals,
  descriptionPlainText,
  formatFC,
  formatPhoneDisplay,
  formatUSD,
  timeAgo,
  usdToFC,
  type CouponType,
  type DeliveryZoneData,
  type PaymentMethod,
  type ProductData,
  type ReviewData,
  type ReviewStats,
  type StoreData,
} from "@/lib/kinshop"
import { type PublicConfig, configBool } from "@/lib/config-defaults"
import { DELIVERY_KIND_LABELS, type DeliveryKind } from "@/lib/order-workflow"
import { ProductDescription } from "@/components/kinshop/product-description"

interface StoreViewProps {
  slug: string
  onBack: () => void
  /** Taux FC/$ plateforme (polling root) — un changement déclenche un rechargement silencieux */
  platformRate?: number
  /** V9 — Configuration dynamique (paiements actifs, feature flags) */
  config?: PublicConfig
  /** V10 — Compte client connecté (la commande exige un compte : feature.orderAccounts) */
  authUser?: { id: string; name: string; email: string; whatsapp: string } | null
  /** V10 — appelé après authentification inline (le parent relit la session) */
  onAuthed?: () => void
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
  status: "idle" | "initiating" | "waiting" | "declared" | "paid" | "failed"
  mode: "live" | "simulation" | null
  errorMsg?: string
  // P1 (Phase C) — snapshot immuable des coordonnées directes du vendeur
  // (figées à la création de la commande, renvoyées par POST /api/orders)
  direct?: { provider: string; accountName: string; accountNumber: string; network: string; instructions: string } | null
}

const PAYMENTS: { id: PaymentMethod; label: string; sub: string; emoji: string }[] = [
  { id: "mpesa", label: "M-Pesa (Vodacom)", sub: "Mobile money", emoji: "🔴" },
  { id: "airtel", label: "Airtel Money", sub: "Mobile money", emoji: "🔴" },
  { id: "orange", label: "Orange Money", sub: "Mobile money", emoji: "🟠" },
  { id: "cash", label: "Espèces à la livraison", sub: "À la livraison", emoji: "💵" },
]

const ZONES_KIN = [
  "Gombe", "Lingwala", "Kalamu", "Limete", "Ngaliema", "Bandalungwa",
  "Kintambo", "Masina", "Matete", "N'djili", "Kimbanseke", "Lemba",
  "Selembao", "Ngaba", "Makala", "Kasa-Vubu", "Barumbu", "Kinshasa",
]

/* ─────────── V6 — Avis clients (composants locaux) ─────────── */

function Stars({ n, size = "w-3.5 h-3.5" }: { n: number; size?: string }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${n} étoile${n > 1 ? "s" : ""} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${size} ${i <= n ? "fill-amber-400 text-amber-400" : "fill-muted text-muted-foreground/30"}`}
        />
      ))}
    </span>
  )
}

function ReviewItem({ review }: { review: ReviewData }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
            {review.authorName}
            {review.orderId && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                <BadgeCheck className="w-3 h-3" />
                Commande vérifiée
              </span>
            )}
          </p>
        </div>
        <Stars n={review.rating} />
      </div>
      {review.comment && <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-line">{review.comment}</p>}
      <p className="text-[11px] text-muted-foreground/70 mt-1.5">{timeAgo(review.createdAt)}</p>
    </div>
  )
}

export function StoreView({ slug, onBack, platformRate, config = {}, authUser = null, onAuthed }: StoreViewProps) {
  const [store, setStore] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [platform, setPlatform] = useState<{ maintenance: boolean; announcement: string }>({
    maintenance: false,
    announcement: "",
  })

  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("Tout")
  // P2 — catégorie structurée sélectionnée (id StoreCategory) ; null = « Tout »
  // ou filtre legacy. Si la boutique définit des catégories structurées, CE
  // filtre prime sur l'ancien champ texte libre Product.category.
  const [storeCatId, setStoreCatId] = useState<string | null>(null)

  const [cart, setCart] = useState<CartLine[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<{ ref: string; totalFC: number; totalUSD: number; whatsappUrl: string } | null>(null)

  // V2 — Paiement mobile money de la commande
  const [payment, setPayment] = useState<PaymentFlow | null>(null)
  const [payerPhone, setPayerPhone] = useState("")
  // P1 (Phase C) — formulaire de déclaration « J'ai effectué le paiement »
  const [declareOpen, setDeclareOpen] = useState(false)
  const [declareRef, setDeclareRef] = useState("")
  const [declareNote, setDeclareNote] = useState("")
  const [declareBusy, setDeclareBusy] = useState(false)
  // Phase D — capture du transfert jointe à la déclaration (optionnel)
  const [declareProof, setDeclareProof] = useState("")
  const [declareProofBusy, setDeclareProofBusy] = useState(false)

  // Formulaire de commande
  const [cName, setCName] = useState("")
  const [cPhone, setCPhone] = useState("")
  const [cZone, setCZone] = useState("")
  const [cPayment, setCPayment] = useState<PaymentMethod>("mpesa")
  const [cNote, setCNote] = useState("")
  // V10 — Adresse de livraison libre (complète la zone)
  const [cAddress, setCAddress] = useState("")

  // V4 — Fiche produit avec galerie multi-photos
  const [detail, setDetail] = useState<ProductData | null>(null)
  const [detailIdx, setDetailIdx] = useState(0)

  // V6 — Zones de livraison, code promo & avis clients
  const [zones, setZones] = useState<DeliveryZoneData[]>([])
  const [cZoneId, setCZoneId] = useState("")
  const [couponInput, setCouponInput] = useState("")
  const [coupon, setCoupon] = useState<{
    code: string
    type: CouponType
    value: number
    minTotalUSD: number
    label: string
  } | null>(null)
  const [couponChecking, setCouponChecking] = useState(false)
  const [reviews, setReviews] = useState<ReviewData[]>([])
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [allReviewsOpen, setAllReviewsOpen] = useState(false)
  const [rName, setRName] = useState("")
  const [rRating, setRRating] = useState(0)
  const [rComment, setRComment] = useState("")
  const [rRef, setRRef] = useState("")
  const [rSubmitting, setRSubmitting] = useState(false)

  // V10 — Commande = compte client obligatoire (feature.orderAccounts) :
  // mini-formulaire d'authentification intégré au checkout (le panier est préservé)
  const requireAccounts = configBool(config, "feature.orderAccounts")
  const needsAuth = requireAccounts && !authUser
  const [authMode, setAuthMode] = useState<"login" | "register">("register")
  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [authName, setAuthName] = useState("")
  const [authPhone, setAuthPhone] = useState("")
  const [authBusy, setAuthBusy] = useState(false)

  // Préremplissage depuis le compte client (confirmer identité et coordonnées)
  useEffect(() => {
    if (authUser) {
      setCName((v) => v || authUser.name)
      setCPhone((v) => v || authUser.whatsapp || "")
    }
  }, [authUser])

  const handleInlineAuth = async () => {
    setAuthBusy(true)
    try {
      const endpoint = authMode === "register" ? "/api/auth/register" : "/api/auth/login"
      const body =
        authMode === "register"
          ? { email: authEmail, password: authPassword, name: authName, whatsapp: authPhone }
          : { email: authEmail, password: authPassword }
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Authentification impossible.")
      toast.success(authMode === "register" ? "Compte créé — commande débloquée 🎉" : "Connecté 🎉")
      // Session posée (cookie) : le parent relit l'identité → le formulaire reprend
      // avec le panier préservé (aucun rechargement de page)
      onAuthed?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setAuthBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [resStore, resPlatform, resZones, resReviews] = await Promise.all([
          fetch(`/api/stores?slug=${encodeURIComponent(slug)}`),
          fetch("/api/platform", { cache: "no-store" }),
          fetch(`/api/delivery-zones?slug=${encodeURIComponent(slug)}`).catch(() => null),
          fetch(`/api/reviews?slug=${encodeURIComponent(slug)}`).catch(() => null),
        ])
        const [data, dataPlatform, dataZones, dataReviews] = await Promise.all([
          resStore.json(),
          resPlatform.json().catch(() => null),
          resZones ? resZones.json().catch(() => null) : Promise.resolve(null),
          resReviews ? resReviews.json().catch(() => null) : Promise.resolve(null),
        ])
        if (cancelled) return
        if (dataPlatform && typeof dataPlatform.maintenance === "boolean") {
          setPlatform({
            maintenance: dataPlatform.maintenance,
            announcement: dataPlatform.announcement || "",
          })
        }
        if (dataZones && Array.isArray(dataZones.zones)) setZones(dataZones.zones)
        if (dataReviews && Array.isArray(dataReviews.reviews)) {
          setReviews(dataReviews.reviews)
          setReviewStats(dataReviews.stats || null)
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

  // Synchronisation temps réel du taux FC/$ : quand le taux plateforme change
  // (modification console admin → cascade serveur), on recharge la boutique
  // silencieusement pour que tous les prix affichés suivent immédiatement.
  const lastRateRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!platformRate || platformRate <= 0) return
    if (lastRateRef.current === undefined) {
      lastRateRef.current = platformRate
      return
    }
    if (lastRateRef.current === platformRate) return
    lastRateRef.current = platformRate
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/stores?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
        const data = await res.json()
        if (!cancelled && res.ok && data.store) setStore(data.store)
      } catch {
        // silencieux : le polling suivant réessaiera
      }
    })()
    return () => {
      cancelled = true
    }
  }, [platformRate, slug])

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

  // P2 — catégories structurées (gérées par le propriétaire) + id réellement
  // actif (auto-réparant : une catégorie supprimée en cours de session retombe
  // sur « Tout » sans effet de bord).
  const storeCats = store?.storeCategories ?? []
  const effectiveStoreCatId =
    storeCatId && storeCats.some((c) => c.id === storeCatId) ? storeCatId : null

  // P2 — effectif par catégorie structurée (compteur des puces vitrine)
  const storeCatCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of store?.products ?? []) {
      if (p.storeCategoryId) m.set(p.storeCategoryId, (m.get(p.storeCategoryId) ?? 0) + 1)
    }
    return m
  }, [store])

  // V9 — Paiements actifs + libellés (console admin → Configuration · Paiements).
  // Le serveur revalide à la commande : ce filtre n'est qu'une adaptation d'UI.
  const payMethods = useMemo(
    () =>
      PAYMENTS.filter((pm) => config[`payment.${pm.id}.enabled`] !== false).map((pm) => {
        const label = config[`payment.${pm.id}.label`]
        return typeof label === "string" && label.trim() ? { ...pm, label: label.trim() } : pm
      }),
    [config],
  )
  const effectivePayment: PaymentMethod =
    payMethods.find((p) => p.id === cPayment)?.id ?? payMethods[0]?.id ?? "cash"
  // V9 — Feature flags (avis / coupons / zones) : masqués en UI, refusés côté serveur
  const reviewsEnabled = config["feature.reviews"] !== false
  const couponsEnabled = config["feature.coupons"] !== false
  const zonesEnabled = config["feature.deliveryZones"] !== false

  const filtered = useMemo(() => {
    if (!store?.products) return []
    return store.products.filter((p) => {
      // LOT 1 — double garde : le serveur ne sert déjà que les produits publiés
      // aux visiteurs ; on écarte aussi localement les données éventuellement
      // en cache (un produit masqué n'apparaît jamais sur la vitrine).
      if (p.published === false) return false
      // P2 — filtre structuré prioritaire dès que la boutique en définit ;
      // sans catégories structurées, on garde le filtre legacy par texte libre.
      const matchCat = effectiveStoreCatId
        ? p.storeCategoryId === effectiveStoreCatId
        : category === "Tout" || p.category === category
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
  }, [store, category, effectiveStoreCatId, search])

  const cartCount = cart.reduce((s, l) => s + l.qty, 0)
  const totalUSD = cart.reduce((s, l) => s + l.product.priceUSD * l.qty, 0)

  // V6 — Prévisualisation des totaux (sous-total − remise + livraison). Le serveur fait foi.
  const activeZones = useMemo(() => (zonesEnabled ? zones.filter((z) => z.active) : []), [zones, zonesEnabled])
  const selectedZone = activeZones.find((z) => z.id === cZoneId) || null
  // LOT 2 — retrait différencié : la zone choisie de type « pickup » transforme
  // le checkout en retrait en boutique (pas d'adresse de livraison requise).
  const pickupSelected = selectedZone?.kind === "pickup"
  const discountUSD = coupon ? computeCouponDiscount(coupon, totalUSD) : 0
  const previewTotals = computeOrderTotals({
    subtotalUSD: totalUSD,
    discountUSD,
    deliveryFeeFC: selectedZone?.feeFC || 0,
    rate: store?.rateFC || DEFAULT_RATE_FC,
  })

  const addToCart = (product: ProductData) => {
    // LOT 1 — pas d'ajout d'un produit en rupture ; le panier ne dépasse
    // jamais le stock réel (le serveur reste l'autorité en cas de course).
    if (product.stock <= 0) {
      toast.error(`${product.emoji} ${product.name} est en rupture de stock.`)
      return
    }
    setCart((c) => {
      const existing = c.find((l) => l.product.id === product.id)
      if (existing) {
        if (existing.qty + 1 > product.stock) {
          toast.error(`Stock maximum atteint pour ${product.name} (${product.stock} disponible(s)).`)
          return c
        }
        return c.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l))
      }
      return [...c, { product, qty: 1 }]
    })
    toast.success(`${product.emoji} ${product.name} ajouté au panier`, {
      action: { label: "Voir", onClick: () => setCartOpen(true) },
    })
  }

  // V4 — Ouvre la fiche produit (galerie)
  const openDetail = (p: ProductData) => {
    setDetail(p)
    setDetailIdx(0)
  }

  const detailGallery = detail && Array.isArray(detail.images) ? detail.images : []
  const detailImage = detail ? detailGallery[detailIdx] || detail.imageUrl || "" : ""

  const setQty = (productId: string, qty: number) => {
    if (qty <= 0) {
      setCart((c) => c.filter((l) => l.product.id !== productId))
      return
    }
    // LOT 1 — la quantité ne dépasse jamais le stock du produit
    setCart((c) => c.map((l) => (l.product.id === productId ? { ...l, qty: Math.min(99, l.product.stock, qty) } : l)))
  }

  /* ─────────── V6 — Code promo & avis ─────────── */

  const applyCoupon = async () => {
    if (!store || !couponInput.trim()) return
    setCouponChecking(true)
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: store.slug, code: couponInput, subtotalUSD: totalUSD }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || "Code invalide.")
      setCoupon(data.coupon)
      setCouponInput("")
      toast.success(`Code ${data.coupon.code} appliqué ! 🏷️`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Code invalide")
    } finally {
      setCouponChecking(false)
    }
  }

  const refreshReviews = async (storeSlug: string) => {
    try {
      const res = await fetch(`/api/reviews?slug=${encodeURIComponent(storeSlug)}`)
      const data = await res.json()
      if (res.ok && Array.isArray(data.reviews)) {
        setReviews(data.reviews)
        setReviewStats(data.stats || null)
      }
    } catch {
      // silencieux
    }
  }

  const submitReview = async () => {
    if (!store) return
    if (rName.trim().length < 2) return toast.error("Ton nom est requis (2 caractères min).")
    if (rRating < 1) return toast.error("Choisis une note entre 1 et 5 étoiles.")
    setRSubmitting(true)
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          authorName: rName.trim(),
          rating: rRating,
          comment: rComment.trim(),
          ref: rRef.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi de l'avis.")
      toast.success("Merci pour ton avis ! ⭐")
      setReviewOpen(false)
      setRName("")
      setRRating(0)
      setRComment("")
      setRRef("")
      await refreshReviews(store.slug)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setRSubmitting(false)
    }
  }

  const submitOrder = async () => {
    if (!store) return
    if (!cName.trim()) return toast.error("Ton nom est requis pour commander.")
    if (cPhone.replace(/\D/g, "").length < 9) return toast.error("Ton numéro de téléphone est requis.")
    if (activeZones.length > 0 && !selectedZone) {
      return toast.error("Choisis ta zone de livraison pour continuer.")
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          customerName: cName.trim(),
          customerPhone: cPhone,
          zone: selectedZone ? selectedZone.name : cZone,
          zoneId: selectedZone?.id || "",
          couponCode: coupon && discountUSD > 0 ? coupon.code : "",
          paymentMethod: effectivePayment,
          note: cNote,
          // LOT 2 — un retrait n'a pas d'adresse de livraison (le serveur écrase aussi)
          deliveryAddress: pickupSelected ? "" : cAddress,
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
      setCoupon(null)
      if (effectivePayment !== "cash") {
        // V2 — Passer à l'écran de paiement mobile money (push USSD) +
        // P1 (Phase C) — bloc « Paiement direct au vendeur » (snapshot figé)
        setPayerPhone(cPhone)
        setPayment({
          ...done,
          operatorLabel: payMethods.find((p) => p.id === effectivePayment)?.label || "mobile money",
          status: "idle",
          mode: null,
          direct: data.directPayment ?? null,
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

  // P1 (Phase C) — DÉCLARATION du paiement direct : l'acheteur a transféré le
  // montant sur le numéro du vendeur et déclare sa référence. La déclaration
  // ne confirme JAMAIS le paiement elle-même (règle UNPAID → DECLARED → PAID) :
  // le vendeur vérifie dans son compte opérateur puis confirme l'encaissement.
  const declareDirectPayment = async () => {
    if (!payment) return
    if (declareRef.trim().length < 4) {
      return toast.error("Entre la référence de la transaction (visible dans le SMS de confirmation opérateur).")
    }
    setDeclareBusy(true)
    try {
      const res = await fetch("/api/orders/declare-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ref: payment.ref,
          reference: declareRef.trim(),
          note: declareNote.trim(),
          ...(declareProof ? { proofImage: declareProof } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la déclaration.")
      if (data.duplicate) {
        toast.info(data.message || "Paiement déjà déclaré.")
      } else {
        toast.success(
          data.proofSaved
            ? "Paiement déclaré avec la capture — le vendeur va vérifier et confirmer 🙏"
            : "Paiement déclaré — le vendeur va confirmer après vérification 🙏",
        )
      }
      setPayment({ ...payment, status: "declared" })
      setDeclareOpen(false)
      setDeclareRef("")
      setDeclareNote("")
      setDeclareProof("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setDeclareBusy(false)
    }
  }

  // Phase D — lecture locale de la capture : compression côté appareil
  // (même utilitaire que les photos produit) puis aperçu avant envoi.
  const pickDeclareProof = async (file: File | undefined) => {
    if (!file) return
    setDeclareProofBusy(true)
    try {
      const dataUrl = await compressImageFile(file, { maxSize: 1280, quality: 0.82 })
      if (dataUrlSize(dataUrl) > 8 * 1024 * 1024) {
        throw new Error("Capture trop lourde — choisis une image plus simple.")
      }
      setDeclareProof(dataUrl)
      toast.success("Capture jointe — elle sera visible du vendeur et de l'administration.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Image illisible")
    } finally {
      setDeclareProofBusy(false)
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
            <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2 flex-wrap">
              {store.name}
              {/* P5 (F5-1) — badge Vérifiée : statut réel confirmé par l'administration */}
              {store.verificationStatus === "verified" && (
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 gap-1" aria-label="Boutique vérifiée par KinShop">
                  <ShieldCheck className="w-3.5 h-3.5" /> Vérifiée
                </Badge>
              )}
            </h1>
            {store.description && <p className="text-muted-foreground mt-1">{store.description}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              <Badge variant="secondary" className="gap-1">
                <MapPin className="w-3 h-3" /> {store.city}
              </Badge>
              <Badge variant="secondary">Par {store.ownerName}</Badge>
              {reviewStats && reviewStats.count > 0 && (
                <Badge variant="outline" className="bg-white gap-1">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  {reviewStats.avg.toFixed(1)} ({reviewStats.count} avis)
                </Badge>
              )}
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
            {(storeCats.length > 0
              ? [
                  { id: null as string | null, label: "Tout", icon: "✨", count: store?.products?.length ?? 0 },
                  ...storeCats.map((c) => ({
                    id: c.id as string | null,
                    label: c.name,
                    icon: c.globalIcon || "🏷️",
                    count: storeCatCounts.get(c.id) ?? 0,
                  })),
                ]
              : ["Tout", ...categories].map((c) => ({ id: null as string | null, label: c, icon: "", count: 0 }))
            ).map((c) => {
              const structured = storeCats.length > 0
              const active = structured ? storeCatId === c.id : category === c.label
              return (
                <button
                  key={c.label}
                  onClick={() => {
                    if (structured) {
                      setStoreCatId(c.id)
                      setCategory("Tout")
                    } else {
                      setCategory(c.label)
                      setStoreCatId(null)
                    }
                  }}
                  className={`px-4 py-2 rounded-full text-sm font-medium border whitespace-nowrap transition-all ${
                    active
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-white border-border hover:border-primary/50"
                  }`}
                >
                  {c.icon ? `${c.icon} ` : ""}
                  {c.label}
                  {structured ? ` (${c.count})` : ""}
                </button>
              )
            })}
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
                    <button
                      type="button"
                      onClick={() => openDetail(p)}
                      className="relative rounded-xl mb-3 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Voir ${p.name}`}
                    >
                      {p.images?.[0] || p.imageUrl ? (
                        <img
                          src={p.images?.[0] || p.imageUrl}
                          alt={p.name}
                          className="w-full h-32 md:h-36 object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-32 md:h-36 rounded-xl bg-emerald-50 flex items-center justify-center text-5xl md:text-6xl group-hover:scale-105 transition-transform">
                          {p.emoji}
                        </div>
                      )}
                      {p.images && p.images.length > 1 && (
                        <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                          <Images className="w-3 h-3" />
                          {p.images.length}
                        </span>
                      )}
                    </button>
                    <Badge variant="outline" className="text-[10px] w-fit mb-2 px-2 py-0">
                      {p.category}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => openDetail(p)}
                      className="text-left font-semibold text-sm leading-snug mb-1 line-clamp-2 hover:text-primary transition-colors"
                    >
                      {p.name}
                    </button>
                    {/* Mission Premium — extrait de description (carte vitrine) */}
                    {descriptionPlainText(p.description) && (
                      <p className="text-xs text-muted-foreground leading-snug mb-1 line-clamp-2">
                        {descriptionPlainText(p.description)}
                      </p>
                    )}
                    <div className="mt-auto">
                      <p className="font-extrabold text-primary text-lg leading-tight">
                        {formatFC(p.priceUSD * rate)}
                      </p>
                      {/* LOT 1 — vitrine honnête : disponibilité visible */}
                      {p.stock <= 0 ? (
                        <p className="text-[10px] font-semibold text-red-600">Rupture de stock</p>
                      ) : p.stock <= 5 ? (
                        <p className="text-[10px] text-amber-600">Plus que {p.stock} en stock</p>
                      ) : null}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-muted-foreground">{formatUSD(p.priceUSD)}</span>
                        {p.stock > 0 ? (
                          <Button size="sm" className="h-8 px-3" onClick={() => addToCart(p)} aria-label={`Ajouter ${p.name} au panier`}>
                            <Plus className="w-4 h-4 mr-0.5" />
                            Ajouter
                          </Button>
                        ) : (
                          <span className="inline-flex items-center h-8 px-3 rounded-md border border-red-200 bg-red-50 text-[11px] font-bold uppercase tracking-wide text-red-600" aria-label={`${p.name} indisponible`}>
                            Épuisé
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Info vendeur */}
        <section className="mt-10 mb-4">
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

        {/* V6 — Avis clients (section masquée si fonctionnalité désactivée par l'admin) */}
        {reviewsEnabled && (
        <section className="mb-6" aria-label="Avis clients">
          <Card className="bg-white/70">
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="flex-1">
                  <p className="font-semibold flex items-center gap-2">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    Avis clients
                  </p>
                  {reviewStats && reviewStats.count > 0 ? (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-bold text-foreground">{reviewStats.avg.toFixed(1)}/5</span> —{" "}
                      {reviewStats.count} avis de clients
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">
                      Sois le premier à donner ton avis sur cette boutique.
                    </p>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setReviewOpen(true)}>
                  <Star className="w-4 h-4 mr-1" />
                  Laisser un avis
                </Button>
              </div>
              {reviews.length > 0 && (
                <div className="space-y-3">
                  {reviews.slice(0, 3).map((rv) => (
                    <ReviewItem key={rv.id} review={rv} />
                  ))}
                  {reviews.length > 3 && (
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setAllReviewsOpen(true)}>
                      Voir les {reviews.length} avis
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
        )}
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

      {/* V4 — Fiche produit avec galerie multi-photos */}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0" aria-describedby={undefined}>
          {detail && (
            <div>
              {/* Titre accessible (invisible à l'écran, le h3 sert de titre visuel) */}
              <DialogTitle className="sr-only">{detail.name}</DialogTitle>
              {/* Grande image + navigation */}
              <div className="relative bg-emerald-50">
                <div className="aspect-square w-full overflow-hidden flex items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {detailImage ? (
                      <motion.img
                        key={detailImage.slice(0, 48) + detailIdx}
                        src={detailImage}
                        alt={`${detail.name} — photo ${detailIdx + 1}`}
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -24 }}
                        transition={{ duration: 0.2 }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <motion.span
                        key="emoji"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-8xl"
                      >
                        {detail.emoji}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>

                {detailGallery.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDetailIdx((i) => (i - 1 + detailGallery.length) % detailGallery.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 border shadow rounded-full p-2 hover:bg-white transition-colors"
                      aria-label="Photo précédente"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailIdx((i) => (i + 1) % detailGallery.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 border shadow rounded-full p-2 hover:bg-white transition-colors"
                      aria-label="Photo suivante"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                      {detailIdx + 1}/{detailGallery.length}
                    </span>
                  </>
                )}
              </div>

              {/* Miniatures */}
              {detailGallery.length > 1 && (
                <div className="flex gap-2 px-4 pt-3 overflow-x-auto scrollbar-thin">
                  {detailGallery.map((img, i) => (
                    <button
                      key={`thumb-${i}`}
                      type="button"
                      onClick={() => setDetailIdx(i)}
                      className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                        i === detailIdx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                      }`}
                      aria-label={`Voir la photo ${i + 1}`}
                    >
                      <img src={img} alt="" className="w-14 h-14 object-cover" />
                    </button>
                  ))}
                </div>
              )}

              {/* Infos + achat */}
              <div className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Badge variant="outline" className="text-[10px] mb-1.5">
                      {detail.category}
                    </Badge>
                    <h3 className="font-bold text-lg leading-snug">{detail.name}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-extrabold text-primary text-xl leading-tight">{formatFC(detail.priceUSD * rate)}</p>
                    <p className="text-xs text-muted-foreground">{formatUSD(detail.priceUSD)}</p>
                  </div>
                </div>
                {/* Mission Premium — description mise en forme + caractéristiques
                    (zone déroulante : les fiches riches restent compactes) */}
                {(detail.description?.trim() || (detail.specs?.length ?? 0) > 0) && (
                  <div
                    className="max-h-56 overflow-y-auto scrollbar-thin rounded-xl bg-muted/40 p-3"
                    aria-label="Description du produit"
                  >
                    <ProductDescription description={detail.description} specs={detail.specs} />
                  </div>
                )}
                <Button
                  size="lg"
                  className="w-full text-base"
                  disabled={detail.stock <= 0}
                  onClick={() => {
                    addToCart(detail)
                    setDetail(null)
                  }}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {detail.stock > 0 ? "Ajouter au panier" : "Rupture de stock"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* V6 — Laisser un avis */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              Laisser un avis
            </DialogTitle>
            <DialogDescription>Partage ton expérience d'achat avec {store.name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rName">Ton nom *</Label>
              <Input id="rName" value={rName} onChange={(e) => setRName(e.target.value)} maxLength={40} placeholder="Ex : Kabongo Jean" />
            </div>
            <div className="space-y-1.5">
              <Label>Note *</Label>
              <div className="flex gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRRating(n)}
                    aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
                    aria-pressed={rRating === n}
                    className="p-1 rounded hover:scale-110 transition-transform"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        n <= rRating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rComment">Commentaire (optionnel)</Label>
              <Textarea
                id="rComment"
                value={rComment}
                onChange={(e) => setRComment(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Qualité, rapidité, communication…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rRef">Réf de commande (optionnel)</Label>
              <Input
                id="rRef"
                value={rRef}
                onChange={(e) => setRRef(e.target.value.toUpperCase())}
                maxLength={12}
                placeholder="KIN-XXXX — débloque le badge « Commande vérifiée »"
              />
            </div>
            <Button size="lg" className="w-full" onClick={submitReview} disabled={rSubmitting}>
              {rSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                "Publier mon avis"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* V6 — Tous les avis */}
      <Dialog open={allReviewsOpen} onOpenChange={setAllReviewsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
              Avis clients
            </DialogTitle>
            <DialogDescription>
              {reviewStats && reviewStats.count > 0
                ? `${reviewStats.avg.toFixed(1)}/5 — ${reviewStats.count} avis de clients`
                : "Aucun avis pour le moment"}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto scrollbar-thin space-y-3 pr-1">
            {reviews.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-8">Aucun avis pour le moment.</p>
            ) : (
              reviews.map((rv) => <ReviewItem key={rv.id} review={rv} />)
            )}
          </div>
        </DialogContent>
      </Dialog>

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

                {/* P1 (Phase C) — PAIEMENT DIRECT AU VENDEUR : coordonnées figées
                    à la création de la commande (snapshot immuable). L'acheteur
                    transfère lui-même puis déclare son paiement ; la déclaration
                    reste un état intermédiaire — le vendeur confirme après
                    vérification dans son compte opérateur. */}
                {payment.direct && payment.status === "idle" && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2.5">
                    <p className="font-bold text-sm flex items-center gap-1.5">
                      📲 Paiement direct au vendeur ({payment.operatorLabel})
                    </p>
                    <div className="text-sm space-y-0.5">
                      <p><span className="text-muted-foreground">Réseau :</span> <strong>{payment.direct.network || payment.direct.provider}</strong></p>
                      <p><span className="text-muted-foreground">Nom du titulaire :</span> <strong>{payment.direct.accountName || "—"}</strong></p>
                      <p>
                        <span className="text-muted-foreground">Numéro :</span>{" "}
                        <strong className="font-mono text-base select-all">{payment.direct.accountNumber}</strong>
                        <button
                          type="button"
                          className="ml-2 text-xs font-semibold text-primary underline"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(payment.direct?.accountNumber || "")
                              toast.success("Numéro copié ✅")
                            } catch {
                              toast.error("Copie impossible")
                            }
                          }}
                        >
                          Copier
                        </button>
                      </p>
                      <p className="font-semibold">Montant exact : {formatFC(payment.totalFC)}</p>
                      {payment.direct.instructions && (
                        <p className="text-xs text-muted-foreground">{payment.direct.instructions}</p>
                      )}
                    </div>
                    {!declareOpen ? (
                      <Button
                        variant="outline"
                        className="w-full border-primary/50 text-primary"
                        onClick={() => setDeclareOpen(true)}
                      >
                        ✅ J&apos;ai effectué le paiement
                      </Button>
                    ) : (
                      <div className="space-y-2 pt-1 border-t border-primary/20">
                        <Label htmlFor="declareRef">Référence de la transaction *</Label>
                        <Input
                          id="declareRef"
                          placeholder="Ex : PP24091... (visible dans le SMS opérateur)"
                          value={declareRef}
                          onChange={(e) => setDeclareRef(e.target.value)}
                          maxLength={80}
                        />
                        <Label htmlFor="declareNote">Note (optionnel)</Label>
                        <Input
                          id="declareNote"
                          placeholder="Ex : envoyé depuis le 082xxx avec mon nom"
                          value={declareNote}
                          onChange={(e) => setDeclareNote(e.target.value)}
                          maxLength={200}
                        />
                        {/* Phase D — capture du transfert (optionnel, visible vendeur/admin) */}
                        <div className="space-y-1.5 pt-1">
                          <Label htmlFor="declareProof">Capture du transfert (optionnel)</Label>
                          {declareProof ? (
                            <div className="flex items-center gap-2">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={declareProof}
                                alt="Capture du transfert"
                                className="h-20 w-20 rounded-lg border object-cover"
                              />
                              <div className="text-xs text-muted-foreground space-y-1">
                                <p>Capture prête — jointe à ta déclaration.</p>
                                <button
                                  type="button"
                                  className="text-destructive underline font-semibold"
                                  onClick={() => setDeclareProof("")}
                                >
                                  Retirer
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label
                              htmlFor="declareProof"
                              className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2.5 text-xs text-primary font-semibold cursor-pointer hover:bg-primary/10"
                            >
                              {declareProofBusy ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <ImagePlus className="w-4 h-4" />
                              )}
                              {declareProofBusy ? "Lecture de l'image…" : "Joindre la capture du transfert (SMS ou app opérateur)"}
                            </label>
                          )}
                          <input
                            id="declareProof"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(e) => {
                              pickDeclareProof(e.target.files?.[0])
                              e.target.value = ""
                            }}
                          />
                        </div>
                        <Button className="w-full" onClick={declareDirectPayment} disabled={declareBusy}>
                          {declareBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                          Déclarer mon paiement
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          Ta déclaration sera transmise au vendeur qui confirmera après vérification dans son compte
                          opérateur — elle ne confirme pas elle-même le paiement.
                        </p>
                      </div>
                    )}
                  </div>
                )}

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
            ) : payment.status === "declared" ? (
              /* ── P1 (Phase C) — DÉCLARÉ : état intermédiaire visible de tous ── */
              <div className="text-center space-y-4 py-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 15 }}
                  className="w-20 h-20 mx-auto rounded-full bg-amber-100 flex items-center justify-center"
                >
                  <Clock className="w-10 h-10 text-amber-600" />
                </motion.div>
                <DialogHeader className="space-y-1.5">
                  <DialogTitle className="text-2xl font-bold text-center">Paiement déclaré 🙏</DialogTitle>
                  <DialogDescription className="text-center">
                    Réf : <strong className="text-foreground font-mono">{payment.ref}</strong>
                  </DialogDescription>
                </DialogHeader>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-left space-y-1">
                  <p className="font-semibold">⏳ En attente de confirmation du vendeur</p>
                  <p className="text-muted-foreground">
                    Le vendeur va vérifier dans son compte opérateur que le transfert est arrivé, puis confirmera
                    l&apos;encaissement. Tu peux suivre l&apos;avancement à tout moment avec ta référence.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const ref = payment.ref
                    setPayment(null)
                    setCheckoutOpen(false)
                    window.location.hash = `#/suivi/${ref}`
                  }}
                >
                  🔎 Suivre ma commande ({payment.ref})
                </Button>
                <Button size="lg" className="w-full text-base bg-emerald-600 hover:bg-emerald-700" asChild>
                  <a href={payment.whatsappUrl} target="_blank" rel="noopener noreferrer">
                    📲 Contacter le vendeur sur WhatsApp
                  </a>
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
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    const ref = payment.ref
                    setPayment(null)
                    setCheckoutOpen(false)
                    window.location.hash = `#/suivi/${ref}`
                  }}
                >
                  🔎 Suivre ma commande ({payment.ref})
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
                <p className="font-semibold mb-1">💳 Paiement — {payMethods.find((p) => p.id === effectivePayment)?.label}</p>
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
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const ref = success.ref
                  setSuccess(null)
                  setCheckoutOpen(false)
                  window.location.hash = `#/suivi/${ref}`
                }}
              >
                🔎 Suivre ma commande ({success.ref})
              </Button>
              {authUser && (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setSuccess(null)
                    setCheckoutOpen(false)
                    window.location.hash = "#/commandes"
                  }}
                >
                  📦 Voir toutes mes commandes
                </Button>
              )}
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

              {needsAuth ? (
                /* ── V10 — COMPTE OBLIGATOIRE (panel inline, panier préservé) ── */
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="w-5 h-5 text-primary" />
                    <p className="text-sm font-semibold">Un compte est requis pour commander</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ton historique de commandes, tes factures et tes remboursements seront liés à ce compte.
                  </p>
                  <div className="flex gap-1 rounded-lg bg-muted p-1">
                    {(["register", "login"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAuthMode(m)}
                        className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition-all ${
                          authMode === m ? "bg-background shadow-sm" : "text-muted-foreground"
                        }`}
                      >
                        {m === "register" ? "Créer un compte" : "J'ai déjà un compte"}
                      </button>
                    ))}
                  </div>
                  {authMode === "register" && (
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Nom complet *" value={authName} onChange={(e) => setAuthName(e.target.value)} maxLength={60} />
                      <Input placeholder="WhatsApp (optionnel)" value={authPhone} onChange={(e) => setAuthPhone(e.target.value)} maxLength={20} />
                    </div>
                  )}
                  <Input
                    type="email"
                    placeholder="Email *"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    maxLength={80}
                    autoComplete="email"
                  />
                  <Input
                    type="password"
                    placeholder="Mot de passe * (8 caractères min)"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    maxLength={100}
                    autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  />
                  <Button className="w-full" onClick={handleInlineAuth} disabled={authBusy}>
                    {authBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <BadgeCheck className="w-4 h-4 mr-2" />}
                    {authMode === "register" ? "Créer mon compte et continuer" : "Me connecter et continuer"}
                  </Button>
                </div>
              ) : (
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
                  {activeZones.length === 0 && (
                    <div className="space-y-1.5">
                      <Label htmlFor="cZone">Zone / Commune</Label>
                      <Input id="cZone" list="zones-kin" placeholder="Gombe" value={cZone} onChange={(e) => setCZone(e.target.value)} maxLength={60} />
                      <datalist id="zones-kin">
                        {ZONES_KIN.map((z) => <option key={z} value={z} />)}
                      </datalist>
                    </div>
                  )}
                </div>

                {/* LOT 2 — retrait différencié : pas d'adresse de livraison pour
                    un retrait en boutique (le point de retrait EST la boutique) */}
                {pickupSelected ? (
                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 flex items-start gap-2">
                    <Store className="w-4 h-4 mt-0.5 shrink-0 text-violet-700" />
                    <div className="min-w-0">
                      <p className="font-semibold">Retrait en boutique{selectedZone ? ` — ${selectedZone.name}` : ""}</p>
                      <p className="text-xs text-violet-700">
                        Tu viendras chercher ta commande sur place. Le vendeur te préviendra dès qu'elle sera prête{selectedZone && selectedZone.feeFC > 0 ? ` (frais de préparation : ${formatFC(selectedZone.feeFC)})` : ""}.
                      </p>
                    </div>
                  </div>
                ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="cAddress">Adresse / repère de livraison</Label>
                  <Input
                    id="cAddress"
                    placeholder="Ex : av. Kasa-Vubu 123, près de l'église"
                    value={cAddress}
                    onChange={(e) => setCAddress(e.target.value)}
                    maxLength={200}
                  />
                </div>
                )}

                {/* V6 — Zones de livraison tarifées configurées par le vendeur */}
                {activeZones.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Mode de réception *</Label>
                    <div className="grid gap-2 max-h-44 overflow-y-auto scrollbar-thin pr-1">
                      {activeZones.map((z) => (
                        <button
                          key={z.id}
                          type="button"
                          onClick={() => setCZoneId(z.id)}
                          aria-pressed={cZoneId === z.id}
                          className={`rounded-xl border-2 p-3 flex items-center justify-between text-left transition-all ${
                            cZoneId === z.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                          }`}
                        >
                          <span className="font-medium text-sm flex items-center gap-1.5 min-w-0">
                            {z.kind === "pickup" ? (
                              <Store className="w-4 h-4 text-violet-600 shrink-0" />
                            ) : (
                              <Truck className="w-4 h-4 text-primary shrink-0" />
                            )}
                            <span className="min-w-0">
                              <span className="block truncate">{z.name}</span>
                              {(z as DeliveryZoneData & { kind?: string; etaLabel?: string }).kind && (
                                <span className="block text-[11px] text-muted-foreground">
                                  {DELIVERY_KIND_LABELS[((z as DeliveryZoneData & { kind?: string }).kind || "standard") as DeliveryKind]}
                                  {(z as DeliveryZoneData & { etaLabel?: string }).etaLabel ? ` · ${(z as DeliveryZoneData & { etaLabel?: string }).etaLabel}` : ""}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="text-sm font-bold text-primary shrink-0">
                            {z.feeFC > 0 ? formatFC(z.feeFC) : "Gratuit"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Mode de paiement</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {payMethods.map((pm) => (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setCPayment(pm.id)}
                        className={`rounded-xl border-2 p-3 text-left transition-all ${
                          effectivePayment === pm.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                      >
                        <p className="font-semibold text-sm">{pm.emoji} {pm.label}</p>
                        <p className="text-xs text-muted-foreground">{pm.sub}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* V6 — Code promo (masqué si fonctionnalité désactivée par l'admin) */}
                {couponsEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="cCoupon">Code promo</Label>
                  {coupon ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-emerald-800 flex items-center gap-1.5">
                          <TicketPercent className="w-4 h-4 shrink-0" />
                          {coupon.code}
                        </p>
                        <p className="text-xs text-emerald-700">
                          {coupon.label}
                          {totalUSD > 0 && discountUSD <= 0 && " — panier minimum non atteint"}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setCoupon(null)}>
                        Retirer
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        id="cCoupon"
                        placeholder="Ex : BIENVENUE10"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        maxLength={16}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        className="shrink-0"
                        onClick={applyCoupon}
                        disabled={couponChecking || !couponInput.trim()}
                      >
                        {couponChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : "Appliquer"}
                      </Button>
                    </div>
                  )}
                </div>
                )}

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

                {/* V6 — Récap détaillé du total */}
                <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5 text-sm" aria-live="polite">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sous-total</span>
                    <span className="font-medium">{formatFC(totalUSD * rate)}</span>
                  </div>
                  {discountUSD > 0 && coupon && (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>🏷️ Code {coupon.code}</span>
                      <span className="font-medium">−{formatFC(discountUSD * rate)}</span>
                    </div>
                  )}
                  {selectedZone && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        {pickupSelected ? (
                          <><Store className="w-3.5 h-3.5" /> Retrait — {selectedZone.name}</>
                        ) : (
                          <><Truck className="w-3.5 h-3.5" /> Livraison — {selectedZone.name}</>
                        )}
                      </span>
                      <span className="font-medium">{selectedZone.feeFC > 0 ? formatFC(selectedZone.feeFC) : pickupSelected ? "Gratuit" : "Gratuite"}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-extrabold text-base pt-1.5 border-t">
                    <span>Total à payer</span>
                    <span className="text-primary">
                      {formatFC(previewTotals.totalFC)}{" "}
                      <span className="text-xs font-medium text-muted-foreground">({formatUSD(previewTotals.totalUSD)})</span>
                    </span>
                  </div>
                </div>
              </div>
              )}

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
