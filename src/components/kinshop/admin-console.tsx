"use client"

// Console Admin KinShop — gestion globale de la plateforme
// Accès : #/admin (lien discret en pied de page) · auth par PIN (ADMIN_PIN côté serveur)

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Globe,
  History,
  Loader2,
  Lock,
  LogOut,
  Megaphone,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store as StoreIcon,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  buildWhatsAppLink,
  couponLabel,
  formatFC,
  formatPhoneDisplay,
  formatUSD,
  timeAgo,
  type CouponType,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/kinshop"

/* ─────────── Types ─────────── */

const PIN_KEY = "kinshop_admin_pin"

type AdminTab =
  | "overview"
  | "stores"
  | "orders"
  | "products"
  | "reviews"
  | "growth"
  | "settings"

interface SeriesPoint {
  date: string
  label: string
  count: number
  totalUSD: number
}

interface OverviewData {
  storesTotal: number
  storesActive: number
  storesSuspended: number
  premiumActive: number
  premiumRevenueUSD: number
  productsTotal: number
  ordersTotal: number
  ordersLast7d: number
  newStoresLast7d: number
  gmvUSD: number
  ordersByStatus: Record<string, number>
  byPayment: Record<string, number>
  topStores: { slug: string; name: string; emoji: string; totalUSD: number; orders: number }[]
  recentOrders: {
    ref: string
    customerName: string
    storeName: string
    storeSlug: string
    totalUSD: number
    status: string
    paymentMethod: string
    createdAt: string
  }[]
  recentStores: {
    slug: string
    name: string
    emoji: string
    ownerName: string
    isPremium: boolean
    status: string
    createdAt: string
  }[]
  expiringPremium: { slug: string; name: string; emoji: string; premiumUntil: string }[]
  series: SeriesPoint[]
  webhookDeliveries: number
  // V6 — Confiance & Croissance
  invoicesTotal: number
  reviewsTotal: number
  reviewsHidden: number
  couponsTotal: number
  couponsActive: number
  visitsLast7d: number
}

interface AdminStoreRow {
  id: string
  slug: string
  name: string
  ownerName: string
  whatsapp: string
  description: string
  city: string
  logoEmoji: string
  rateFC: number
  isPremium: boolean
  premiumUntil: string | null
  premiumActive: boolean
  status: string
  customDomain: string | null
  domainVerified: boolean
  createdAt: string
  productsCount: number
  ordersCount: number
  revenueUSD: number
}

interface AdminOrderRow {
  id: string
  ref: string
  storeId: string
  customerName: string
  customerPhone: string
  zone: string
  // V6 — récap commerce détaillé
  couponCode: string
  discountUSD: number
  deliveryZone: string
  deliveryFeeFC: number
  items: string
  totalUSD: number
  totalFC: number
  paymentMethod: PaymentMethod
  paymentStatus: string
  paymentRef: string
  payerPhone: string
  paidAt: string | null
  note: string
  status: OrderStatus
  createdAt: string
  store: { name: string; slug: string; logoEmoji: string }
}

interface AdminProductRow {
  id: string
  storeId: string
  name: string
  emoji: string
  imageUrl: string
  priceUSD: number
  category: string
  stock: number
  createdAt: string
  store: { name: string; slug: string; logoEmoji: string }
}

interface StoreOption {
  id: string
  slug: string
  name: string
  emoji: string
}

interface AdminReviewRow {
  id: string
  storeId: string
  orderId: string
  authorName: string
  rating: number
  comment: string
  hidden: boolean
  createdAt: string
  store: { name: string; slug: string; logoEmoji: string }
}

interface AdminCouponRow {
  id: string
  storeId: string
  code: string
  type: string
  value: number
  minTotalUSD: number
  maxUses: number
  uses: number
  active: boolean
  createdAt: string
  store: { name: string; slug: string; logoEmoji: string }
}

interface AdminZoneRow {
  id: string
  storeId: string
  name: string
  feeFC: number
  active: boolean
  store: { name: string; slug: string; logoEmoji: string }
}

interface GrowthStats {
  couponsActive: number
  couponsTotal: number
  usesTotal: number
  zonesActive: number
  zonesTotal: number
}

interface SettingsData {
  maintenance: boolean
  announcement: string
  defaultRateFC: number
}

interface AuditLog {
  id: string
  action: string
  target: string
  detail: string
  createdAt: string
}

interface PulseLog {
  id: string
  deliveryId: string
  event: string
  saleId: string
  createdAt: string
}

/* ─────────── Constantes UI ─────────── */

