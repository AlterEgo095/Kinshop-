// KinShop × Chariow — Intégration paiement réel
// Chariow : plateforme e-commerce créateurs africains (https://chariow.com)
// Docs API : https://chariow.dev
//
// Configuration (.env) :
//   CHARIOW_API_KEY       → clé sk_live_... (Dashboard Chariow → Settings → API Keys)
//   CHARIOW_PRODUCT_ID    → produit "KinShop Premium" (ex: prd_xxx ou slug)
//   CHARIOW_PULSE_SECRET  → secret webhook whsec_... (Automations → Pulses → Signing secret)
//   APP_URL               → URL publique de l'app (pour redirect_url après paiement)
//
// ⚠️ CONTRAINTE PRODUIT (API publique Chariow) : seuls les produits de type
//   « course », « downloadable », « license » et « bundle » sont payables via
//   POST /v1/checkout. Les types « service »/« coaching » sont REFUSÉS (422).
//   → Les produits de revenus KinShop (Premium, Boost 7 j / 30 j) doivent être
//     créés dans le dashboard Chariow en type Course (ou Downloadable),
//     publiés, puis leurs ID collés dans la console ADMIN → Paiements
//     (paramètres dynamiques `payments.chariowProductId` et
//     `payments.chariowBoost7ProductId` / `payments.chariowBoost30ProductId`,
//     prioritaires sur les variables d'env).
//
// ⚠️ RÈGLE D'ARCHITECTURE (source de vérité — recadrage paiement) :
//   Chariow est le PSP des REVENUS KinShop à PRIX FIXE (Premium, Boost).
//   Les MONTANTS DYNAMIQUES des commandes marketplace ne passent JAMAIS par
//   Chariow (paiement direct vendeur / mobile money / COD) — l'API Chariow
//   n'accepte de toute façon aucun montant (investigation 2026-09-17). Le
//   garde-fou `assertChariowRevenueScope` REFUSE structurellement toute
//   tentative de rattacher une commande à un checkout Chariow.
//
// Kill-switch administrable : `payments.chariowEnabled` (console ADMIN →
// Paiements) coupe le canal complet à chaud — checkout refusé (503), webhook
// sans activation. Aucun redéploiement nécessaire.
//
// Sans CHARIOW_API_KEY, l'app tourne en MODE SIMULATION : le checkout est
// simulé de bout en bout pour tester le parcours sans compte Chariow.

import crypto from "crypto"
import { getConfigValue } from "@/lib/config-registry"

export const CHARIOW_API_URL = "https://api.chariow.com/v1"

export interface ChariowConfig {
  apiKey: string
  productId: string
  pulseSecret: string
  appUrl: string
}

export function getChariowConfig(): ChariowConfig {
  return {
    apiKey: process.env.CHARIOW_API_KEY ?? "",
    productId: process.env.CHARIOW_PRODUCT_ID ?? "",
    pulseSecret: process.env.CHARIOW_PULSE_SECRET ?? "",
    appUrl: process.env.APP_URL ?? "",
  }
}

export function isChariowLive(): boolean {
  const cfg = getChariowConfig()
  return Boolean(cfg.apiKey && cfg.productId)
}

/**
 * ID produit Chariow effectif — résolu DYNAMIQUEMENT :
 * 1. Paramètre console admin `payments.chariowProductId` (prioritaire, sans redéploiement)
 * 2. Variable d'environnement CHARIOW_PRODUCT_ID (fallback)
 */
export async function resolveChariowProductId(): Promise<string> {
  let dynamic = ""
  try {
    dynamic = ((await getConfigValue<string>("payments.chariowProductId")) || "").trim()
  } catch {
    // Configuration indisponible → fallback variable d'env uniquement
  }
  return dynamic || process.env.CHARIOW_PRODUCT_ID?.trim() || ""
}

/**
 * Kill-switch administrable du canal Chariow (console ADMIN → Paiements).
 * Défaut : canal ACTIF. `payments.chariowEnabled = false` suspend le PSP des
 * revenus KinShop à chaud (checkout 503 « suspendu », webhook sans activation)
 * sans redéploiement — maintenance fournisseur, incident, décision business.
 */
