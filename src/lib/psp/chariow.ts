// KinShop — Adaptateur Chariow du contrat RevenuePSP (Phase F)
// ⚠️ Server-only. Délègue aux primitives éprouvées de `lib/chariow.ts`
// (signature, checkout, ventes) sans en changer le comportement : les routes
// API actuelles restent branchées directement sur lib/chariow.ts (diff
// minimal) ; cet adaptateur matérialise le contrat d'extension du futur.

import {
  initiateCheckout,
  fetchSale,
  isChariowLiveAsync,
  isChariowDisabled,
  verifyPulseSignature,
  type ChariowSale,
} from "@/lib/chariow"
import type {
  RevenueCheckoutRequest,
  RevenueCheckoutSession,
  RevenuePSP,
  RevenueSale,
} from "."

function mapSale(s: ChariowSale): RevenueSale {
  return {
    id: s.id,
    status: s.status,
    paymentStatus: s.paymentStatus,
    completedAt: s.completedAt,
    customerEmail: s.customerEmail,
    productId: s.productId,
  }
}

export function getChariowRevenuePSP(): RevenuePSP {
  return {
    id: "chariow",
    displayName: "Chariow",
    isLive: () => isChariowLiveAsync(),
    isDisabled: () => isChariowDisabled(),
    async createCheckout(req: RevenueCheckoutRequest): Promise<RevenueCheckoutSession> {
      const result = await initiateCheckout({
        productId: req.productId,
        email: req.email,
        firstName: req.firstName,
        lastName: req.lastName,
        phoneDigits: req.phoneDigits,
        redirectUrl: req.redirectUrl,
        // Le garde-fou `assertChariowRevenueScope` est appliqué dans
        // initiateCheckout : toute métadonnée de commande marketplace est
        // refusée (règle 1 du contrat).
        customMetadata: req.metadata,
        paymentCurrency: req.paymentCurrency,
        customerIp: req.customerIp,
      })
      return { url: result.checkoutUrl, saleId: result.saleId, transactionId: result.transactionId }
    },
    async fetchSale(saleId: string): Promise<RevenueSale | null> {
      const s = await fetchSale(saleId)
      return s ? mapSale(s) : null
    },
    verifyWebhookSignature: (rawBody, signatureHeader) =>
      verifyPulseSignature(rawBody, signatureHeader),
  }
}