const ORDER_STATUS_META: Record<OrderStatus, { label: string; badge: string }> = {
  new: { label: "Nouvelle", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  paid: { label: "Payée en ligne", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  confirmed: { label: "Confirmée", badge: "bg-teal-100 text-teal-800 border-teal-200" },
  delivered: { label: "Livrée", badge: "bg-emerald-600 text-white border-emerald-600" },
  cancelled: { label: "Annulée", badge: "bg-rose-100 text-rose-700 border-rose-200" },
}

const SHORT_PAYMENT: Record<PaymentMethod, string> = {
  mpesa: "M-Pesa",
  airtel: "Airtel Money",
  orange: "Orange Money",
  cash: "Espèces",
}

// V2 — Méta des statuts de paiement mobile money
const PAY_STATUS_META: Record<string, { label: string; badge: string }> = {
  unpaid: { label: "Non payée", badge: "bg-muted text-muted-foreground border-border" },
  pending: { label: "En cours", badge: "bg-amber-100 text-amber-800 border-amber-200" },
  paid: { label: "Payée ✅", badge: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  failed: { label: "Échoué", badge: "bg-rose-100 text-rose-700 border-rose-200" },
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function itemsSummary(itemsJson: string): string {
  try {
    const items = JSON.parse(itemsJson) as { name: string; qty: number }[]
    if (!Array.isArray(items) || items.length === 0) return "—"
    const totalQty = items.reduce((s, i) => s + i.qty, 0)
    return `${items[0]?.name ?? "—"}${items.length > 1 ? ` +${items.length - 1}` : ""} · ${totalQty} art.`
  } catch {
    return "—"
  }
}

function parseItems(itemsJson: string): { name: string; qty: number; priceUSD: number; emoji: string }[] {
  try {
    const parsed = JSON.parse(itemsJson)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/* ─────────── Petits composants ─────────── */

function Stars({ n, className = "" }: { n: number; className?: string }) {
  const filled = Math.min(5, Math.max(1, Math.round(n)))
  return (
    <span
      className={`text-amber-500 whitespace-nowrap tracking-tight ${className}`}
      role="img"
      aria-label={`${n} étoile(s) sur 5`}
    >
      {"★".repeat(filled)}
      <span className="text-muted-foreground/40">{"★".repeat(5 - filled)}</span>
    </span>
  )
}

function OrderStatusBadge({ status }: { status: string }) {
  const meta = ORDER_STATUS_META[status as OrderStatus]
  if (!meta) return <Badge variant="outline">{status}</Badge>
  return (
    <Badge variant="outline" className={`${meta.badge} whitespace-nowrap`}>
      {meta.label}
    </Badge>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  tone: string
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-extrabold tracking-tight leading-tight">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

/* ─────────── Composant principal ─────────── */

export function AdminConsole({
  onBack,
  onOpenStore,
}: {
  onBack: () => void
  onOpenStore: (slug: string) => void
}) {
  /* ── Auth ── */
  const [authed, setAuthed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [pin, setPin] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)

  /* ── Onglets ── */
  const [tab, setTab] = useState<AdminTab>("overview")

  /* ── Vue d'ensemble ── */
  const [ov, setOv] = useState<OverviewData | null>(null)
  const [ovLoading, setOvLoading] = useState(false)

  /* ── Boutiques ── */
  const [stores, setStores] = useState<AdminStoreRow[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storesQ, setStoresQ] = useState("")
  const [storesStatus, setStoresStatus] = useState("all")
  const [storesPremium, setStoresPremium] = useState("all")
  const [deleteStore, setDeleteStore] = useState<AdminStoreRow | null>(null)
  const [storeActionBusy, setStoreActionBusy] = useState<string | null>(null)

  /* ── Commandes ── */
  const [orders, setOrders] = useState<AdminOrderRow[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersQ, setOrdersQ] = useState("")
  const [ordersStatus, setOrdersStatus] = useState("all")
  const [ordersPay, setOrdersPay] = useState("all")
  const [ordersStore, setOrdersStore] = useState("all")
  const [detailOrder, setDetailOrder] = useState<AdminOrderRow | null>(null)
  const [deleteOrder, setDeleteOrder] = useState<AdminOrderRow | null>(null)

  /* ── Produits ── */
  const [products, setProducts] = useState<AdminProductRow[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsQ, setProductsQ] = useState("")
  const [productsStore, setProductsStore] = useState("all")
  const [productsCat, setProductsCat] = useState("all")
  const [stockEdits, setStockEdits] = useState<Record<string, string>>({})
  const [deleteProduct, setDeleteProduct] = useState<AdminProductRow | null>(null)

  /* ── Avis (modération globale) ── */
  const [reviews, setReviews] = useState<AdminReviewRow[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [reviewsQ, setReviewsQ] = useState("")
  const [reviewsStore, setReviewsStore] = useState("all")
  const [reviewsVisibility, setReviewsVisibility] = useState("all")
  const [deleteReview, setDeleteReview] = useState<AdminReviewRow | null>(null)
  const [reviewBusy, setReviewBusy] = useState<string | null>(null)

  /* ── Croissance (coupons & zones) ── */
  const [coupons, setCoupons] = useState<AdminCouponRow[]>([])
  const [zones, setZones] = useState<AdminZoneRow[]>([])
  const [growthStats, setGrowthStats] = useState<GrowthStats | null>(null)
  const [growthLoading, setGrowthLoading] = useState(false)
  const [couponsQ, setCouponsQ] = useState("")
  const [couponsStore, setCouponsStore] = useState("all")
  const [deleteCoupon, setDeleteCoupon] = useState<AdminCouponRow | null>(null)
  const [couponBusy, setCouponBusy] = useState<string | null>(null)

  /* ── Options boutiques pour les filtres ── */
  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([])

  /* ── Paramètres & journaux ── */
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [announcementDraft, setAnnouncementDraft] = useState("")
  const [rateDraft, setRateDraft] = useState("")
  const [savingSettings, setSavingSettings] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [pulseLogs, setPulseLogs] = useState<PulseLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const settingsLoaded = useRef(false)

  /* ── Helpers réseau ── */

  const adminFetch = useCallback(async (url: string, init?: RequestInit): Promise<Response> => {
    const savedPin = localStorage.getItem(PIN_KEY) || ""
    const headers: Record<string, string> = {
      "x-admin-pin": savedPin,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    }
    const res = await fetch(url, { ...init, headers })
    if (res.status === 401) {
      localStorage.removeItem(PIN_KEY)
      setAuthed(false)
      throw new Error("Session admin expirée — reconnecte-toi.")
    }
    return res
  }, [])

  const readError = async (res: Response): Promise<string> => {
    try {
      const d = await res.json()
      return d.error || `Erreur ${res.status}`
    } catch {
      return `Erreur ${res.status}`
    }
  }

  /* ── Chargements ── */

  const loadOverview = useCallback(async () => {
    setOvLoading(true)
    try {
      const res = await adminFetch("/api/admin/overview")
      const data = await res.json()
      if (res.ok) setOv(data)
      else toast.error(data.error || "Erreur de chargement")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setOvLoading(false)
    }
  }, [adminFetch])

  const loadStores = useCallback(async () => {
    setStoresLoading(true)
    try {
      const res = await adminFetch(
        `/api/admin/stores?q=${encodeURIComponent(storesQ)}&status=${storesStatus}&premium=${storesPremium}`,
      )
      const data = await res.json()
      if (res.ok) setStores(data.stores)
      else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setStoresLoading(false)
    }
  }, [adminFetch, storesQ, storesStatus, storesPremium])

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const res = await adminFetch(
        `/api/admin/orders?q=${encodeURIComponent(ordersQ)}&status=${ordersStatus}&pay=${ordersPay}&storeId=${ordersStore === "all" ? "" : ordersStore}`,
      )
      const data = await res.json()
      if (res.ok) setOrders(data.orders)
      else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setOrdersLoading(false)
    }
  }, [adminFetch, ordersQ, ordersStatus, ordersPay, ordersStore])

  const loadProducts = useCallback(async () => {
    setProductsLoading(true)
    try {
      const res = await adminFetch(
        `/api/admin/products?q=${encodeURIComponent(productsQ)}&storeId=${productsStore === "all" ? "" : productsStore}&category=${productsCat === "all" ? "" : productsCat}`,
      )
      const data = await res.json()
      if (res.ok) setProducts(data.products)
      else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setProductsLoading(false)
    }
  }, [adminFetch, productsQ, productsStore, productsCat])

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true)
    try {
      const res = await adminFetch(
        `/api/admin/reviews?q=${encodeURIComponent(reviewsQ)}&storeId=${reviewsStore === "all" ? "" : reviewsStore}&hidden=${reviewsVisibility}`,
      )
      const data = await res.json()
      if (res.ok) setReviews(data.reviews)
      else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setReviewsLoading(false)
    }
  }, [adminFetch, reviewsQ, reviewsStore, reviewsVisibility])

  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true)
    try {
      const res = await adminFetch("/api/admin/growth")
      const data = await res.json()
      if (res.ok) {
        setCoupons(data.coupons)
        setZones(data.zones)
        setGrowthStats(data.stats)
      } else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setGrowthLoading(false)
    }
  }, [adminFetch])

  const loadSettings = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/settings")
      const data = await res.json()
      if (res.ok) {
        setSettings(data.settings)
        setAnnouncementDraft(data.settings.announcement)
        setRateDraft(String(data.settings.defaultRateFC))
      } else toast.error(await readError(res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }, [adminFetch])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const [resAudit, resPulse] = await Promise.all([
        adminFetch("/api/admin/logs?type=audit&limit=60"),
        adminFetch("/api/admin/logs?type=pulse&limit=30"),
      ])
      const dAudit = await resAudit.json()
      const dPulse = await resPulse.json()
      if (resAudit.ok) setAuditLogs(dAudit.logs)
      if (resPulse.ok) setPulseLogs(dPulse.logs)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setLogsLoading(false)
    }
  }, [adminFetch])

  const loadStoreOptions = useCallback(async () => {
    if (storeOptions.length > 0) return
    try {
      const res = await adminFetch("/api/admin/stores")
      const data = await res.json()
      if (res.ok) {
        setStoreOptions(
          data.stores.map((s: AdminStoreRow) => ({ id: s.id, slug: s.slug, name: s.name, emoji: s.logoEmoji })),
        )
      }
    } catch {
      /* silencieux */
    }
  }, [adminFetch])

  /* ── Vérification de session au montage ── */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      const saved = localStorage.getItem(PIN_KEY)
      if (!saved) {
        setChecking(false)
        return
      }
      try {
        const res = await fetch("/api/admin/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: saved }),
        })
        if (cancelled) return
        if (res.ok) setAuthed(true)
        else localStorage.removeItem(PIN_KEY)
      } catch {
        /* hors ligne : on reste déconnecté */
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ── Chargements réactifs par onglet (debounce recherche) ── */
  useEffect(() => {
    if (!authed || tab !== "overview") return
    void loadOverview()
  }, [authed, tab, loadOverview])

  useEffect(() => {
    if (!authed || tab !== "stores") return
    const t = setTimeout(() => void loadStores(), 280)
    return () => clearTimeout(t)
  }, [authed, tab, loadStores])

  useEffect(() => {
    if (!authed || tab !== "orders") return
    const t = setTimeout(() => void loadOrders(), 280)
    return () => clearTimeout(t)
  }, [authed, tab, loadOrders])

  useEffect(() => {
    if (!authed || tab !== "products") return
    const t = setTimeout(() => void loadProducts(), 280)
    return () => clearTimeout(t)
  }, [authed, tab, loadProducts])

  useEffect(() => {
    if (!authed || tab !== "reviews") return
    const t = setTimeout(() => void loadReviews(), 280)
    return () => clearTimeout(t)
  }, [authed, tab, loadReviews])

  useEffect(() => {
    if (!authed || tab !== "growth") return
    void loadGrowth()
  }, [authed, tab, loadGrowth])

  useEffect(() => {
    if (!authed || (tab !== "orders" && tab !== "products" && tab !== "reviews" && tab !== "growth")) return
    void loadStoreOptions()
  }, [authed, tab, loadStoreOptions])

  useEffect(() => {
    if (!authed || tab !== "settings") return
    if (!settingsLoaded.current) {
      settingsLoaded.current = true
      void loadSettings()
      void loadLogs()
    }
  }, [authed, tab, loadSettings, loadLogs])

  /* ── Actions ── */

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setLoginError("")
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLoginError(data.error || "PIN incorrect.")
        return
      }
      localStorage.setItem(PIN_KEY, pin.trim())
      setAuthed(true)
      setPin("")
      toast.success("Bienvenue dans la console KinShop 👋")
    } catch {
      setLoginError("Erreur réseau. Réessaie.")
    } finally {
      setLoggingIn(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(PIN_KEY)
    setAuthed(false)
    settingsLoaded.current = false
    setOv(null)
    toast.success("Déconnecté de la console admin.")
  }

  const storeAction = async (store: AdminStoreRow, action: string, days?: number) => {
    setStoreActionBusy(store.id + action)
    try {
      const res = await adminFetch("/api/admin/stores", {
        method: "PATCH",
        body: JSON.stringify({ id: store.id, action, days }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setStores((list) =>
        list.map((s) =>
          s.id === store.id
            ? {
                ...s,
                status: data.store.status,
                isPremium: data.store.isPremium,
                premiumUntil: data.store.premiumUntil,
                premiumActive: data.store.isPremium,
                customDomain: data.store.customDomain,
                domainVerified: data.store.domainVerified,
              }
            : s,
        ),
      )
      const labels: Record<string, string> = {
        suspend: "Boutique suspendue",
        activate: "Boutique réactivée",
        "grant-premium": `Premium accordé (+${days ?? 30} j)`,
        "revoke-premium": "Premium révoqué",
        "domain-verify": "Domaine validé manuellement",
        "domain-unlink": "Domaine délié",
      }
      toast.success(labels[action] || "Action effectuée")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setStoreActionBusy(null)
    }
  }

  const confirmDeleteStore = async () => {
    if (!deleteStore) return
    const target = deleteStore
    setDeleteStore(null)
    try {
      const res = await adminFetch(`/api/admin/stores?id=${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setStores((list) => list.filter((s) => s.id !== target.id))
      setStoreOptions((opts) => opts.filter((o) => o.id !== target.id))
      toast.success(`Boutique « ${target.name} » supprimée`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const changeOrderStatus = async (order: AdminOrderRow, status: OrderStatus) => {
    try {
      const res = await adminFetch("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: order.id, status }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setOrders((list) => list.map((o) => (o.id === order.id ? { ...o, status } : o)))
      setDetailOrder((d) => (d && d.id === order.id ? { ...d, status } : d))
      toast.success(`Commande ${order.ref} → ${ORDER_STATUS_META[status].label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const confirmOrderPayment = async (order: AdminOrderRow) => {
    try {
      const res = await adminFetch("/api/admin/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: order.id, paymentStatus: "paid" }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      const newStatus: OrderStatus = order.status === "new" ? "paid" : order.status
      setOrders((list) =>
        list.map((o) =>
          o.id === order.id
            ? { ...o, paymentStatus: "paid", paidAt: new Date().toISOString(), status: newStatus }
            : o,
        ),
      )
      setDetailOrder((d) =>
        d && d.id === order.id ? { ...d, paymentStatus: "paid", paidAt: new Date().toISOString(), status: newStatus } : d,
      )
      toast.success(`Paiement confirmé manuellement — ${order.ref}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const confirmDeleteOrder = async () => {
    if (!deleteOrder) return
    const target = deleteOrder
    setDeleteOrder(null)
    try {
      const res = await adminFetch(`/api/admin/orders?id=${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setOrders((list) => list.filter((o) => o.id !== target.id))
      toast.success(`Commande ${target.ref} supprimée`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const commitStock = async (product: AdminProductRow) => {
    const draft = stockEdits[product.id]
    if (draft === undefined) return
    const n = Math.max(0, Math.round(Number(draft)))
    if (!Number.isFinite(n) || n === product.stock) {
      setStockEdits((m) => {
        const next = { ...m }
        delete next[product.id]
        return next
      })
      return
    }
    try {
      const res = await adminFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ id: product.id, stock: n }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, stock: n } : p)))
      setStockEdits((m) => {
        const next = { ...m }
        delete next[product.id]
        return next
      })
      toast.success(`Stock « ${product.name} » → ${n}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const bumpStock = async (product: AdminProductRow, delta: number) => {
    const n = Math.max(0, product.stock + delta)
    try {
      const res = await adminFetch("/api/admin/products", {
        method: "PATCH",
        body: JSON.stringify({ id: product.id, stock: n }),
      })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setProducts((list) => list.map((p) => (p.id === product.id ? { ...p, stock: n } : p)))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const confirmDeleteProduct = async () => {
    if (!deleteProduct) return
    const target = deleteProduct
    setDeleteProduct(null)
    try {
      const res = await adminFetch(`/api/admin/products?id=${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setProducts((list) => list.filter((p) => p.id !== target.id))
      toast.success(`Produit « ${target.name} » supprimé`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const toggleReviewHidden = async (r: AdminReviewRow) => {
    setReviewBusy(r.id)
    try {
      const res = await adminFetch("/api/admin/reviews", {
        method: "PATCH",
        body: JSON.stringify({ id: r.id, hidden: !r.hidden }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setReviews((list) => list.map((x) => (x.id === r.id ? { ...x, hidden: data.review.hidden } : x)))
      toast.success(data.review.hidden ? "Avis masqué" : "Avis restauré")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setReviewBusy(null)
    }
  }

  const confirmDeleteReview = async () => {
    if (!deleteReview) return
    const target = deleteReview
    setDeleteReview(null)
    try {
      const res = await adminFetch(`/api/admin/reviews?id=${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setReviews((list) => list.filter((x) => x.id !== target.id))
      toast.success(`Avis de « ${target.authorName} » supprimé`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const toggleCouponActive = async (c: AdminCouponRow) => {
    setCouponBusy(c.id)
    try {
      const res = await adminFetch("/api/admin/growth", {
        method: "PATCH",
        body: JSON.stringify({ id: c.id, active: !c.active }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setCoupons((list) => list.map((x) => (x.id === c.id ? { ...x, active: data.coupon.active } : x)))
      setGrowthStats((s) =>
        s
          ? {
              ...s,
              couponsActive: s.couponsActive + (data.coupon.active ? 1 : -1),
            }
          : s,
      )
      toast.success(data.coupon.active ? "Code promo réactivé" : "Code promo désactivé")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setCouponBusy(null)
    }
  }

  const confirmDeleteCoupon = async () => {
    if (!deleteCoupon) return
    const target = deleteCoupon
    setDeleteCoupon(null)
    try {
      const res = await adminFetch(`/api/admin/growth?id=${target.id}`, { method: "DELETE" })
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setCoupons((list) => list.filter((x) => x.id !== target.id))
      setGrowthStats((s) =>
        s
          ? {
              ...s,
              couponsTotal: Math.max(0, s.couponsTotal - 1),
              couponsActive: target.active ? Math.max(0, s.couponsActive - 1) : s.couponsActive,
            }
          : s,
      )
      toast.success(`Code promo « ${target.code} » supprimé`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    }
  }

  const saveSettings = async (patch: Record<string, unknown>, label: string) => {
    setSavingSettings(true)
    try {
      const res = await adminFetch("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(await readError(res))
        return
      }
      setSettings(data.settings)
      setAnnouncementDraft(data.settings.announcement)
      setRateDraft(String(data.settings.defaultRateFC))
      toast.success(label)
      void loadLogs()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau")
    } finally {
      setSavingSettings(false)
    }
  }

  const refreshCurrent = () => {
    if (tab === "overview") void loadOverview()
    else if (tab === "stores") void loadStores()
    else if (tab === "orders") void loadOrders()
    else if (tab === "products") void loadProducts()
    else if (tab === "reviews") void loadReviews()
    else if (tab === "growth") void loadGrowth()
    else {
      void loadSettings()
      void loadLogs()
    }
  }

  /* ── Données dérivées ── */
  const productCategories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products],
  )

  const maxSeries = useMemo(() => Math.max(...(ov?.series.map((s) => s.count) ?? [1]), 1), [ov])

  /* ══════════ Écran de connexion ══════════ */

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 to-background">
        <header className="border-b bg-background/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              KinShop
            </Button>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Espace protégé
            </Badge>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="w-full max-w-sm"
          >
            <Card className="shadow-xl">
              <CardContent className="p-8 space-y-6">
                <div className="text-center space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-primary text-white flex items-center justify-center text-2xl shadow-lg">
                    🛍️
                  </div>
                  <h1 className="text-2xl font-extrabold tracking-tight">Console KinShop</h1>
                  <p className="text-sm text-muted-foreground">
                    Espace réservé à l&apos;équipe d&apos;administration de la plateforme.
                  </p>
                </div>
                <form onSubmit={handleLogin} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-pin">Code PIN administrateur</Label>
                    <Input
                      id="admin-pin"
                      type="password"
                      inputMode="numeric"
                      autoComplete="current-password"
                      autoFocus
                      placeholder="••••••"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="h-11 text-center tracking-[0.4em] text-lg"
                    />
                  </div>
                  {loginError && (
                    <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2" role="alert">
                      {loginError}
                    </p>
                  )}
                  <Button type="submit" className="w-full h-11" disabled={loggingIn || !pin.trim()}>
                    {loggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                    Déverrouiller la console
                  </Button>
                </form>
                <p className="text-[11px] text-muted-foreground text-center">
                  Démo : PIN par défaut <code className="font-mono">243243</code> — modifiable via
                  <code className="font-mono"> ADMIN_PIN</code> dans <code className="font-mono">.env</code>
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </main>
      </div>
    )
  }

  /* ══════════ Console ══════════ */

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      {/* Barre supérieure */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={onBack} aria-label="Retour à l'accueil">
              <ArrowLeft className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Retour</span>
            </Button>
            <div className="hidden sm:block w-px h-6 bg-border" />
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white text-sm shrink-0">🛍️</div>
              <span className="font-bold tracking-tight truncate">
                Console <span className="text-primary">KinShop</span>
              </span>
              <Badge variant="secondary" className="hidden md:inline-flex gap-1 shrink-0">
                <ShieldCheck className="w-3 h-3" /> Admin
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="ghost" size="icon" onClick={refreshCurrent} aria-label="Rafraîchir" title="Rafraîchir">
              <RefreshCw className={`w-4 h-4 ${ovLoading || storesLoading || ordersLoading || productsLoading || logsLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Se déconnecter">
              <LogOut className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">Quitter</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as AdminTab)}>
          <TabsList className="w-full max-w-full overflow-x-auto justify-start sm:justify-center mb-6 scrollbar-thin h-auto p-1 gap-1">
            <TabsTrigger value="overview" className="gap-1.5 shrink-0">
              <TrendingUp className="w-4 h-4" /> Vue d&apos;ensemble
            </TabsTrigger>
            <TabsTrigger value="stores" className="gap-1.5 shrink-0">
              <StoreIcon className="w-4 h-4" /> Boutiques
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 shrink-0">
              <ShoppingCart className="w-4 h-4" /> Commandes
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 shrink-0">
              <Package className="w-4 h-4" /> Produits
            </TabsTrigger>
            <TabsTrigger value="reviews" className="gap-1.5 shrink-0">
              <Star className="w-4 h-4" /> Avis
            </TabsTrigger>
            <TabsTrigger value="growth" className="gap-1.5 shrink-0">
              <Tag className="w-4 h-4" /> Croissance
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 shrink-0">
              <Settings2 className="w-4 h-4" /> Paramètres
            </TabsTrigger>
          </TabsList>

          {/* ════ VUE D'ENSEMBLE ════ */}
          <TabsContent value="overview" className="space-y-6">
            {ovLoading && !ov ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-64 rounded-xl" />
              </div>
            ) : ov ? (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                  <Kpi
                    icon={StoreIcon}
                    label="Boutiques"
                    value={String(ov.storesTotal)}
                    sub={`${ov.newStoresLast7d} nouvelle(s) sur 7 j`}
                    tone="bg-emerald-100 text-emerald-700"
                  />
                  <Kpi
                    icon={Crown}
                    label="Premium actifs"
                    value={String(ov.premiumActive)}
                    sub={`≈ ${formatUSD(ov.premiumRevenueUSD)}/mois`}
                    tone="bg-amber-100 text-amber-700"
                  />
                  <Kpi
                    icon={Package}
                    label="Produits en ligne"
                    value={String(ov.productsTotal)}
                    tone="bg-teal-100 text-teal-700"
                  />
                  <Kpi
                    icon={ShoppingCart}
                    label="Commandes · 7 j"
                    value={String(ov.ordersLast7d)}
                    sub={`${ov.ordersTotal} au total`}
                    tone="bg-emerald-100 text-emerald-700"
                  />
                  <Kpi
                    icon={TrendingUp}
                    label="Volume d'affaires"
                    value={formatUSD(ov.gmvUSD)}
                    sub={formatFC(ov.gmvUSD * (settings?.defaultRateFC || 2850)) + " (taux en vigueur)"}
                    tone="bg-amber-100 text-amber-700"
                  />
                  <Kpi
                    icon={Ban}
                    label="Suspendues"
                    value={String(ov.storesSuspended)}
                    sub={`${ov.webhookDeliveries} webhook(s) Chariow`}
                    tone="bg-rose-100 text-rose-700"
                  />
                </div>

                {/* V6 — KPIs Confiance & Croissance */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Kpi
                    icon={Star}
                    label="Avis clients"
                    value={String(ov.reviewsTotal)}
                    sub={ov.reviewsHidden > 0 ? `${ov.reviewsHidden} masqué(s)` : "tous visibles"}
                    tone="bg-amber-100 text-amber-700"
                  />
                  <Kpi
                    icon={Tag}
                    label="Codes promo actifs"
                    value={String(ov.couponsActive)}
                    sub={`${ov.couponsTotal} créé(s)`}
                    tone="bg-teal-100 text-teal-700"
                  />
                  <Kpi
                    icon={FileText}
                    label="Factures KinFacture"
                    value={String(ov.invoicesTotal)}
                    sub="émises via la plateforme"
                    tone="bg-emerald-100 text-emerald-700"
                  />
                  <Kpi
                    icon={Eye}
                    label="Visites · 7 j"
                    value={String(ov.visitsLast7d)}
                    sub="toutes boutiques"
                    tone="bg-amber-100 text-amber-700"
                  />
                </div>

                {/* Alerte premium expirant */}
                {ov.expiringPremium.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="flex items-center gap-2 text-amber-800 font-medium">
                      <Crown className="w-4 h-4" /> Premium expirant sous 7 jours :
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {ov.expiringPremium.map((s) => (
                        <button
                          key={s.slug}
                          onClick={() => onOpenStore(s.slug)}
                          className="text-sm text-amber-900 underline underline-offset-2 hover:no-underline"
                        >
                          {s.emoji} {s.name} ({fmtDate(s.premiumUntil)})
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid lg:grid-cols-3 gap-4">
                  {/* Graphique commandes 14 j */}
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-primary" />
                        Commandes — 14 derniers jours
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-end gap-1.5 h-40" role="img" aria-label="Graphique des commandes des 14 derniers jours">
                        {ov.series.map((d) => (
                          <div key={d.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                            <span className="text-[10px] font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                              {d.count}
                            </span>
                            <div
                              className={`w-full rounded-t-md transition-colors ${d.count > 0 ? "bg-primary/80 group-hover:bg-primary" : "bg-muted"}`}
                              style={{ height: `${Math.max((d.count / maxSeries) * 88, 3)}%` }}
                              title={`${d.label} : ${d.count} commande(s)`}
                            />
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">{d.label.split(" ")[0]}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Répartition paiements */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-primary" />
                        Moyens de paiement
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {Object.keys(ov.byPayment).length === 0 && (
                        <p className="text-sm text-muted-foreground">Aucune commande pour le moment.</p>
                      )}
                      {Object.entries(ov.byPayment)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{SHORT_PAYMENT[k as PaymentMethod] ?? k}</span>
                              <span className="font-semibold">{v}</span>
                            </div>
                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.round((v / Math.max(ov.ordersTotal, 1)) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid lg:grid-cols-3 gap-4">
                  {/* Top boutiques */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-600" />
                        Top boutiques
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5">
                      {ov.topStores.length === 0 && (
                        <p className="text-sm text-muted-foreground">Pas encore de ventes.</p>
                      )}
                      {ov.topStores.map((s, i) => (
                        <button
                          key={s.slug}
                          onClick={() => onOpenStore(s.slug)}
                          className="w-full flex items-center gap-3 text-left rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors"
                        >
                          <span className="text-sm font-bold text-muted-foreground w-4">#{i + 1}</span>
                          <span className="text-xl">{s.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium truncate">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">{s.orders} commande(s)</span>
                          </span>
                          <span className="text-sm font-bold text-primary">{formatUSD(s.totalUSD)}</span>
                        </button>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Dernières commandes */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ShoppingCart className="w-4 h-4 text-primary" />
                        Dernières commandes
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {ov.recentOrders.length === 0 && (
                        <p className="text-sm text-muted-foreground">Aucune commande.</p>
                      )}
                      {ov.recentOrders.map((o) => (
                        <div key={o.ref} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 text-sm">
                          <span className="font-mono text-xs text-muted-foreground">{o.ref}</span>
                          <span className="flex-1 min-w-0 truncate">{o.customerName}</span>
                          <span className="font-semibold whitespace-nowrap">{formatUSD(o.totalUSD)}</span>
                          <OrderStatusBadge status={o.status} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  {/* Dernières boutiques */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <StoreIcon className="w-4 h-4 text-primary" />
                        Dernières boutiques
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {ov.recentStores.map((s) => (
                        <button
                          key={s.slug}
                          onClick={() => onOpenStore(s.slug)}
                          className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60 text-sm text-left"
                        >
                          <span className="text-lg">{s.emoji}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium truncate">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {s.ownerName} · {timeAgo(s.createdAt)}
                            </span>
                          </span>
                          {s.isPremium && <Crown className="w-4 h-4 text-amber-500 shrink-0" />}
                          {s.status === "suspended" && <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 shrink-0">Suspendue</Badge>}
                        </button>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground py-10">Aucune donnée.</p>
            )}
          </TabsContent>

          {/* ════ BOUTIQUES ════ */}
          <TabsContent value="stores" className="space-y-4">
            {/* Filtres */}
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher (nom, slug, propriétaire, téléphone)…"
                  value={storesQ}
                  onChange={(e) => setStoresQ(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher une boutique"
                />
              </div>
              <Select value={storesStatus} onValueChange={setStoresStatus}>
                <SelectTrigger className="md:w-44" aria-label="Filtrer par statut">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="active">Actives</SelectItem>
                  <SelectItem value="suspended">Suspendues</SelectItem>
                </SelectContent>
              </Select>
              <Select value={storesPremium} onValueChange={setStoresPremium}>
                <SelectTrigger className="md:w-40" aria-label="Filtrer par premium">
                  <SelectValue placeholder="Premium" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  <SelectItem value="yes">Premium</SelectItem>
                  <SelectItem value="no">Gratuites</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {storesLoading && stores.length === 0 ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                  </div>
                ) : stores.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Aucune boutique ne correspond aux filtres.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="min-w-[880px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Propriétaire</TableHead>
                          <TableHead className="text-center">Produits</TableHead>
                          <TableHead className="text-center">Commandes</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stores.map((s) => (
                          <TableRow key={s.id} className={s.status === "suspended" ? "opacity-70" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                <span className="text-2xl">{s.logoEmoji}</span>
                                <div className="min-w-0">
                                  <p className="font-semibold truncate flex items-center gap-1.5">
                                    {s.name}
                                    {s.premiumActive && <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate">/{s.slug}</p>
                                  {s.customDomain && (
                                    <p className="text-[11px] truncate flex items-center gap-1 text-primary">
                                      <Globe className="w-3 h-3 shrink-0" />
                                      <span className="font-mono">{s.customDomain}</span>
                                      {s.domainVerified ? (
                                        <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">Vérifié</Badge>
                                      ) : (
                                        <Badge variant="outline" className="ml-1 px-1 py-0 text-[10px] bg-amber-100 text-amber-800 border-amber-200">Attente</Badge>
                                      )}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">{s.ownerName}</p>
                              <p className="text-xs text-muted-foreground">{formatPhoneDisplay(s.whatsapp)}</p>
                            </TableCell>
                            <TableCell className="text-center text-sm">{s.productsCount}</TableCell>
                            <TableCell className="text-center text-sm">{s.ordersCount}</TableCell>
                            <TableCell className="text-right text-sm font-semibold">{formatUSD(s.revenueUSD)}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1 items-start">
                                {s.status === "suspended" ? (
                                  <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200">Suspendue</Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Active</Badge>
                                )}
                                {s.premiumActive && (
                                  <span className="text-[11px] text-amber-700">jusqu&apos;au {fmtDate(s.premiumUntil)}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" disabled={storeActionBusy === s.id} aria-label={`Actions pour ${s.name}`}>
                                    {storeActionBusy === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Actions"}
                                    <ChevronDown className="w-3.5 h-3.5 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56">
                                  <DropdownMenuItem onClick={() => onOpenStore(s.slug)}>
                                    <Eye className="w-4 h-4 mr-2" /> Voir la boutique
                                  </DropdownMenuItem>
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={buildWhatsAppLink(
                                        s.whatsapp,
                                        `Bonjour ${s.ownerName} 👋, message de l'équipe KinShop à propos de votre boutique « ${s.name} ».`,
                                      )}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp propriétaire
                                    </a>
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {s.status === "active" ? (
                                    <DropdownMenuItem onClick={() => storeAction(s, "suspend")} className="text-rose-600 focus:text-rose-600">
                                      <Ban className="w-4 h-4 mr-2" /> Suspendre la boutique
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => storeAction(s, "activate")} className="text-emerald-700 focus:text-emerald-700">
                                      <CheckCircle2 className="w-4 h-4 mr-2" /> Réactiver la boutique
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => storeAction(s, "grant-premium", 30)}>
                                    <Crown className="w-4 h-4 mr-2" /> Premium +30 jours
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => storeAction(s, "grant-premium", 90)}>
                                    <Crown className="w-4 h-4 mr-2" /> Premium +90 jours
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => storeAction(s, "grant-premium", 365)}>
                                    <Crown className="w-4 h-4 mr-2" /> Premium +1 an
                                  </DropdownMenuItem>
                                  {s.premiumActive && (
                                    <DropdownMenuItem onClick={() => storeAction(s, "revoke-premium")}>
                                      <Ban className="w-4 h-4 mr-2" /> Révoquer le premium
                                    </DropdownMenuItem>
                                  )}
                                  {s.customDomain && (
                                    <>
                                      <DropdownMenuSeparator />
                                      {!s.domainVerified && (
                                        <DropdownMenuItem onClick={() => storeAction(s, "domain-verify")} className="text-emerald-700 focus:text-emerald-700">
                                          <CheckCircle2 className="w-4 h-4 mr-2" /> Valider le domaine manuellement
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuItem onClick={() => storeAction(s, "domain-unlink")} className="text-rose-600 focus:text-rose-600">
                                        <Globe className="w-4 h-4 mr-2" /> Délier le domaine
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => setDeleteStore(s)} className="text-rose-600 focus:text-rose-600 focus:bg-rose-50">
                                    <Trash2 className="w-4 h-4 mr-2" /> Supprimer…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">{stores.length} boutique(s) affichée(s)</p>
          </TabsContent>

          {/* ════ COMMANDES ════ */}
          <TabsContent value="orders" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher (réf, client, boutique, téléphone)…"
                  value={ordersQ}
                  onChange={(e) => setOrdersQ(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher une commande"
                />
              </div>
              <Select value={ordersStatus} onValueChange={setOrdersStatus}>
                <SelectTrigger className="md:w-44" aria-label="Filtrer par statut">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="new">Nouvelles</SelectItem>
                  <SelectItem value="paid">Payées en ligne</SelectItem>
                  <SelectItem value="confirmed">Confirmées</SelectItem>
                  <SelectItem value="delivered">Livrées</SelectItem>
                  <SelectItem value="cancelled">Annulées</SelectItem>
                </SelectContent>
              </Select>
              {/* V2 — Filtre par statut de paiement */}
              <Select value={ordersPay} onValueChange={setOrdersPay}>
                <SelectTrigger className="md:w-44" aria-label="Filtrer par paiement">
                  <SelectValue placeholder="Paiement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les paiements</SelectItem>
                  <SelectItem value="paid">Payées en ligne</SelectItem>
                  <SelectItem value="pending">Paiement en cours</SelectItem>
                  <SelectItem value="unpaid">Non payées</SelectItem>
                  <SelectItem value="failed">Paiement échoué</SelectItem>
                </SelectContent>
              </Select>
              <Select value={ordersStore} onValueChange={setOrdersStore}>
                <SelectTrigger className="md:w-52" aria-label="Filtrer par boutique">
                  <SelectValue placeholder="Boutique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les boutiques</SelectItem>
                  {storeOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.emoji} {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {ordersLoading && orders.length === 0 ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Aucune commande ne correspond aux filtres.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <Table className="min-w-[900px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Réf</TableHead>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Articles</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Paiement</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orders.map((o) => (
                          <TableRow key={o.id}>
                            <TableCell>
                              <button
                                onClick={() => setDetailOrder(o)}
                                className="font-mono text-xs font-semibold text-primary underline underline-offset-2 hover:no-underline"
                                aria-label={`Voir le détail de la commande ${o.ref}`}
                              >
                                {o.ref}
                              </button>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm whitespace-nowrap">
                                {o.store.logoEmoji} {o.store.name}
                              </span>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">{o.customerName}</p>
                              <p className="text-xs text-muted-foreground">{formatPhoneDisplay(o.customerPhone)}</p>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">{itemsSummary(o.items)}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="text-sm font-bold whitespace-nowrap">{formatUSD(o.totalUSD)}</p>
                              <p className="text-xs text-muted-foreground whitespace-nowrap">{formatFC(o.totalFC)}</p>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <span className="text-xs whitespace-nowrap">{SHORT_PAYMENT[o.paymentMethod] ?? o.paymentMethod}</span>
                                <Badge variant="outline" className={`text-[10px] ${PAY_STATUS_META[o.paymentStatus]?.badge ?? ""}`}>
                                  {PAY_STATUS_META[o.paymentStatus]?.label ?? o.paymentStatus}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Select
                                value={o.status}
                                onValueChange={(v) => changeOrderStatus(o, v as OrderStatus)}
                              >
                                <SelectTrigger className="h-8 w-[150px] text-xs" aria-label={`Statut de la commande ${o.ref}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {ORDER_STATUS_META[k].label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground whitespace-nowrap" title={new Date(o.createdAt).toLocaleString("fr-FR")}>
                                {timeAgo(o.createdAt)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDetailOrder(o)}
                                  aria-label={`Détails de ${o.ref}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => setDeleteOrder(o)}
                                  aria-label={`Supprimer ${o.ref}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">{orders.length} commande(s) affichée(s)</p>
          </TabsContent>

          {/* ════ PRODUITS ════ */}
          <TabsContent value="products" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher (produit, boutique)…"
                  value={productsQ}
                  onChange={(e) => setProductsQ(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher un produit"
                />
              </div>
              <Select value={productsStore} onValueChange={setProductsStore}>
                <SelectTrigger className="md:w-52" aria-label="Filtrer par boutique">
                  <SelectValue placeholder="Boutique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les boutiques</SelectItem>
                  {storeOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.emoji} {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={productsCat} onValueChange={setProductsCat}>
                <SelectTrigger className="md:w-48" aria-label="Filtrer par catégorie">
                  <SelectValue placeholder="Catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {productCategories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {productsLoading && products.length === 0 ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 rounded-lg" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Aucun produit ne correspond aux filtres.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <Table className="min-w-[820px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Produit</TableHead>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Catégorie</TableHead>
                          <TableHead className="text-right">Prix</TableHead>
                          <TableHead className="text-center">Stock</TableHead>
                          <TableHead>Ajouté</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="flex items-center gap-2.5">
                                {p.imageUrl ? (
                                  <img src={p.imageUrl} alt="" className="w-9 h-9 rounded-lg object-cover" />
                                ) : (
                                  <span className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">{p.emoji}</span>
                                )}
                                <span className="text-sm font-medium">{p.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm whitespace-nowrap">
                                {p.store.logoEmoji} {p.store.name}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]">{p.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <p className="text-sm font-semibold whitespace-nowrap">{formatUSD(p.priceUSD)}</p>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => bumpStock(p, -1)}
                                  disabled={p.stock <= 0}
                                  aria-label={`Réduire le stock de ${p.name}`}
                                >
                                  −
                                </Button>
                                <Input
                                  className="h-7 w-14 text-center text-sm px-1"
                                  inputMode="numeric"
                                  value={stockEdits[p.id] ?? String(p.stock)}
                                  onChange={(e) => setStockEdits((m) => ({ ...m, [p.id]: e.target.value }))}
                                  onBlur={() => commitStock(p)}
                                  aria-label={`Stock de ${p.name}`}
                                />
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => bumpStock(p, 1)}
                                  aria-label={`Augmenter le stock de ${p.name}`}
                                >
                                  +
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(p.createdAt)}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => onOpenStore(p.store.slug)}
                                  aria-label={`Voir ${p.store.name}`}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => setDeleteProduct(p)}
                                  aria-label={`Supprimer ${p.name}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">{products.length} produit(s) affiché(s)</p>
          </TabsContent>

          {/* ════ AVIS (V6 — modération globale) ════ */}
          <TabsContent value="reviews" className="space-y-4">
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher (auteur, commentaire, boutique)…"
                  value={reviewsQ}
                  onChange={(e) => setReviewsQ(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher un avis"
                />
              </div>
              <Select value={reviewsStore} onValueChange={setReviewsStore}>
                <SelectTrigger className="md:w-52" aria-label="Filtrer par boutique">
                  <SelectValue placeholder="Boutique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les boutiques</SelectItem>
                  {storeOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.emoji} {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reviewsVisibility} onValueChange={setReviewsVisibility}>
                <SelectTrigger className="md:w-44" aria-label="Filtrer par visibilité">
                  <SelectValue placeholder="Visibilité" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les avis</SelectItem>
                  <SelectItem value="visible">Visibles</SelectItem>
                  <SelectItem value="hidden">Masqués</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                {reviewsLoading && reviews.length === 0 ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 rounded-lg" />
                    ))}
                  </div>
                ) : reviews.length === 0 ? (
                  <p className="text-center text-muted-foreground py-12">Aucun avis ne correspond aux filtres.</p>
                ) : (
                  <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                    <Table className="min-w-[880px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Auteur</TableHead>
                          <TableHead>Note</TableHead>
                          <TableHead>Commentaire</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reviews.map((r) => (
                          <TableRow key={r.id} className={r.hidden ? "opacity-70" : ""}>
                            <TableCell>
                              <button
                                onClick={() => onOpenStore(r.store.slug)}
                                className="flex items-center gap-2 text-left hover:underline underline-offset-2"
                                aria-label={`Voir la boutique ${r.store.name}`}
                              >
                                <span className="text-lg">{r.store.logoEmoji}</span>
                                <span className="text-sm font-medium whitespace-nowrap">{r.store.name}</span>
                              </button>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm">{r.authorName}</p>
                              {r.orderId && (
                                <Badge variant="outline" className="mt-0.5 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">
                                  <ShieldCheck className="w-3 h-3 mr-1" /> Vérifié
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Stars n={r.rating} />
                            </TableCell>
                            <TableCell className="max-w-[280px]">
                              <p className="text-sm text-muted-foreground">{r.comment || "—"}</p>
                            </TableCell>
                            <TableCell>
                              {r.hidden ? (
                                <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 whitespace-nowrap">Masqué</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Visible</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <span
                                className="text-xs text-muted-foreground whitespace-nowrap"
                                title={new Date(r.createdAt).toLocaleString("fr-FR")}
                              >
                                {timeAgo(r.createdAt)}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={reviewBusy === r.id}
                                  onClick={() => toggleReviewHidden(r)}
                                  aria-label={r.hidden ? `Restaurer l'avis de ${r.authorName}` : `Masquer l'avis de ${r.authorName}`}
                                >
                                  {reviewBusy === r.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : r.hidden ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <EyeOff className="w-4 h-4" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                  onClick={() => setDeleteReview(r)}
                                  aria-label={`Supprimer l'avis de ${r.authorName}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">{reviews.length} avis affiché(s)</p>
          </TabsContent>

          {/* ════ CROISSANCE (V6 — codes promo & zones de livraison) ════ */}
          <TabsContent value="growth" className="space-y-4">
            {/* Codes promo — filtres */}
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un code (code, boutique)…"
                  value={couponsQ}
                  onChange={(e) => setCouponsQ(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher un code promo"
                />
              </div>
              <Select value={couponsStore} onValueChange={setCouponsStore}>
                <SelectTrigger className="md:w-52" aria-label="Filtrer par boutique">
                  <SelectValue placeholder="Boutique" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les boutiques</SelectItem>
                  {storeOptions.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.emoji} {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-primary" /> Codes promo
                  {growthStats && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {growthStats.couponsActive} actif(s) / {growthStats.couponsTotal} · {growthStats.usesTotal} utilisation(s)
                    </Badge>
                  )}
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadGrowth()} aria-label="Rafraîchir les codes promo">
                  <RefreshCw className={`w-4 h-4 ${growthLoading ? "animate-spin" : ""}`} />
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {coupons.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">Aucun code promo sur la plateforme.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table className="min-w-[860px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Remise</TableHead>
                          <TableHead>Condition</TableHead>
                          <TableHead className="text-center">Utilisations</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {coupons
                          .filter((c) => couponsStore === "all" || c.storeId === couponsStore)
                          .filter((c) => {
                            const q = couponsQ.toLowerCase().trim()
                            if (!q) return true
                            return c.code.toLowerCase().includes(q) || c.store.name.toLowerCase().includes(q)
                          })
                          .map((c) => {
                            const exhausted = c.maxUses > 0 && c.uses >= c.maxUses
                            return (
                              <TableRow key={c.id} className={!c.active ? "opacity-70" : ""}>
                                <TableCell>
                                  <span className="font-mono text-sm font-bold">{c.code}</span>
                                </TableCell>
                                <TableCell>
                                  <button
                                    onClick={() => onOpenStore(c.store.slug)}
                                    className="flex items-center gap-2 text-left hover:underline underline-offset-2"
                                    aria-label={`Voir la boutique ${c.store.name}`}
                                  >
                                    <span className="text-lg">{c.store.logoEmoji}</span>
                                    <span className="text-sm whitespace-nowrap">{c.store.name}</span>
                                  </button>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm font-semibold text-primary whitespace-nowrap">
                                    {couponLabel(c.type as CouponType, c.value)}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                                    {c.minTotalUSD > 0 ? `Dès ${formatUSD(c.minTotalUSD)}` : "Sans minimum"}
                                    {c.maxUses > 0 ? ` · max ${c.maxUses}` : " · illimité"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-center">
                                  <span className={`text-sm font-semibold ${exhausted ? "text-rose-600" : ""}`}>
                                    {c.uses}/{c.maxUses > 0 ? c.maxUses : "∞"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  {!c.active ? (
                                    <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 whitespace-nowrap">Désactivé</Badge>
                                  ) : exhausted ? (
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 whitespace-nowrap">Épuisé</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Actif</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={couponBusy === c.id}
                                      onClick={() => toggleCouponActive(c)}
                                      aria-label={c.active ? `Désactiver le code ${c.code}` : `Réactiver le code ${c.code}`}
                                    >
                                      {couponBusy === c.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : c.active ? (
                                        <Ban className="w-4 h-4" />
                                      ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                      onClick={() => setDeleteCoupon(c)}
                                      aria-label={`Supprimer le code ${c.code}`}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Zones de livraison — visibilité globale (gérées par les vendeurs) */}
            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <Truck className="w-4 h-4 text-teal-600" /> Zones de livraison
                  {growthStats && (
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {growthStats.zonesActive} active(s) / {growthStats.zonesTotal}
                    </Badge>
                  )}
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal">
                  Configurées par les vendeurs
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {zones.length === 0 ? (
                  <p className="text-center text-muted-foreground py-10">Aucune zone de livraison configurée.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <Table className="min-w-[720px]">
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead>Boutique</TableHead>
                          <TableHead>Zone</TableHead>
                          <TableHead className="text-right">Frais</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zones.map((z) => (
                          <TableRow key={z.id} className={!z.active ? "opacity-70" : ""}>
                            <TableCell>
                              <button
                                onClick={() => onOpenStore(z.store.slug)}
                                className="flex items-center gap-2 text-left hover:underline underline-offset-2"
                                aria-label={`Voir la boutique ${z.store.name}`}
                              >
                                <span className="text-lg">{z.store.logoEmoji}</span>
                                <span className="text-sm whitespace-nowrap">{z.store.name}</span>
                              </button>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{z.name}</span>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className="text-sm font-semibold whitespace-nowrap">
                                {z.feeFC > 0 ? formatFC(z.feeFC) : "Gratuite"}
                              </span>
                            </TableCell>
                            <TableCell>
                              {z.active ? (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">Active</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-muted text-muted-foreground border-border whitespace-nowrap">Masquée</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ════ PARAMÈTRES ════ */}
          <TabsContent value="settings" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              {/* Maintenance */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-amber-600" /> Mode maintenance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Plateforme en maintenance</p>
                      <p className="text-xs text-muted-foreground">Toutes les boutiques publiques afficheront un écran de maintenance.</p>
                    </div>
                    <Switch
                      checked={settings?.maintenance ?? false}
                      disabled={!settings || savingSettings}
                      onCheckedChange={(v) => saveSettings({ maintenance: v }, v ? "Mode maintenance activé 🛠️" : "Mode maintenance désactivé ✅")}
                      aria-label="Activer le mode maintenance"
                    />
                  </div>
                  {settings?.maintenance && (
                    <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ La maintenance est ACTIVE — les visiteurs ne voient plus les boutiques.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Annonce */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-primary" /> Annonce globale
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Ex : 🎉 Promo de fin de mois : frais de livraison offerts à Kinshasa !"
                    value={announcementDraft}
                    onChange={(e) => setAnnouncementDraft(e.target.value)}
                    maxLength={280}
                    rows={3}
                    aria-label="Texte de l'annonce globale"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">{announcementDraft.length}/280 · affichée sur toutes les boutiques</span>
                    <Button
                      size="sm"
                      disabled={savingSettings || announcementDraft.trim() === (settings?.announcement ?? "")}
                      onClick={() => saveSettings({ announcement: announcementDraft.trim() }, "Annonce mise à jour 📣")}
                    >
                      {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : "Publier"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Taux */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-teal-600" /> Taux FC par défaut
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="admin-rate">Congolais francs (FC) pour 1 $</Label>
                    <Input
                      id="admin-rate"
                      inputMode="numeric"
                      value={rateDraft}
                      onChange={(e) => setRateDraft(e.target.value.replace(/\D/g, ""))}
                      className="h-10"
                      aria-label="Taux de conversion par défaut"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Utilisé pour les nouvelles boutiques</span>
                    <Button
                      size="sm"
                      disabled={
                        savingSettings ||
                        !rateDraft ||
                        Number(rateDraft) === (settings?.defaultRateFC ?? 0) ||
                        Number(rateDraft) <= 0
                      }
                      onClick={() => saveSettings({ defaultRateFC: Number(rateDraft) }, `Taux par défaut : ${rateDraft} FC/$`)}
                    >
                      {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enregistrer"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Journaux */}
            <div className="grid lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" /> Journal d&apos;audit
                  </CardTitle>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void loadLogs()} aria-label="Rafraîchir le journal">
                    <RefreshCw className={`w-4 h-4 ${logsLoading ? "animate-spin" : ""}`} />
                  </Button>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96 pr-3">
                    {auditLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">Aucune action enregistrée.</p>
                    ) : (
                      <div className="space-y-2">
                        {auditLogs.map((l) => (
                          <div key={l.id} className="rounded-lg border px-3 py-2 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="secondary" className="font-mono text-[10px]">{l.action}</Badge>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(l.createdAt)}</span>
                            </div>
                            {l.detail && <p className="text-sm">{l.detail}</p>}
                            <p className="text-[11px] text-muted-foreground font-mono truncate">{l.target}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600" /> Webhooks Chariow (Pulses)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-96 pr-3">
                    {pulseLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">
                        Aucune livraison webhook reçue. Les paiements Chariow apparaîtront ici.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {pulseLogs.map((l) => (
                          <div key={l.id} className="rounded-lg border px-3 py-2 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-mono text-[10px]">{l.event}</Badge>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(l.createdAt)}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground font-mono truncate">sale: {l.saleId || "—"}</p>
                            <p className="text-[10px] text-muted-foreground font-mono truncate">id: {l.deliveryId}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog détail commande */}
      <Dialog open={!!detailOrder} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-md">
          {detailOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-mono">
                  {detailOrder.ref}
                  <OrderStatusBadge status={detailOrder.status} />
                </DialogTitle>
                <DialogDescription>
                  Commande passée {timeAgo(detailOrder.createdAt)} · {detailOrder.store.logoEmoji}{" "}
                  {detailOrder.store.name}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Client</p>
                    <p className="font-medium">{detailOrder.customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Téléphone</p>
                    <p className="font-medium">{formatPhoneDisplay(detailOrder.customerPhone)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Zone de livraison</p>
                    <p className="font-medium">{detailOrder.deliveryZone || detailOrder.zone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paiement</p>
                    <p className="font-medium">
                      {SHORT_PAYMENT[detailOrder.paymentMethod] ?? detailOrder.paymentMethod}
                      <Badge variant="outline" className={`ml-2 text-[10px] ${PAY_STATUS_META[detailOrder.paymentStatus]?.badge ?? ""}`}>
                        {PAY_STATUS_META[detailOrder.paymentStatus]?.label ?? detailOrder.paymentStatus}
                      </Badge>
                    </p>
                    {detailOrder.payerPhone && detailOrder.paymentStatus !== "unpaid" && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Payeur : {formatPhoneDisplay(detailOrder.payerPhone)}
                        {detailOrder.paidAt ? ` · ${fmtDate(detailOrder.paidAt)}` : ""}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Articles</p>
                  <div className="rounded-lg border divide-y">
                    {parseItems(detailOrder.items).map((it, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2">
                        <span>
                          {it.emoji} {it.qty} × {it.name}
                        </span>
                        <span className="font-medium">{formatUSD(it.priceUSD * it.qty)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* V6 — récap sous-total / remise / livraison */}
                {(detailOrder.couponCode || detailOrder.deliveryZone || detailOrder.deliveryFeeFC > 0) && (
                  <div className="rounded-lg border divide-y text-sm">
                    <div className="flex items-center justify-between px-3 py-2">
                      <span>Sous-total</span>
                      <span className="font-medium">{formatUSD(detailOrder.totalUSD + detailOrder.discountUSD)}</span>
                    </div>
                    {detailOrder.couponCode && detailOrder.discountUSD > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-emerald-700">
                        <span>Remise {detailOrder.couponCode}</span>
                        <span className="font-medium">−{formatUSD(detailOrder.discountUSD)}</span>
                      </div>
                    )}
                    {(detailOrder.deliveryZone || detailOrder.deliveryFeeFC > 0) && (
                      <div className="flex items-center justify-between px-3 py-2">
                        <span>Livraison{detailOrder.deliveryZone ? ` · ${detailOrder.deliveryZone}` : ""}</span>
                        <span className="font-medium">
                          {detailOrder.deliveryFeeFC > 0 ? formatFC(detailOrder.deliveryFeeFC) : "Gratuite"}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {detailOrder.note && (
                  <div>
                    <p className="text-xs text-muted-foreground">Note du client</p>
                    <p className="italic">&laquo; {detailOrder.note} &raquo;</p>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2.5">
                  <span className="font-semibold">Total</span>
                  <span className="font-extrabold">
                    {formatUSD(detailOrder.totalUSD)}{" "}
                    <span className="text-muted-foreground font-medium">({formatFC(detailOrder.totalFC)})</span>
                  </span>
                </div>
                <div className="flex gap-2">
                  <Select value={detailOrder.status} onValueChange={(v) => changeOrderStatus(detailOrder, v as OrderStatus)}>
                    <SelectTrigger className="flex-1" aria-label="Changer le statut">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ORDER_STATUS_META) as OrderStatus[]).map((k) => (
                        <SelectItem key={k} value={k}>
                          {ORDER_STATUS_META[k].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {detailOrder.paymentStatus !== "paid" && (
                    <Button onClick={() => confirmOrderPayment(detailOrder)} aria-label="Confirmer le paiement">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Paiement OK
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.open(
                        buildWhatsAppLink(
                          detailOrder.customerPhone,
                          `Bonjour ${detailOrder.customerName}, au sujet de votre commande ${detailOrder.ref}…`,
                        ),
                        "_blank",
                      )
                    }}
                    aria-label="Contacter le client sur WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 mr-1" /> Client
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression boutique */}
      <AlertDialog open={!!deleteStore} onOpenChange={(open) => !open && setDeleteStore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteStore?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>définitive</strong> : la boutique, ses {deleteStore?.productsCount ?? 0} produit(s)
              et ses {deleteStore?.ordersCount ?? 0} commande(s) seront supprimés pour toujours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteStore} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression commande */}
      <AlertDialog open={!!deleteOrder} onOpenChange={(open) => !open && setDeleteOrder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la commande {deleteOrder?.ref} ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. La commande de {deleteOrder?.customerName} ({formatUSD(deleteOrder?.totalUSD ?? 0)})
              disparaîtra du tableau de bord du vendeur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteOrder} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression produit */}
      <AlertDialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteProduct?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce produit ({deleteProduct?.emoji} {formatUSD(deleteProduct?.priceUSD ?? 0)}, boutique{" "}
              {deleteProduct?.store.name}) sera retiré du catalogue de manière définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteProduct} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression avis */}
      <AlertDialog open={!!deleteReview} onOpenChange={(open) => !open && setDeleteReview(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet avis ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;avis de {deleteReview?.authorName} ({deleteReview?.rating}/5 ★, boutique {deleteReview?.store.name})
              sera supprimé définitivement de la vitrine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReview} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmation suppression code promo */}
      <AlertDialog open={!!deleteCoupon} onOpenChange={(open) => !open && setDeleteCoupon(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le code « {deleteCoupon?.code} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce code promo de la boutique {deleteCoupon?.store.name} sera supprimé définitivement. Les clients ne
              pourront plus l&apos;utiliser au checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCoupon} className="bg-rose-600 hover:bg-rose-700 text-white">
              <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