export async function isChariowDisabled(): Promise<boolean> {
  try {
    const v = await getConfigValue<boolean>("payments.chariowEnabled")
    return v === false
  } catch {
    return false // config indisponible → canal par défaut = actif
  }
}

/**
 * Mode paiement réel actif ? (clé API .env + produit résolu dynamiquement)
 * Version asynchrone d'isChariowLive — à privilégier dans les routes API.
 * Respecte le kill-switch administrable (canal coupé → non live).
 */
export async function isChariowLiveAsync(): Promise<boolean> {
  if (await isChariowDisabled()) return false
  const cfg = getChariowConfig()
  if (!cfg.apiKey) return false
  return Boolean(await resolveChariowProductId())
}

/**
 * GARDE-FOU ARCHITECTURE — métadonnées interdites : toute clé visant à
 * rattacher une COMMANDE marketplace (montant dynamique) à un checkout Chariow.
 * Le webhook ignore aussi toute livraison en portant une (défense en profondeur).
 */
const FORBIDDEN_ORDER_METADATA_KEYS = new Set([
  "order_ref",
  "order_id",
  "orderref",
  "orderid",
  "amount",
  "montant",
])

/** Renvoie la première clé interdite trouvée (normalisée minuscule), sinon null. */
export function findForbiddenOrderMetadataKey(metadata: Record<string, string>): string | null {
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_ORDER_METADATA_KEYS.has(key.trim().toLowerCase())) return key
  }
  return null
}

/**
 * GARDE-FOU (à appeler à la frontière du PSP, avant tout appel réseau) :
 * REFUSE tout checkout Chariow portant un rattachement de commande. Les
 * commandes marketplace suivent le paiement direct vendeur / mobile money /
 * COD — jamais Chariow (source de vérité, recadrage paiement).
 */
export function assertChariowRevenueScope(metadata: Record<string, string>): void {
  const forbidden = findForbiddenOrderMetadataKey(metadata)
  if (forbidden) {
    throw new Error(
      `GARDE-FOU : Chariow est réservé aux revenus KinShop à prix fixe (Premium, Boost) — ` +
        `les commandes marketplace ne passent JAMAIS par Chariow (clé interdite détectée : "${forbidden}").`,
    )
  }
}

/* ─────────── Phase F — Boost via Chariow (revenus KinShop) ─────────── */
// Le boost est un produit Chariow À PRIX FIXE par palier (7 j / 30 j) —
// exactement comme le Premium. AUCUN montant dynamique de commande
// marketplace ne transite jamais par Chariow (commandes = paiement direct
// vendeur ou COD). Un palier non configuré = repli sur le parcours actuel
// (campagne en attente + activation administration).

/**
 * ID produit Chariow du palier de boost — résolu DYNAMIQUEMENT :
 * 1. Paramètre console admin `payments.chariowBoost7ProductId` /
 *    `payments.chariowBoost30ProductId` (prioritaire, sans redéploiement)
 * 2. Variable d'environnement CHARIOW_BOOST7_PRODUCT_ID /
 *    CHARIOW_BOOST30_PRODUCT_ID (fallback)
 */
export async function resolveChariowBoostProductId(days: 7 | 30): Promise<string> {
  const configKey = days === 7 ? "payments.chariowBoost7ProductId" : "payments.chariowBoost30ProductId"
  const envKey = days === 7 ? "CHARIOW_BOOST7_PRODUCT_ID" : "CHARIOW_BOOST30_PRODUCT_ID"
  let dynamic = ""
  try {
    dynamic = ((await getConfigValue<string>(configKey)) || "").trim()
  } catch {
    // Configuration indisponible → fallback variable d'env uniquement
  }
  return dynamic || process.env[envKey]?.trim() || ""
}

/**
 * Paiement boost via Chariow disponible ? (clé API .env + produit du palier résolu)
 */
