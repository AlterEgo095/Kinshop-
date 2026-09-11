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
// Sans CHARIOW_API_KEY, l'app tourne en MODE SIMULATION : le checkout est
// simulé de bout en bout pour tester le parcours sans compte Chariow.

import crypto from "crypto"

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

/* ─────────── Checkout ─────────── */

export interface ChariowCheckoutParams {
  productId: string
  email: string
  firstName: string
  lastName: string
  /** Numéro sans indicatif, chiffres uniquement (ex: 243812345678) */
  phoneDigits: string
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

  const body: Record<string, unknown> = {
    product_id: params.productId,
    email: params.email,
    first_name: params.firstName,
    last_name: params.lastName,
    phone: {
      number: params.phoneDigits.replace(/\D/g, ""),
      country_code: "CD",
    },
    redirect_url: params.redirectUrl,
    custom_metadata: metadata,
    payment_currency: params.paymentCurrency ?? "USD",
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
