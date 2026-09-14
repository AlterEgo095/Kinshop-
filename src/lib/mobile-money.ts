// KinShop V2 — Paiement mobile money des commandes (agrégateur type FlexPay RDC)
// Compatible FlexPay (flexpay.cd) : M-Pesa Vodacom, Airtel Money, Orange Money.
// Mode SIMULATION tant que MOMO_TOKEN + MOMO_MERCHANT sont absents (.env).
// ⚠️ Server-only : à importer uniquement dans les routes API.

export interface MomoConfig {
  apiUrl: string
  token: string
  merchant: string
  callbackToken: string
}

export function getMomoConfig(): MomoConfig | null {
  const token = process.env.MOMO_TOKEN?.trim()
  const merchant = process.env.MOMO_MERCHANT?.trim()
  if (!token || !merchant) return null
  return {
    apiUrl: process.env.MOMO_API_URL?.trim() || "https://backend.flexpay.cd/api/rest/v1/paymentService",
    token,
    merchant,
    callbackToken: process.env.MOMO_CALLBACK_TOKEN?.trim() || "",
  }
}

export function isMomoLive(): boolean {
  return getMomoConfig() !== null
}

export function appPublicUrl(): string {
  return (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "")
}

/**
 * Initie un paiement mobile money : en mode live, l'agrégateur envoie un push USSD
 * sur le téléphone du client qui valide avec son PIN. En mode simulation, aucun
 * appel externe : la confirmation passe par /api/payments/simulate-confirm.
 */
export async function initiateMomoPayment(params: {
  reference: string // notre référence commande (ex: KIN-AB12)
  amountFC: number
  phone: string // numéro payeur format 243xxxxxxxxx
  description: string
}): Promise<{ ok: true; mode: "live" | "simulation"; paymentRef: string } | { ok: false; message: string }> {
  const cfg = getMomoConfig()
  if (!cfg) {
    // Mode simulation — référence lisible pour la démo
    return { ok: true, mode: "simulation", paymentRef: `SIM-${params.reference}` }
  }

  try {
    const res = await fetch(cfg.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        merchant: cfg.merchant,
        type: "1", // push USSD vers le client
        callbackUrl: `${appPublicUrl()}/api/payments/webhook`,
        phone: params.phone,
        amount: String(Math.round(params.amountFC)),
        currency: "CD",
        reference: params.reference,
        description: params.description.slice(0, 100),
      }),
      signal: AbortSignal.timeout(15000),
    })
    const data = (await res.json().catch(() => null)) as { code?: string; message?: string; id?: string } | null
    if (!res.ok || !data) {
      return { ok: false, message: data?.message || `Agrégateur indisponible (HTTP ${res.status}).` }
    }
    // FlexPay : code "0" = push envoyé au client
    if (data.code !== "0") {
      return { ok: false, message: data.message || "Le paiement n'a pas pu être initié." }
    }
    return { ok: true, mode: "live", paymentRef: data.id || `FLEXPAY-${params.reference}` }
  } catch {
    return { ok: false, message: "Impossible de joindre l'agrégateur de paiement. Réessaie dans un instant." }
  }
}

/** Vérifie le token de callback du webhook (si configuré). */
export function isWebhookAuthorized(tokenInBody: string | null, tokenInQuery: string | null): boolean {
  // Vague 1 premium : dès que MOMO_CALLBACK_TOKEN est configuré, il est exigé —
  // y compris en mode simulation. Un webhook de paiement ne doit jamais rester
  // ouvert silencieusement quand un secret a été posé côté serveur.
  const envToken = process.env.MOMO_CALLBACK_TOKEN?.trim()
  if (envToken) return tokenInBody === envToken || tokenInQuery === envToken
  const cfg = getMomoConfig()
  if (!cfg) return true // simulation sans token configuré : webhook ouvert par conception (démo)
  const expected = cfg.callbackToken
  if (!expected) return true // live sans token de callback configuré : on accepte (comportement FlexPay par défaut)
  return tokenInBody === expected || tokenInQuery === expected
}