export async function isChariowBoostLiveAsync(days: 7 | 30): Promise<boolean> {
  if (await isChariowDisabled()) return false
  const cfg = getChariowConfig()
  if (!cfg.apiKey) return false
  return Boolean(await resolveChariowBoostProductId(days))
}

/* ─────────── Checkout ─────────── */

export interface ChariowCheckoutParams {
  productId: string
  email: string
  firstName: string
  lastName: string
  /** Numéro sans indicatif, chiffres uniquement (ex: 243812345678).
   * Phase F : optionnel — préremplissage pratique du paiement Mobile Money ;
   * si absent, le champ est omis et la page hébergée Chariow le collecte elle-même. */
  phoneDigits?: string
  redirectUrl: string
  customMetadata: Record<string, string>
  paymentCurrency?: string
  customerIp?: string
}

export interface ChariowCheckoutResult {
  step: string
  checkoutUrl: string | null
  transactionId: string | null
  saleId: string | null
  raw: unknown
}

/**
 * Initie une session checkout Chariow.
 * POST https://api.chariow.com/v1/checkout
 * Docs : https://chariow.dev/api-reference/checkout/init-checkout
 */
export async function initiateCheckout(params: ChariowCheckoutParams): Promise<ChariowCheckoutResult> {
  const cfg = getChariowConfig()
  if (!cfg.apiKey) throw new Error("CHARIOW_API_KEY non configurée")

  // custom_metadata : max 10 clés, valeurs ≤ 255 caractères
  const metadata: Record<string, string> = {}
  for (const [k, v] of Object.entries(params.customMetadata).slice(0, 10)) {
    metadata[k] = String(v).slice(0, 255)
  }

  // GARDE-FOU ARCHITECTURE (Phase F) : refuse structurellement tout checkout
  // qui tenterait de rattacher une commande marketplace (montant dynamique).
  assertChariowRevenueScope(metadata)

  const body: Record<string, unknown> = {
    product_id: params.productId,
    email: params.email,
    first_name: params.firstName,
    last_name: params.lastName,
    redirect_url: params.redirectUrl,
    custom_metadata: metadata,
    payment_currency: params.paymentCurrency ?? "USD",
  }
  // Téléphone optionnel (préremplissage MM) — omis si absent (Phase F, boost)
  const phoneDigits = (params.phoneDigits || "").replace(/\D/g, "")
  if (phoneDigits) {
    body.phone = { number: phoneDigits, country_code: "CD" }
  }
  if (params.customerIp) body.customer_ip = params.customerIp

  const res = await fetch(`${CHARIOW_API_URL}/checkout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => null)) as {
    message?: string
    errors?: unknown
    data?: {
      step?: string
      purchase?: { id?: string }
      payment?: { checkout_url?: string | null; transaction_id?: string | null }
    }
  } | null

  if (!res.ok || !json) {
    const detail = json?.message ?? `HTTP ${res.status}`
    // 422 : produit de type « service »/« coaching » — non supporté par l'API
    // publique Chariow. Message actionnable pour l'admin KinShop.
    if (res.status === 422 && /not supported/i.test(detail)) {
      throw new Error(
        "Le produit Chariow configuré est de type « Service/Coaching », non payable via l'API. " +
        "Dans le dashboard Chariow, recrée (ou change) le produit en type « Course » ou « Downloadable », " +
        "publie-le, puis colle son ID dans la console ADMIN → Paiements.",
      )
    }
    if (res.status === 404 || /not found/i.test(detail)) {
      throw new Error(
        "Produit Chariow introuvable ou non publié. Vérifie l'ID (console ADMIN → Paiements) et que le produit est bien publié dans le dashboard Chariow.",
      )
    }
    throw new Error(`Chariow checkout a échoué : ${detail}`)
  }

  return {
    step: json.data?.step ?? "unknown",
    checkoutUrl: json.data?.payment?.checkout_url ?? null,
    transactionId: json.data?.payment?.transaction_id ?? null,
    saleId: json.data?.purchase?.id ?? null,
    raw: json,
  }
}

/* ─────────── Ventes (vérification de paiement) ─────────── */

export interface ChariowSale {
  id: string
  status: string
  paymentStatus: string | null
  completedAt: string | null
  customerEmail: string | null
  productId: string | null
}

interface ChariowSaleRaw {
  id?: string
  status?: string
  completed_at?: string | null
  payment?: { status?: string | null } | null
  customer?: { email?: string | null } | null
  product?: { id?: string | null } | null
}

function mapSale(s: ChariowSaleRaw): ChariowSale {
  return {
    id: String(s.id || ""),
    status: String(s.status || ""),
    paymentStatus: s.payment?.status ?? null,
    completedAt: s.completed_at ?? null,
    customerEmail: (s.customer?.email || "").toLowerCase() || null,
    productId: s.product?.id ?? null,
  }
}

/**
 * Récupère une vente précise — GET /v1/sales/{id}.
 * L'ID provient de checkout (data.purchase.id, format SALE...).
 */
export async function fetchSale(saleId: string): Promise<ChariowSale | null> {
  const cfg = getChariowConfig()
  if (!cfg.apiKey || !saleId) return null
  try {
    const res = await fetch(`${CHARIOW_API_URL}/sales/${encodeURIComponent(saleId)}`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = (await res.json().catch(() => null)) as { data?: ChariowSaleRaw } | null
    return json?.data ? mapSale(json.data) : null
  } catch {
    return null
  }
}

/** Ventes récentes d'un produit — GET /v1/sales?product_id=...&per_page=N */
export async function fetchRecentSales(productId: string, perPage = 20): Promise<ChariowSale[]> {
  const cfg = getChariowConfig()
  if (!cfg.apiKey || !productId) return []
  try {
    const url = `${CHARIOW_API_URL}/sales?per_page=${perPage}&product_id=${encodeURIComponent(productId)}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const json = (await res.json().catch(() => null)) as { data?: ChariowSaleRaw[] } | null
    return (json?.data || []).map(mapSale)
  } catch {
    return []
  }
}

