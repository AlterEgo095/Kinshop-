"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  ArrowLeft,
  BarChart3,
  Banknote,
  Bell,
  BellRing,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Eye,
  Loader2,
  MessageCircle,
  Package,
  Percent,
  Plus,
  Receipt,
  Settings,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  XCircle,
  PackageCheck,
} from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  CATEGORIES,
  PAYMENT_LABELS,
  STORE_EMOJIS,
  buildWhatsAppLink,
  formatFC,
  formatPhoneDisplay,
  formatUSD,
  timeAgo,
  usdToFC,
  type NotificationData,
  type OrderData,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
  type ProductData,
  type StoreData,
  type VendorStats,
} from "@/lib/kinshop"
import { StatusStudio } from "@/components/kinshop/status-studio"
import {
  buildInvoiceMessage,
  INVOICE_STATUS_LABELS,
  type InvoiceData,
  type InvoiceItem,
  type InvoiceStatus,
} from "@/lib/kinfacture"
import {
  InvoiceCanvas,
  downloadInvoicePNG,
  exportInvoicePDF,
  shareInvoiceCanvas,
} from "@/components/kinshop/invoice-canvas"

interface DashboardProps {
  slug: string
  onBack: () => void
  onViewStore: (slug: string) => void
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
  new: { label: "Nouvelle", variant: "outline", className: "bg-amber-100 text-amber-800 border-amber-300" },
  paid: { label: "Payée en ligne", variant: "outline", className: "bg-emerald-50 text-emerald-700 border-emerald-400" },
  confirmed: { label: "Confirmée", variant: "outline", className: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  delivered: { label: "Livrée", variant: "default", className: "bg-emerald-600 text-white border-emerald-600" },
  cancelled: { label: "Annulée", variant: "destructive", className: "" },
}

export function Dashboard({ slug, onBack, onViewStore }: DashboardProps) {
  const [store, setStore] = useState<StoreData | null>(null)
  const [products, setProducts] = useState<ProductData[]>([])
  const [orders, setOrders] = useState<OrderData[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Dialogues
  const [addOpen, setAddOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductData | null>(null)

  // Formulaire produit
  const [pName, setPName] = useState("")
  const [pEmoji, setPEmoji] = useState("📦")
  const [pPrice, setPPrice] = useState("")
  const [pCategory, setPCategory] = useState("Divers")
  const [adding, setAdding] = useState(false)

  // Réglages
  const [sName, setSName] = useState("")
  const [sDesc, setSDesc] = useState("")
  const [sPhone, setSPhone] = useState("")
  const [sCity, setSCity] = useState("")
  const [sEmoji, setSEmoji] = useState("🛍️")
  const [savingSettings, setSavingSettings] = useState(false)
  const [copied, setCopied] = useState(false)

  // Premium Chariow
  const [premiumOpen, setPremiumOpen] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [premEmail, setPremEmail] = useState("")
  const [premFirst, setPremFirst] = useState("")
  const [premLast, setPremLast] = useState("")
  const [premPhone, setPremPhone] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [simPaying, setSimPaying] = useState(false)

  // V2 — Statistiques avancées & Notifications SMS
  const [stats, setStats] = useState<VendorStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [notifications, setNotifications] = useState<NotificationData[]>([])
  const [notifUnread, setNotifUnread] = useState(0)
  const [activeTab, setActiveTab] = useState("produits")

  // V3 — KinFacture
  const [invoices, setInvoices] = useState<InvoiceData[]>([])
  const [invOpen, setInvOpen] = useState(false)
  const [invPreview, setInvPreview] = useState<InvoiceData | null>(null)
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null)
  const [invClientName, setInvClientName] = useState("")
  const [invClientPhone, setInvClientPhone] = useState("")
  const [invDueDate, setInvDueDate] = useState("")
  const [invNote, setInvNote] = useState("")
  const [invLines, setInvLines] = useState<InvoiceItem[]>([{ desc: "", qty: 1, unitFC: 0 }])
  const [invCreating, setInvCreating] = useState(false)

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders?slug=${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (res.ok) setOrders(data.orders)
    } catch {
      // silencieux
    }
  }, [slug])

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats?slug=${encodeURIComponent(slug)}&days=14`)
      const data = await res.json()
      if (res.ok) setStats(data.stats)
    } catch {
      // silencieux
    } finally {
      setStatsLoading(false)
    }
  }, [slug])

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?slug=${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (res.ok) {
        setNotifications(data.notifications)
        let seen = 0
        try {
          seen = Number(localStorage.getItem(`ks_notif_seen_${slug}`) || 0)
        } catch {
          // silencieux
        }
        setNotifUnread(
          (data.notifications as NotificationData[]).filter((n) => new Date(n.createdAt).getTime() > seen).length,
        )
      }
    } catch {
      // silencieux
    }
  }, [slug])

  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices?slug=${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (res.ok) setInvoices(data.invoices)
    } catch {
      // silencieux
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/stores?slug=${encodeURIComponent(slug)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setNotFound(true)
        } else {
          setStore(data.store)
          setProducts(data.store.products || [])
          setSName(data.store.name)
          setSDesc(data.store.description)
          setSPhone(formatPhoneDisplay(data.store.whatsapp))
          setSCity(data.store.city)
          setSEmoji(data.store.logoEmoji)
          await Promise.all([loadOrders(), loadStats(), loadNotifications(), loadInvoices()])
        }
      } catch {
        if (!cancelled) setNotFound(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [slug, loadOrders, loadStats, loadNotifications, loadInvoices])

  const storeLink = store ? `${window.location.origin}/#/boutique/${store.slug}` : ""

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(storeLink)
      setCopied(true)
      toast.success("Lien copié ! 🚀")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Copie impossible")
    }
  }

  const addProduct = async () => {
    if (!store) return
    if (!pName.trim()) return toast.error("Le nom du produit est requis.")
    const price = Number(pPrice.replace(",", "."))
    if (!price || price <= 0) return toast.error("Indique un prix en dollars.")
    setAdding(true)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          name: pName.trim(),
          emoji: pEmoji || "📦",
          priceUSD: price,
          category: pCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProducts((p) => [data.product, ...p])
      setPName("")
      setPPrice("")
      setPEmoji("📦")
      setAddOpen(false)
      toast.success("Produit ajouté ✅")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setAdding(false)
    }
  }

  const deleteProduct = async (product: ProductData) => {
    try {
      const res = await fetch(`/api/products?id=${product.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setProducts((p) => p.filter((x) => x.id !== product.id))
      toast.success(`« ${product.name} » supprimé.`)
    } catch {
      toast.error("Suppression impossible.")
    }
    setDeleteTarget(null)
  }

  const updateOrderStatus = async (order: OrderData, status: OrderStatus) => {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setOrders((os) => os.map((o) => (o.id === order.id ? data.order : o)))
      toast.success(`Commande ${order.ref} → ${STATUS_CONFIG[status].label}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  const saveSettings = async () => {
    if (!store) return
    setSavingSettings(true)
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          name: sName,
          description: sDesc,
          whatsapp: sPhone,
          city: sCity,
          logoEmoji: sEmoji,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setStore((s) => (s ? { ...s, ...data.store } : data.store))
      setProducts((prev) => prev)
      toast.success("Réglages enregistrés ✅")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSavingSettings(false)
    }
  }

  const parseItems = (json: string): OrderItem[] => {
    try {
      return JSON.parse(json)
    } catch {
      return []
    }
  }

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === "notifications") {
      try {
        localStorage.setItem(`ks_notif_seen_${slug}`, String(Date.now()))
      } catch {
        // silencieux
      }
      setNotifUnread(0)
    }
  }

  // V2 — Le vendeur enregistre un paiement espèces reçu à la livraison
  const markCashReceived = async (order: OrderData) => {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, paymentStatus: "paid" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, paymentStatus: "paid" } : o)))
      toast.success(`Paiement espèces enregistré — ${order.ref} 💵`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    }
  }

  const refreshStore = useCallback(async () => {
    try {
      const res = await fetch(`/api/stores?slug=${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (res.ok) setStore(data.store)
    } catch {
      // silencieux
    }
  }, [slug])

  const openPremiumDialog = (open: boolean) => {
    setPremiumOpen(open)
    if (open && store) {
      // Pré-remplissage avec les infos de la boutique
      if (!premFirst) {
        const parts = store.ownerName.trim().split(/\s+/)
        setPremFirst(parts[0] || "")
        setPremLast(parts.slice(1).join(" "))
      }
      if (!premPhone) setPremPhone(formatPhoneDisplay(store.whatsapp))
    }
  }

  const startPremiumCheckout = async () => {
    if (!store) return
    if (!premEmail.trim()) return toast.error("Ton email est requis.")
    if (!premFirst.trim()) return toast.error("Ton prénom est requis.")
    setSubmitting(true)
    try {
      const res = await fetch("/api/premium/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          email: premEmail,
          firstName: premFirst,
          lastName: premLast,
          phone: premPhone,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.mode === "live" && data.url) {
        // Paiement réel Chariow (mobile money) — redirection
        window.location.href = data.url
      } else {
        // Mode simulation
        setPremiumOpen(false)
        setSimOpen(true)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSubmitting(false)
    }
  }

  const confirmSim = async () => {
    if (!store) return
    setSimPaying(true)
    try {
      const res = await fetch("/api/premium/simulate-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: store.slug }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSimOpen(false)
      await refreshStore()
      toast.success("Premium activé ! ✨ (paiement simulé)")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSimPaying(false)
    }
  }

  const contactClient = (order: OrderData) => {
    const msg = `Bonjour ${order.customerName} 👋\nC'est ${store?.name ?? "la boutique"} (KinShop).\nTa commande ${order.ref} d'un montant de ${formatFC(order.totalFC)} a bien été reçue !\nNous revenons vers toi très vite pour la livraison. 🚚`
    window.open(buildWhatsAppLink(order.customerPhone, msg), "_blank")
  }

  /* ─────── V3 — KinFacture ─────── */

  const parseInvItems = (json: string): InvoiceItem[] => {
    try {
      const a = JSON.parse(json)
      return Array.isArray(a) ? a : []
    } catch {
      return []
    }
  }

  const openInvoiceDialog = () => {
    setInvClientName("")
    setInvClientPhone("")
    setInvDueDate("")
    setInvNote("")
    setInvLines([{ desc: "", qty: 1, unitFC: 0 }])
    setInvOpen(true)
  }

  const addCatalogLine = (productId: string) => {
    const p = products.find((x) => x.id === productId)
    if (!p || !store) return
    setInvLines((ls) => [...ls, { desc: p.name, qty: 1, unitFC: usdToFC(p.priceUSD, store.rateFC) }])
  }

  const invTotal = invLines.reduce(
    (s, l) => s + Math.round(l.unitFC) * Math.max(1, Math.min(999, l.qty || 1)),
    0,
  )

  const createInvoice = async () => {
    if (!store) return
    if (!invClientName.trim()) return toast.error("Le nom du client est requis.")
    const items = invLines.filter((l) => l.desc.trim() && l.unitFC > 0).map((l) => ({ desc: l.desc.trim().slice(0, 120), qty: Math.max(1, Math.min(999, Math.round(l.qty) || 1)), unitFC: Math.round(l.unitFC) }))
    if (items.length === 0) return toast.error("Ajoute au moins une ligne avec une description et un prix.")
    setInvCreating(true)
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: store.slug,
          clientName: invClientName,
          clientPhone: invClientPhone,
          dueDate: invDueDate,
          note: invNote,
          items,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInvoices((iv) => [data.invoice, ...iv])
      setInvOpen(false)
      toast.success(`Facture ${data.invoice.number} créée 🧾`)
      setInvPreview(data.invoice)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setInvCreating(false)
    }
  }

  const updateInvoiceStatus = async (inv: InvoiceData, status: InvoiceStatus) => {
    try {
      const res = await fetch("/api/invoices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: inv.id, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setInvoices((iv) => iv.map((x) => (x.id === inv.id ? data.invoice : x)))
      setInvPreview((p) => (p && p.id === inv.id ? data.invoice : p))
      toast.success(status === "paid" ? `Facture ${inv.number} payée ✅` : `Facture ${inv.number} marquée envoyée 📤`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  const deleteInvoice = async (inv: InvoiceData) => {
    try {
      const res = await fetch(`/api/invoices?id=${inv.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setInvoices((iv) => iv.filter((x) => x.id !== inv.id))
      setInvPreview(null)
      toast.success(`Facture ${inv.number} supprimée.`)
    } catch {
      toast.error("Suppression impossible.")
    }
  }

  const sendInvoiceWhatsApp = (inv: InvoiceData) => {
    if (!store) return
    const publicUrl = `${window.location.origin}/#/facture/${inv.number}`
    const msg = buildInvoiceMessage({
      storeName: store.name,
      number: inv.number,
      clientName: inv.clientName,
      items: parseInvItems(inv.items),
      totalFC: inv.totalFC,
      totalUSD: inv.totalUSD,
      dueDate: inv.dueDate,
      publicUrl,
    })
    window.open(buildWhatsAppLink(inv.clientPhone || store.whatsapp, msg), "_blank")
    if (inv.status === "draft") updateInvoiceStatus(inv, "sent")
  }

  const exportPreview = async (kind: "png" | "pdf" | "share") => {
    if (!invPreview || !previewCanvas) return toast.error("Aperçu pas encore prêt — patiente une seconde.")
    if (kind === "png") {
      const ok = await downloadInvoicePNG(previewCanvas, invPreview)
      if (ok) toast.success("Facture PNG téléchargée ! 🖼️")
      else toast.error("Échec du téléchargement.")
    } else if (kind === "pdf") {
      const ok = await exportInvoicePDF(previewCanvas, invPreview)
      if (ok) toast.success("Facture PDF téléchargée ! 📄")
      else toast.error("Échec de l'export PDF.")
    } else {
      const r = await shareInvoiceCanvas(previewCanvas, invPreview)
      if (r === "shared") toast.success("Facture partagée ! 🚀")
      else if (r === "downloaded") toast.info("Partage non supporté ici — facture téléchargée en PNG.")
    }
  }

  const INVOICE_STATUS_STYLE: Record<InvoiceStatus, string> = {
    draft: "bg-stone-100 text-stone-700 border-stone-200",
    sent: "bg-amber-50 text-amber-800 border-amber-200",
    paid: "bg-emerald-50 text-emerald-800 border-emerald-300",
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Chargement de ta boutique…</p>
        </div>
      </div>
    )
  }

  if (notFound || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-5xl">🤷</p>
          <h1 className="text-xl font-bold">Boutique introuvable</h1>
          <Button onClick={onBack}>Retour à l&apos;accueil</Button>
        </div>
      </div>
    )
  }

  const newOrders = orders.filter((o) => o.status === "new").length
  const revenueFC = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.totalFC, 0)

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Retour">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-lg shrink-0">
              {store.logoEmoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold truncate leading-tight">{store.name}</p>
                {store.isPremium && (
                  <Badge className="shrink-0 bg-amber-400 hover:bg-amber-400 text-amber-950 border-0 h-5 px-1.5 text-[10px] gap-0.5">
                    <Crown className="w-3 h-3" />
                    Premium
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">kinshop.cd/{store.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setShareOpen(true)} className="hidden sm:inline-flex">
              <Share2 className="w-4 h-4 mr-1" />
              Partager
            </Button>
            <Button size="sm" onClick={() => onViewStore(store.slug)}>
              <ExternalLink className="w-4 h-4 mr-1" />
              Voir ma boutique
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 md:py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
          {[
            { label: "Produits", value: String(products.length), icon: <Package className="w-4 h-4" /> },
            { label: "Nouvelles commandes", value: String(newOrders), icon: <ShoppingCart className="w-4 h-4" />, highlight: newOrders > 0 },
            { label: "Commandes totales", value: String(orders.length), icon: <PackageCheck className="w-4 h-4" /> },
            { label: "Volume des ventes", value: formatFC(revenueFC), icon: <CheckCircle2 className="w-4 h-4" /> },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={s.highlight ? "border-amber-300 bg-amber-50" : ""}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${s.highlight ? "bg-amber-200 text-amber-800" : "bg-primary/10 text-primary"}`}>
                    {s.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground truncate">{s.label}</p>
                    <p className="font-bold truncate">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Bandeau Premium Chariow */}
        {!store.isPremium ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6"
          >
            <div className="rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-50 via-white to-emerald-50 p-4 md:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 flex items-center justify-center shrink-0 shadow-md shadow-amber-200">
                <Crown className="w-6 h-6 text-amber-950" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold">
                  Passe en Premium — 3 $/mois{" "}
                  <Badge className="ml-1 bg-emerald-600 hover:bg-emerald-600 text-[10px]">Paiement mobile money via Chariow</Badge>
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Badge vérifié ✨ mise en avant de ta boutique, priorité support WhatsApp et plus.
                </p>
              </div>
              <Button onClick={() => openPremiumDialog(true)} className="shrink-0 bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold">
                <Crown className="w-4 h-4 mr-1" />
                Activer Premium
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shrink-0">
              <Crown className="w-5 h-5 text-amber-950" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-emerald-900 flex items-center gap-2">
                Premium actif ✨
                {store.premiumUntil && (
                  <span className="text-xs font-medium text-emerald-700 bg-white border border-emerald-200 rounded-full px-2 py-0.5">
                    jusqu&apos;au{" "}
                    {new Date(store.premiumUntil).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">Paiements sécurisés via Chariow — merci de soutenir KinShop ! 💚</p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-5 h-11">
            <TabsTrigger value="produits" className="px-4">
              <Package className="w-4 h-4 mr-1.5" />
              Produits
            </TabsTrigger>
            <TabsTrigger value="commandes" className="px-4">
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              Commandes
              {newOrders > 0 && (
                <Badge className="ml-2 h-5 px-1.5 bg-amber-500 hover:bg-amber-500">{newOrders}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="factures" className="px-4">
              <Receipt className="w-4 h-4 mr-1.5" />
              Factures
            </TabsTrigger>
            <TabsTrigger value="stats" className="px-4">
              <BarChart3 className="w-4 h-4 mr-1.5" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="notifications" className="px-4">
              {notifUnread > 0 ? <BellRing className="w-4 h-4 mr-1.5 text-amber-500" /> : <Bell className="w-4 h-4 mr-1.5" />}
              Alertes
              {notifUnread > 0 && (
                <Badge className="ml-2 h-5 px-1.5 bg-amber-500 hover:bg-amber-500">{notifUnread}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="statut" className="px-4">
              <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
              Statut
            </TabsTrigger>
            <TabsTrigger value="reglages" className="px-4">
              <Settings className="w-4 h-4 mr-1.5" />
              Réglages
            </TabsTrigger>
          </TabsList>

          {/* ─── PRODUITS ─── */}
          <TabsContent value="produits" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{products.length} produit(s) en vente</p>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Ajouter un produit
              </Button>
            </div>

            {products.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-3">
                  <p className="text-5xl">📦</p>
                  <p className="font-semibold">Aucun produit pour le moment</p>
                  <p className="text-sm text-muted-foreground">Ajoute ton premier produit pour commencer à vendre.</p>
                  <Button onClick={() => setAddOpen(true)}>
                    <Plus className="w-4 h-4 mr-1" />
                    Ajouter un produit
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                {products.map((p) => (
                  <Card key={p.id} className="group relative overflow-hidden">
                    <CardContent className="p-4">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-full h-28 object-cover rounded-lg mb-3" />
                      ) : (
                        <div className="w-full h-28 rounded-lg bg-emerald-50 flex items-center justify-center text-5xl mb-3">
                          {p.emoji}
                        </div>
                      )}
                      <p className="font-semibold text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground mb-1">{p.category}</p>
                      <p className="font-bold text-primary">{formatFC(p.priceUSD * store.rateFC)}</p>
                      <p className="text-xs text-muted-foreground">{formatUSD(p.priceUSD)}</p>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/90 border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                        aria-label={`Supprimer ${p.name}`}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── COMMANDES ─── */}
          <TabsContent value="commandes" className="space-y-3">
            {orders.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-3">
                  <p className="text-5xl">🛒</p>
                  <p className="font-semibold">Pas encore de commande</p>
                  <p className="text-sm text-muted-foreground">
                    Partage ton lien dans ton statut WhatsApp — les commandes arriveront ici.
                  </p>
                  <Button onClick={() => setShareOpen(true)}>
                    <Share2 className="w-4 h-4 mr-1" />
                    Partager ma boutique
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
                {orders.map((order) => {
                  const cfg = STATUS_CONFIG[order.status]
                  return (
                    <Card key={order.id}>
                      <CardContent className="p-4 md:p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-bold">{order.ref}</span>
                            <Badge variant={cfg.variant} className={cfg.className}>
                              {cfg.label}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {order.paymentMethod === "mpesa" ? "M-Pesa" : order.paymentMethod === "airtel" ? "Airtel Money" : order.paymentMethod === "orange" ? "Orange Money" : "Espèces"}
                            </Badge>
                            {/* V2 — Statut du paiement */}
                            {order.paymentStatus === "paid" && (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">✅ Payée</Badge>
                            )}
                            {order.paymentStatus === "pending" && (
                              <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">⏳ Paiement en cours</Badge>
                            )}
                            {order.paymentStatus === "failed" && (
                              <Badge variant="destructive" className="text-xs">Paiement échoué</Badge>
                            )}
                            {order.paymentMethod === "cash" && order.paymentStatus !== "paid" && (
                              <Badge variant="outline" className="text-xs">💵 À la livraison</Badge>
                            )}
                            {order.paymentMethod !== "cash" && order.paymentStatus === "unpaid" && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">Non payée</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{timeAgo(order.createdAt)}</span>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2 text-sm">
                          <p><span className="text-muted-foreground">👤 Client :</span> <strong>{order.customerName}</strong></p>
                          <p><span className="text-muted-foreground">📞 Tél :</span> {formatPhoneDisplay(order.customerPhone)}</p>
                          {order.zone && <p><span className="text-muted-foreground">📍 Zone :</span> {order.zone}</p>}
                          <p className="font-bold text-primary text-base">
                            💰 {formatFC(order.totalFC)} <span className="text-xs font-normal text-muted-foreground">({formatUSD(order.totalUSD)})</span>
                          </p>
                        </div>

                        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
                          {parseItems(order.items).map((it, i) => (
                            <p key={i}>
                              {it.emoji} <strong>{it.qty} ×</strong> {it.name}{" "}
                              <span className="text-muted-foreground">— {formatUSD(it.priceUSD * it.qty)}</span>
                            </p>
                          ))}
                          {order.note && (
                            <p className="text-muted-foreground italic pt-1 border-t border-border/60 mt-2">📝 {order.note}</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {order.status === "new" && (
                            <Button size="sm" onClick={() => updateOrderStatus(order, "confirmed")}>
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Confirmer
                            </Button>
                          )}
                          {order.status === "confirmed" && (
                            <Button size="sm" onClick={() => updateOrderStatus(order, "delivered")}>
                              <PackageCheck className="w-4 h-4 mr-1" />
                              Marquer livrée
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => contactClient(order)}>
                            <MessageCircle className="w-4 h-4 mr-1 text-emerald-600" />
                            Contacter sur WhatsApp
                          </Button>
                          {order.paymentMethod === "cash" && order.paymentStatus !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => markCashReceived(order)}>
                              <Banknote className="w-4 h-4 mr-1 text-emerald-600" />
                              Paiement reçu
                            </Button>
                          )}
                          {order.status !== "cancelled" && order.status !== "delivered" && (
                            <Button size="sm" variant="ghost" onClick={() => updateOrderStatus(order, "cancelled")} className="text-destructive hover:text-destructive">
                              <XCircle className="w-4 h-4 mr-1" />
                              Annuler
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── FACTURES (V3 — KinFacture) ─── */}
          <TabsContent value="factures" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {invoices.length} facture(s) — professionnelles, avec QR de paiement mobile money.
              </p>
              <Button onClick={openInvoiceDialog}>
                <Plus className="w-4 h-4 mr-1" />
                Nouvelle facture
              </Button>
            </div>

            {invoices.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-3">
                  <p className="text-5xl">🧾</p>
                  <p className="font-semibold">Aucune facture pour le moment</p>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Crée une facture pro pour un client ou une entreprise : lignes détaillées, total en FC,
                    QR de paiement mobile money et lien de partage WhatsApp.
                  </p>
                  <Button onClick={openInvoiceDialog}>
                    <Plus className="w-4 h-4 mr-1" />
                    Créer ma première facture
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
                {invoices.map((inv) => {
                  const st = (inv.status as InvoiceStatus) || "draft"
                  return (
                    <Card key={inv.id} className="overflow-hidden">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono font-bold text-sm">{inv.number}</p>
                            <p className="text-sm truncate">👤 {inv.clientName}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs font-bold shrink-0 ${INVOICE_STATUS_STYLE[st]}`}>
                            {INVOICE_STATUS_LABELS[st]}
                          </Badge>
                        </div>
                        <p className="font-bold text-primary text-lg">
                          {formatFC(inv.totalFC)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">({formatUSD(inv.totalUSD)})</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {parseInvItems(inv.items).length} ligne(s) · créée {timeAgo(inv.createdAt)}
                          {inv.dueDate ? ` · échéance ${inv.dueDate}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" variant="outline" onClick={() => setInvPreview(inv)}>
                            👁️ Aperçu
                          </Button>
                          <Button size="sm" onClick={() => sendInvoiceWhatsApp(inv)}>
                            <MessageCircle className="w-4 h-4 mr-1 text-emerald-100" />
                            WhatsApp
                          </Button>
                          {st !== "paid" && (
                            <Button size="sm" variant="outline" onClick={() => updateInvoiceStatus(inv, "paid")}>
                              ✅ Payée
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive ml-auto"
                            onClick={() => deleteInvoice(inv)}
                            aria-label={`Supprimer la facture ${inv.number}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ─── STATISTIQUES (V2) ─── */}
          <TabsContent value="stats" className="space-y-4">
            {statsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : !stats ? (
              <Card>
                <CardContent className="p-10 text-center space-y-2">
                  <p className="text-5xl">📊</p>
                  <p className="font-semibold">Statistiques indisponibles</p>
                  <p className="text-sm text-muted-foreground">Réessaie dans un instant.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card>
                    <CardContent className="p-4 space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Vues (14 j)
                      </p>
                      <p className="text-2xl font-extrabold">{stats.views.period}</p>
                      <p
                        className={`text-xs font-medium flex items-center gap-1 ${
                          stats.trendPct >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {stats.trendPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {stats.trendPct >= 0 ? "+" : ""}
                        {stats.trendPct}% vs 7 j précédents
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <ShoppingCart className="w-3.5 h-3.5" /> Commandes (14 j)
                      </p>
                      <p className="text-2xl font-extrabold">{stats.orders.period}</p>
                      <p className="text-xs text-muted-foreground">{stats.orders.total} au total</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5" /> Conversion
                      </p>
                      <p className="text-2xl font-extrabold">{stats.conversionPct}%</p>
                      <p className="text-xs text-muted-foreground">vues → commandes</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> Fidélité
                      </p>
                      <p className="text-2xl font-extrabold">{stats.repeatCustomers}</p>
                      <p className="text-xs text-muted-foreground">clients à 2+ commandes</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Graphique vues vs commandes */}
                <Card>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-sm">Vues &amp; commandes — 14 derniers jours</p>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> Vues
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" /> Commandes
                        </span>
                      </div>
                    </div>
                    <div className="flex items-end gap-1.5">
                      {stats.views.series.map((pt, i) => {
                        const maxV = Math.max(...stats.views.series.map((p) => p.count), 1)
                        const ordersCount = stats.orders.series[i]?.count ?? 0
                        const maxO = Math.max(...stats.orders.series.map((p) => p.count), 1)
                        const vh = Math.max((pt.count / maxV) * 100, pt.count > 0 ? 8 : 2)
                        const oh = Math.max((ordersCount / maxO) * 100, ordersCount > 0 ? 8 : 2)
                        const d = new Date(pt.day + "T00:00:00Z")
                        const label = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
                        return (
                          <div
                            key={pt.day}
                            className="flex-1 flex flex-col items-center gap-1 min-w-0"
                            title={`${label} — ${pt.count} vue(s), ${ordersCount} commande(s)`}
                          >
                            <div className="w-full flex items-end justify-center gap-0.5 h-32">
                              <div className="w-1/2 max-w-[14px] bg-primary/80 rounded-t" style={{ height: `${vh}%` }} />
                              <div className="w-1/2 max-w-[14px] bg-amber-400 rounded-t" style={{ height: `${oh}%` }} />
                            </div>
                            <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                              {i % 2 === 0 ? label : ""}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                {/* Top produits + suivi */}
                <div className="grid md:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <p className="font-semibold text-sm flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-500" /> Produits stars
                      </p>
                      {stats.topProducts.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucune vente sur la période.</p>
                      ) : (
                        <div className="space-y-2.5">
                          {stats.topProducts.map((tp, i) => (
                            <div key={tp.productId || tp.name} className="flex items-center gap-3 text-sm">
                              <span className="w-6 h-6 rounded-lg bg-muted flex items-center justify-center text-xs font-bold">
                                {i + 1}
                              </span>
                              <span className="text-lg">{tp.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{tp.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {tp.qty} vendu(s) · {tp.orders} commande(s)
                                </p>
                              </div>
                              <span className="font-bold text-primary text-sm">{formatUSD(tp.revenueUSD)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5 space-y-3">
                      <p className="font-semibold text-sm">Suivi des commandes (14 j)</p>
                      <div className="space-y-2">
                        {(
                          [
                            ["new", "Nouvelles"],
                            ["paid", "Payées en ligne"],
                            ["confirmed", "Confirmées"],
                            ["delivered", "Livrées"],
                            ["cancelled", "Annulées"],
                          ] as const
                        ).map(([k, label]) => {
                          const v = stats.statusFunnel[k] ?? 0
                          const max = Math.max(...Object.values(stats.statusFunnel), 1)
                          return (
                            <div key={k} className="flex items-center gap-2 text-sm">
                              <span className="w-28 text-xs text-muted-foreground shrink-0">{label}</span>
                              <div className="flex-1 h-5 bg-muted rounded-md overflow-hidden">
                                <div
                                  className={`h-full rounded-md ${
                                    k === "cancelled" ? "bg-red-300" : k === "paid" ? "bg-emerald-500" : "bg-emerald-400/70"
                                  }`}
                                  style={{ width: `${(v / max) * 100}%` }}
                                />
                              </div>
                              <span className="w-6 text-right font-bold text-xs">{v}</span>
                            </div>
                          )
                        })}
                      </div>
                      <div className="pt-2 border-t flex flex-wrap gap-1.5">
                        {(
                          [
                            ["mpesa", "M-Pesa"],
                            ["airtel", "Airtel"],
                            ["orange", "Orange"],
                            ["cash", "Espèces"],
                          ] as const
                        ).map(([k, label]) => (
                          <Badge key={k} variant="outline" className="text-xs">
                            {label} : {stats.payments[k] ?? 0}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Panier moyen : {formatUSD(stats.avgBasketUSD)}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

          {/* ─── ALERTES SMS (V2) ─── */}
          <TabsContent value="notifications" className="space-y-3">
            {notifications.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-3">
                  <p className="text-5xl">🔔</p>
                  <p className="font-semibold">Aucune notification</p>
                  <p className="text-sm text-muted-foreground">
                    Les alertes SMS de tes commandes apparaîtront ici (vendeur + client).
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[70vh] overflow-y-auto scrollbar-thin pr-1">
                {notifications.map((n) => (
                  <Card key={n.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {n.audience === "vendor" ? "🏪 Vendeur" : "👤 Client"}
                        </Badge>
                        <Badge
                          variant={n.status === "sent" ? "default" : n.status === "failed" ? "destructive" : "secondary"}
                          className="text-xs"
                        >
                          {n.status === "sent" ? "Envoyé" : n.status === "failed" ? "Échec" : "Simulé"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{n.to}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-line bg-muted/50 rounded-lg p-3">{n.body}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── STATUT (image WhatsApp) ─── */}
          <TabsContent value="statut">
            <StatusStudio store={store} storeLink={storeLink} />
          </TabsContent>

          {/* ─── RÉGLAGES ─── */}
          <TabsContent value="reglages">
            <Card className="max-w-2xl">
              <CardContent className="p-6 space-y-5">
                <div className="space-y-2">
                  <Label>Nom de la boutique</Label>
                  <Input value={sName} onChange={(e) => setSName(e.target.value)} maxLength={60} />
                </div>

                <div className="space-y-2">
                  <Label>Logo (emoji)</Label>
                  <div className="flex flex-wrap gap-2">
                    {STORE_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setSEmoji(e)}
                        className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition-all ${
                          sEmoji === e ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"
                        }`}
                        aria-label={`Logo ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Numéro WhatsApp</Label>
                    <Input value={sPhone} onChange={(e) => setSPhone(e.target.value)} maxLength={20} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input value={sCity} onChange={(e) => setSCity(e.target.value)} maxLength={40} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={sDesc} onChange={(e) => setSDesc(e.target.value)} rows={3} maxLength={300} />
                </div>

                <div className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
                  💡 Le taux de change est de <strong className="text-foreground">{formatFC(store.rateFC)}</strong> pour 1 $. Il servira à afficher tous les prix en FC.
                </div>

                <Button onClick={saveSettings} disabled={savingSettings}>
                  {savingSettings ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Enregistrer les modifications
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog : ajout produit */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau produit</DialogTitle>
            <DialogDescription>Ajoute un article à ton catalogue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-[70px_1fr] gap-3">
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Input className="text-center text-xl" value={pEmoji} onChange={(e) => setPEmoji(e.target.value)} maxLength={4} />
              </div>
              <div className="space-y-2">
                <Label>Nom du produit *</Label>
                <Input placeholder="Ex : Chaussures Nike 42" value={pName} onChange={(e) => setPName(e.target.value)} maxLength={80} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prix ($) *</Label>
                <Input type="number" min="0" step="0.5" placeholder="12" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  {pPrice && Number(pPrice) > 0 ? `≈ ${formatFC(Number(pPrice) * store.rateFC)}` : " "}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select value={pCategory} onValueChange={setPCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button onClick={addProduct} disabled={adding}>
              {adding ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : partage */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Partage ta boutique 🚀</DialogTitle>
            <DialogDescription>Colle ce lien dans ton statut WhatsApp, tes messages ou ta page Facebook.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={storeLink} className="font-mono text-sm" />
              <Button onClick={copyLink} className="shrink-0">
                {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? "Copié" : "Copier"}
              </Button>
            </div>
            <div className="rounded-xl bg-muted p-4 text-sm">
              <p className="font-semibold mb-1">Message prêt à publier :</p>
              <p className="text-muted-foreground">
                « 🛍️ Ma boutique est en ligne ! Passe commande en 2 clics 👉 {storeLink} »
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog : formulaire Premium */}
      <Dialog open={premiumOpen} onOpenChange={openPremiumDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-500" />
              Passer Premium — 3 $/mois
            </DialogTitle>
            <DialogDescription>
              Paiement sécurisé par mobile money via Chariow (M-Pesa, Airtel Money, Orange Money).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="toi@exemple.com"
                value={premEmail}
                onChange={(e) => setPremEmail(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Prénom *</Label>
                <Input value={premFirst} onChange={(e) => setPremFirst(e.target.value)} maxLength={50} />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input value={premLast} onChange={(e) => setPremLast(e.target.value)} maxLength={50} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Téléphone (mobile money) *</Label>
              <Input placeholder="0812345678" value={premPhone} onChange={(e) => setPremPhone(e.target.value)} maxLength={20} />
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-muted-foreground">
              Tu recevras une notification sur ton téléphone pour valider le paiement avec ton code PIN.
              Ton Premium s&apos;active automatiquement dès confirmation.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPremiumOpen(false)}>
              Annuler
            </Button>
            <Button onClick={startPremiumCheckout} disabled={submitting} className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold">
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Crown className="w-4 h-4 mr-1" />}
              Payer 3 $/mois
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : paiement simulé (mode démo sans clés Chariow) */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              Paiement Chariow (démo)
            </DialogTitle>
            <DialogDescription>
              Les clés Chariow ne sont pas encore configurées — on simule l&apos;étape de paiement mobile
              money pour tester le parcours complet.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl border bg-muted/50 p-4 space-y-3 text-center">
            <p className="text-4xl">📱</p>
            <p className="text-sm">
              Sur ton téléphone, une notification <strong>M-Pesa / Airtel / Orange</strong> te demanderait
              de valider <strong>3 $</strong> avec ton code PIN.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={confirmSim} disabled={simPaying} className="w-full">
              {simPaying ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              Simuler la validation du paiement
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setSimOpen(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : création facture (KinFacture) */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle facture 🧾</DialogTitle>
            <DialogDescription>
              Une facture pro avec QR de paiement mobile money, partageable par WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Client *</Label>
                <Input placeholder="Nom du client ou entreprise" value={invClientName} onChange={(e) => setInvClientName(e.target.value)} maxLength={80} />
              </div>
              <div className="space-y-2">
                <Label>Téléphone client (WhatsApp)</Label>
                <Input placeholder="0812345678" value={invClientPhone} onChange={(e) => setInvClientPhone(e.target.value)} maxLength={20} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Échéance (optionnel)</Label>
              <Input type="date" value={invDueDate} onChange={(e) => setInvDueDate(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Lignes de la facture *</Label>
                {products.length > 0 && (
                  <Select value="" onValueChange={addCatalogLine}>
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                      <SelectValue placeholder="＋ Importer du catalogue" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.emoji} {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {invLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_64px_110px_36px] gap-2 items-start">
                  <Input
                    placeholder="Description"
                    value={line.desc}
                    onChange={(e) => setInvLines((ls) => ls.map((l, i) => (i === idx ? { ...l, desc: e.target.value } : l)))}
                    maxLength={120}
                    aria-label={`Description ligne ${idx + 1}`}
                  />
                  <Input
                    type="number"
                    min="1"
                    value={line.qty}
                    onChange={(e) => setInvLines((ls) => ls.map((l, i) => (i === idx ? { ...l, qty: Number(e.target.value) } : l)))}
                    aria-label={`Quantité ligne ${idx + 1}`}
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Prix FC"
                    value={line.unitFC || ""}
                    onChange={(e) => setInvLines((ls) => ls.map((l, i) => (i === idx ? { ...l, unitFC: Number(e.target.value) } : l)))}
                    aria-label={`Prix unitaire FC ligne ${idx + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:text-destructive"
                    onClick={() => setInvLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : [{ desc: "", qty: 1, unitFC: 0 }]))}
                    aria-label={`Supprimer la ligne ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setInvLines((ls) => [...ls, { desc: "", qty: 1, unitFC: 0 }])}>
                <Plus className="w-4 h-4 mr-1" />
                Ajouter une ligne
              </Button>
            </div>

            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-emerald-900">Total</span>
              <span className="font-extrabold text-emerald-800">
                {formatFC(invTotal)}
                {store && invTotal > 0 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">≈ {formatUSD(Math.round((invTotal / store.rateFC) * 100) / 100)}</span>
                )}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Note (optionnel)</Label>
              <Textarea placeholder="Ex : Merci pour votre commande — livraison Gombe offerte." rows={2} value={invNote} onChange={(e) => setInvNote(e.target.value)} maxLength={300} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvOpen(false)}>Annuler</Button>
            <Button onClick={createInvoice} disabled={invCreating}>
              {invCreating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Receipt className="w-4 h-4 mr-1" />}
              Créer la facture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog : aperçu facture (KinFacture) */}
      <Dialog open={!!invPreview} onOpenChange={(o) => !o && setInvPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Facture {invPreview?.number}</DialogTitle>
            <DialogDescription>
              Envoie-la au client : lien WhatsApp, PDF A4 ou image — le QR de paiement est inclus.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
            {invPreview && store && (
              <InvoiceCanvas
                invoice={invPreview}
                store={{ name: store.name, logoEmoji: store.logoEmoji, whatsapp: store.whatsapp, city: store.city }}
                onRendered={setPreviewCanvas}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {invPreview && invPreview.status !== "paid" && (
              <Button size="sm" onClick={() => sendInvoiceWhatsApp(invPreview)}>
                <MessageCircle className="w-4 h-4 mr-1" />
                Envoyer par WhatsApp
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => exportPreview("pdf")}>📄 PDF</Button>
            <Button size="sm" variant="outline" onClick={() => exportPreview("png")}>🖼️ PNG</Button>
            <Button size="sm" variant="outline" onClick={() => exportPreview("share")} aria-label="Partager la facture">
              <Share2 className="w-4 h-4" />
            </Button>
            {invPreview && invPreview.status === "draft" && (
              <Button size="sm" variant="outline" onClick={() => updateInvoiceStatus(invPreview, "sent")}>
                📤 Marquer envoyée
              </Button>
            )}
            {invPreview && invPreview.status !== "paid" && (
              <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" onClick={() => updateInvoiceStatus(invPreview, "paid")}>
                ✅ Marquer payée
              </Button>
            )}
            {invPreview && invPreview.status === "paid" && (
              <Badge variant="outline" className="ml-auto bg-emerald-50 text-emerald-800 border-emerald-300 font-bold">
                ✅ Payée
              </Badge>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation suppression produit */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {deleteTarget?.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est définitive. Le produit ne sera plus visible dans ta boutique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteProduct(deleteTarget)} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="w-4 h-4 mr-1" />
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
