// KinShop — Types partagés & utilitaires (devise, WhatsApp, slug)

export interface ProductData {
  id: string
  storeId: string
  name: string
  emoji: string
  imageUrl: string
  priceUSD: number
  category: string
  stock: number
}

export interface OrderItem {
  productId: string
  name: string
  emoji: string
  priceUSD: number
  qty: number
}

export type PaymentMethod = "mpesa" | "airtel" | "orange" | "cash"
export type OrderStatus = "new" | "confirmed" | "delivered" | "cancelled"

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
  note: string
  status: OrderStatus
  createdAt: string
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
  createdAt: string
  products?: ProductData[]
  orders?: OrderData[]
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
