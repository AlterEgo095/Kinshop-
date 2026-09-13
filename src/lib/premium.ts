// KinShop — Vérification & activation du Premium (paiement réel Chariow)
// ⚠️ Server-only : à importer uniquement dans les routes API.
//
// TROIS chemins mènent à l'activation du Premium (tous serveur, tous idempotents) :
//   1. Webhook Chariow (Pulse successful.sale) — instantané, nécessite
//      CHARIOW_PULSE_SECRET dans .env + configuration du Pulse côté dashboard.
//   2. Vérification à la demande (POST /api/premium/verify + page de retour) :
//      interroge l'API Chariow (ventes récentes du produit + vente explicite),
//      croise l'email client avec celui de la boutique, puis active.
//   3. Pré-check au checkout (POST /api/premium/checkout) : avant de créer une
//      nouvelle session, détecte une vente déjà payée non encore appliquée —
//      couvre le cas « popup fermée avant la page de retour ».
//
// SÉCURITÉ : l'activation n'est JAMAIS déclenchée par le client. Le client ne
// fournit au mieux qu'un indice (saleId) ; le serveur revalide toujours le
// statut réel de la vente auprès de l'API Chariow + l'appartenance
// (email client = email de facturation de la boutique) + l'idempotence
// (chariowSaleId déjà appliqué → ignoré).

import { db } from "@/lib/db"
import {
  fetchRecentSales,
  fetchSale,
  getChariowConfig,
  resolveChariowProductId,
  type ChariowSale,
} from "@/lib/chariow"

export const PREMIUM_DAYS = 30

/** Vente considérée « payée » : statut completed (vente OU paiement). */
function saleIsCompleted(s: ChariowSale): boolean {
  return s.status === "completed" || s.paymentStatus === "completed"
}

export interface PremiumVerificationInput {
  id: string
  slug: string
  chariowEmail: string | null
  chariowSaleId: string | null
  isPremium: boolean
  premiumUntil: Date | null
}

export interface PremiumVerificationResult {
  activated: boolean
  saleId?: string
  reason?: "not_live" | "no_sale" | "email_mismatch" | "already_applied" | "too_old"
}

/**
 * Cherche une vente Chariow payée, non encore appliquée, correspondant à la
 * boutique (produit configuré + email de facturation), et active le Premium.
 * - hintSaleId : indice client (optionnel, revalidé serveur).
 * - windowMs   : fenêtre de fraîcheur pour les ventes trouvées par listing.
 */
export async function verifyAndApplyPremium(
  store: PremiumVerificationInput,
  hintSaleId?: string,
  windowMs = 48 * 60 * 60 * 1000,
): Promise<PremiumVerificationResult> {
  const cfg = getChariowConfig()
  const productId = await resolveChariowProductId()
  if (!cfg.apiKey || !productId) return { activated: false, reason: "not_live" }

  const email = (store.chariowEmail || "").toLowerCase()
  if (!email) return { activated: false, reason: "email_mismatch" }

  // Candidats : vente explicite (indice) + ventes récentes du produit
  const candidates: ChariowSale[] = []
  if (hintSaleId) {
    const direct = await fetchSale(hintSaleId)
    if (direct) candidates.push(direct)
  }
  for (const s of await fetchRecentSales(productId, 20)) {
    if (!candidates.some((c) => c.id === s.id)) candidates.push(s)
  }

  const now = Date.now()
  for (const s of candidates) {
    if (!s.id || s.id === store.chariowSaleId) continue // déjà appliquée / invalide
    if (!saleIsCompleted(s)) continue // non payée (pending, abandoned, cancelled…)
    if (s.productId && s.productId !== productId) continue // autre produit
    if (s.customerEmail !== email) continue // autre client
    if (s.completedAt && now - new Date(s.completedAt).getTime() > windowMs) continue // trop ancienne
    if (!s.completedAt && hintSaleId !== s.id) continue // listing sans date → exige l'indice précis

    // Idempotence course : on ne réapplique JAMAIS la même vente
    // (chariowSaleId est String @default("") — NON nullable : la branche
    // « pas encore de vente enregistrée » filtre sur la chaîne vide, et le
    // `not` couvre tout id différent ; en SQL, NULL <> valeur n'existant pas
    // ici, une vente déjà appliquée est exclue par le not)
    const updated = await db.store.updateMany({
      where: {
        id: store.id,
        OR: [{ chariowSaleId: "" }, { chariowSaleId: { not: s.id } }],
      },
      data: {
        isPremium: true,
        premiumUntil: new Date(
          (store.premiumUntil && store.premiumUntil.getTime() > now
            ? store.premiumUntil.getTime()
            : now) +
            PREMIUM_DAYS * 24 * 60 * 60 * 1000,
        ),
        chariowSaleId: s.id,
      },
    })
    if (updated.count === 0) return { activated: false, saleId: s.id, reason: "already_applied" }
    return { activated: true, saleId: s.id }
  }

  return { activated: false, reason: "no_sale" }
}
