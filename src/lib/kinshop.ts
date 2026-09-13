// KinShop — Types partagés & utilitaires (devise, WhatsApp, slug)

export interface ProductData {
  id: string
  storeId: string
  name: string
  emoji: string
  imageUrl: string
  images: string[] // V4 — galerie multi-photos (1re = image principale)
  priceUSD: number
  category: string
  // P2 — catégorie structurée de boutique (rattache le produit à la navigation vitrine)
  storeCategoryId?: string | null
  stock: number
}

/* ─────────── V4 — Multi-images produits ─────────── */

export const MAX_PRODUCT_IMAGES = 5

/**
 * Normalise la liste d'images d'un produit.
 * Accepte : un tableau JS, une chaîne JSON (stockage SQLite) ou rien —
 * retombe sur imageUrl (rétrocompatibilité) si la galerie est vide.
 */
export function normalizeImages(raw: unknown, fallback?: string): string[] {
  let arr: unknown[] = []
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) arr = parsed
    } catch {
      // pas un JSON valide : on ignore
    }
  } else if (Array.isArray(raw)) {
    arr = raw
  }
  const clean = arr
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 400_000) // data URL compressée max ~300 Ko + marge
    .slice(0, MAX_PRODUCT_IMAGES)
  if (!clean.length && typeof fallback === "string" && fallback.trim()) {
    clean.push(fallback.trim())
  }
  return clean
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  priceUSD: number
  qty: number
}

export type PaymentMethod = "mpesa" | "airtel" | "orange" | "cash"
export type OrderStatus = "new" | "paid" | "confirmed" | "delivered" | "cancelled"
export type PaymentStatus = "unpaid" | "pending" | "cash_pending" | "paid" | "failed" | "refunded"

export interface OrderData {
  id: string
  ref: string
  storeId: string
  customerName: string
  customerPhone: string
  zone: string
  items: string
  totalUSD: number
  totalFC: number
  paymentMethod: PaymentMethod
  // V2 — Paiement mobile money en ligne
  paymentStatus: PaymentStatus
  paymentRef: string
  payerPhone: string
  paidAt: string | null
  // V6 — Récap commerce détaillé
  couponCode: string
  discountUSD: number
  deliveryZone: string
  deliveryFeeFC: number
  note: string
  status: OrderStatus
  createdAt: string
}

/* ─────────── P2 — Catégories structurées ─────────── */

/** Catégorie propre à une boutique (vue publique vitrine, actives uniquement). */
export interface StoreCategoryData {
  id: string
  name: string
  slug: string
  order: number
  /** Icône + nom de la catégorie globale rattachée (navigation marketplace), si définis */
  globalIcon?: string | null
  globalName?: string | null
}

export interface StoreData {
  id: string
  slug: string
  name: string
  ownerName: string
  whatsapp: string
  description: string
  city: string
  logoEmoji: string
  colorTheme: string
  rateFC: number
  isPremium: boolean
  premiumUntil: string | null
  status: string
  // P5 — gouvernance : vérification de la boutique
  verificationStatus?: string // unverified | pending | verified | rejected
  verificationRequestedAt?: string | null
  createdAt: string
  products?: ProductData[]
  orders?: OrderData[]
  // P2 — catégories structurées de la boutique (public : actives, ordonnées)
  storeCategories?: StoreCategoryData[]
}

/* ─────────── V2 — Statistiques & Notifications ─────────── */

export interface DailyPoint {
  day: string // "YYYY-MM-DD"
  count: number
}

export interface TopProductStat {
  productId: string
  name: string
  emoji: string
  qty: number
  revenueUSD: number
  orders: number
}

export interface VendorStats {
  views: { total: number; period: number; series: DailyPoint[] }
  orders: { total: number; period: number; series: DailyPoint[] }
  conversionPct: number
  avgBasketUSD: number
  repeatCustomers: number
  topProducts: TopProductStat[]
  statusFunnel: Record<OrderStatus, number>
  payments: Record<PaymentMethod, number>
  trendPct: number // évolution vues 7 derniers j vs 7 précédents
}

export interface NotificationData {
  id: string
  storeId: string
  orderId: string
  audience: "vendor" | "customer"
  to: string
  body: string
  status: "simulated" | "sent" | "failed"
  provider: string
  createdAt: string
}

/* ─────────── V6 — Confiance & Croissance ─────────── */

export type CouponType = "percent" | "fixed"

export interface CouponData {
  id: string
  storeId: string
  code: string
  type: CouponType
  value: number
  minTotalUSD: number
  maxUses: number
  uses: number
  active: boolean
  createdAt: string
}