/* ─────────── Webhook (Pulses) ─────────── */

export interface ChariowPulsePayload {
  event: string
  sale?: {
    id?: string
    status?: string
    custom_metadata?: Record<string, string> | null
    completed_at?: string | null
  }
  product?: { id?: string; name?: string; slug?: string }
  customer?: { email?: string; phone?: string; first_name?: string; last_name?: string }
}

/**
 * Vérifie la signature HMAC-SHA256 d'un Pulse Chariow.
 * Le corps brut (avant tout parsing) doit être passé tel quel.
 * Docs : https://chariow.dev/en/guides/pulse-security
 */
export function verifyPulseSignature(rawBody: string, receivedHeader: string | null): boolean {
  const cfg = getChariowConfig()
  if (!cfg.pulseSecret || !receivedHeader) return false
  if (!receivedHeader.startsWith("sha256=")) return false
  const received = receivedHeader.slice("sha256=".length)
  const expected = crypto.createHmac("sha256", cfg.pulseSecret).update(rawBody, "utf8").digest("hex")
  const a = Buffer.from(received, "utf8")
  const b = Buffer.from(expected, "utf8")
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/** Construit l'URL de retour après paiement (hash-routing de l'app) */
export function buildPremiumRedirectUrl(): string {
  const cfg = getChariowConfig()
  const base = cfg.appUrl || "http://localhost:3000"
  return `${base.replace(/\/$/, "")}/#/premium/succes`
}

/**
 * URL de retour après paiement d'un boost (Phase F).
 * Pas de route hash dédiée vendeur : au retour, l'app reboote, la session
 * existante repositionne automatiquement le vendeur sur son dashboard, où la
 * campagne passe à « active » (webhook Pulse, temps réel).
 */
export function buildBoostRedirectUrl(): string {
  const cfg = getChariowConfig()
  const base = cfg.appUrl || "http://localhost:3000"
  return `${base.replace(/\/$/, "")}/`
}