export interface DeliveryZoneData {
  id: string
  storeId: string
  name: string
  feeFC: number
  active: boolean
  createdAt: string
}

export interface ReviewData {
  id: string
  storeId: string
  orderId: string
  authorName: string
  rating: number
  comment: string
  hidden: boolean
  createdAt: string
}

export interface ReviewStats {
  avg: number
  count: number
  dist: Record<1 | 2 | 3 | 4 | 5, number>
}

export const COUPON_TYPE_LABELS: Record<CouponType, string> = {
  percent: "Remise en %",
  fixed: "Montant fixe ($)",
}

/** Libellé court d'un code promo, ex : « -10% » ou « -$2 ». */
export function couponLabel(type: CouponType, value: number): string {
  return type === "percent" ? `-${Math.round(value)}%` : `-${formatUSD(value)}`
}

/** Description lisible des conditions d'un code promo. */
export function couponCondition(type: CouponType, value: number, minTotalUSD: number): string {
  const parts: string[] = []
  parts.push(type === "percent" ? `${Math.round(value)}% de remise` : `${formatUSD(value)} de remise`)
  if (minTotalUSD > 0) parts.push(`dès ${formatUSD(minTotalUSD)} d'achat`)
  return parts.join(", ")
}

/**
 * Remise calculée d'un code promo pour un sous-total donné (USD, arrondie au centime).
 * Le serveur fait foi ; la vitrine utilise la même fonction pour la prévisualisation.
 */
export function computeCouponDiscount(
  coupon: { type: CouponType; value: number; minTotalUSD: number },
  subtotalUSD: number,
): number {
  if (subtotalUSD < coupon.minTotalUSD) return 0
  const raw = coupon.type === "percent" ? (subtotalUSD * coupon.value) / 100 : coupon.value
  return Math.max(0, Math.min(Math.round(raw * 100) / 100, subtotalUSD))
}

/**
 * Calcul des totaux commande — centré FC (devise d'affichage principale en RDC),
 * l'USD est dérivé du total FC pour garantir zéro écart entre la prévisualisation
 * de la vitrine et le montant enregistré par le serveur.
 */
export function computeOrderTotals(params: {
  subtotalUSD: number
  discountUSD: number
  deliveryFeeFC: number
  rate: number
}): { totalUSD: number; totalFC: number } {
  const subtotalFC = Math.round(params.subtotalUSD * params.rate)
  const discountFC = Math.round(params.discountUSD * params.rate)
  const totalFC = Math.max(0, subtotalFC - discountFC + Math.round(params.deliveryFeeFC))
  const totalUSD = Math.round((totalFC / params.rate) * 100) / 100
  return { totalUSD, totalFC }
}

export interface TrackOrderData {
  ref: string
  status: OrderStatus
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  customerName: string
  zone: string
  items: OrderItem[]
  subtotalUSD: number
  discountUSD: number
  couponCode: string
  deliveryZone: string
  deliveryFeeFC: number
  totalUSD: number
  totalFC: number
  createdAt: string
  store: { name: string; logoEmoji: string; slug: string; whatsapp: string }
}

/* ─────────── Devise ─────────── */

export const DEFAULT_RATE_FC = 2850

const fcFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })

export function formatFC(amount: number): string {
  return `${fcFormatter.format(Math.round(amount))} FC`
}

export function formatUSD(amount: number): string {
  const isRound = Math.abs(amount - Math.round(amount)) < 0.005
  return `$${isRound ? Math.round(amount) : amount.toFixed(2)}`
}

export function usdToFC(usd: number, rate: number = DEFAULT_RATE_FC): number {
  return Math.round(usd * rate)
}

/* ─────────── WhatsApp ─────────── */

export function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (digits.startsWith("+")) digits = digits.slice(1)
  // 0xxxxxxxxx → 243xxxxxxxxx (format congolais local)
  if (digits.startsWith("0") && digits.length === 10) digits = "243" + digits.slice(1)
  if (digits.length === 9 && digits.startsWith("8")) digits = "243" + digits
  return digits
}

export function formatPhoneDisplay(raw: string): string {
  const d = normalizePhone(raw)
  if (d.startsWith("243") && d.length === 12) {
    return `+243 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`
  }
  return raw
}

export function buildWhatsAppLink(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`
}

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  mpesa: "M-Pesa (Vodacom)",
  airtel: "Airtel Money",
  orange: "Orange Money",
  cash: "Espèces à la livraison",
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Non payée",
  pending: "Paiement en cours",
  // V10 — espèces à la livraison : état distinct, JAMAIS « payée » tant que non encaissé
  cash_pending: "À payer à la livraison",
  paid: "Payée",
  failed: "Paiement échoué",
  refunded: "Remboursée",
}

/** Détecte l'opérateur RDC d'après le préfixe (indice UX, jamais bloquant). */
export function detectOperator(phone: string): "vodacom" | "airtel" | "orange" | "africell" | "unknown" {
  const p = normalizePhone(phone)
  const local = p.startsWith("243") ? p.slice(3) : p
  if (local.startsWith("08") || local.startsWith("8")) {
    const two = local.slice(0, 3)
    if (["081", "082", "083", "088"].includes(two)) return "vodacom"
    if (["084", "085", "089"].includes(two)) return "orange"
    return "unknown"
  }
  if (local.startsWith("09") || local.startsWith("9") || local.startsWith("07")) {
    const two = local.slice(0, 3)
    if (["099", "090", "091"].includes(two)) return "airtel"
    if (["097", "098"].includes(two)) return "africell"
    return "unknown"
  }
  return "unknown"
}

export const OPERATOR_LABELS: Record<string, string> = {
  vodacom: "Vodacom (M-Pesa)",
  airtel: "Airtel",
  orange: "Orange",
  africell: "Africell",
  unknown: "Opérateur détecté automatiquement",
}

export function buildOrderMessage(params: {
  storeName: string
  ref: string
  customerName: string
  customerPhone: string
  zone: string
  items: OrderItem[]
  totalUSD: number
  totalFC: number
  paymentMethod: PaymentMethod
  note: string
  // V6 — récap détaillé (optionnel : rétrocompatible)
  discountUSD?: number
  couponCode?: string
  deliveryFeeFC?: number
}): string {
  const lines: string[] = []
  lines.push("🛍️ NOUVELLE COMMANDE — KinShop")
  lines.push("━━━━━━━━━━━━━━━━")
  lines.push(`🏪 Boutique : ${params.storeName}`)
  lines.push(`🔖 Réf : ${params.ref}`)
  lines.push("")
  lines.push(`👤 Client : ${params.customerName}`)
  lines.push(`📞 Tél : ${formatPhoneDisplay(params.customerPhone)}`)
  if (params.zone) lines.push(`📍 Zone : ${params.zone}`)
  lines.push("")
  lines.push("📦 Produits :")
  for (const it of params.items) {
    lines.push(`• ${it.qty} × ${it.name} — ${formatUSD(it.priceUSD * it.qty)}`)
  }
  lines.push("━━━━━━━━━━━━━━━━")
  // V6 — remise et livraison détaillées avant le total
  if ((params.discountUSD ?? 0) > 0) {
    lines.push(`🏷️ Code ${params.couponCode || "PROMO"} : −${formatUSD(params.discountUSD ?? 0)}`)
  }
  if ((params.deliveryFeeFC ?? 0) > 0) {
    lines.push(`🚚 Livraison : ${formatFC(params.deliveryFeeFC ?? 0)}`)
  }
  lines.push(`💰 TOTAL : ${formatUSD(params.totalUSD)} (${formatFC(params.totalFC)})`)
  lines.push(`💳 Paiement : ${PAYMENT_LABELS[params.paymentMethod]}`)
  if (params.note) lines.push(`📝 Note : ${params.note}`)
  lines.push("")
  lines.push("✅ Commande enregistrée automatiquement sur KinShop")
  return lines.join("\n")
}

/* ─────────── Slug ─────────── */

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
}

export function makeOrderRef(): string {
  const t = Date.now().toString(36).toUpperCase().slice(-4)
  const r = Math.random().toString(36).toUpperCase().slice(2, 4)
  return `KIN-${t}${r}`
}

// V10 — La numérotation séquentielle (CMD-YYYY-NNNNNN) est produite côté SERVEUR
// via nextCounter() (src/lib/invoice-integrity.ts). makeOrderRef reste disponible
// pour tout usage non-commercial (aucun usage métier depuis la V10).

/* ─────────── Divers ─────────── */

export const CATEGORIES = [
  "Mode & Vêtements",
  "Électronique",
  "Alimentation",
  "Beauté & Cosmétiques",
  "Maison & Cuisine",
  "Divers",
] as const

export const STORE_EMOJIS = ["🛍️", "👗", "👟", "📱", "🍗", "💄", "🏠", "🧺", "💎", "🥑", "⚽", "🎬"]

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  return `il y a ${d} j`
}
