// P6 (audit marketplace) — Boost : expiration paresseuse + dédup des métriques.
//
// F6-1 — Les campagnes n'étaient JAMAIS transitionnées en DB : une campagne
// « active » dont endAt est dépassé restait active à vie (et une
// pending_payment jamais payée aussi). Avec boost.maxActivePerStore = 1, le
// propriétaire était bloqué POUR TOUJOURS dès sa première campagne expirée
// (« Tu as déjà 1 campagne(s) en cours »), l'admin voyait des actives
// fantômes, et le GET owner affichait une campagne périmée comme active.
//
// Stratégie : expiration PARESSEUSE (SQLite, mono-processus PM2) — chaque
// route qui lit/écrit des campagnes purge d'abord les statuts périmés.
// Aucun cron nécessaire, aucun état résiduel observable. Best effort :
// une expiration manquée ne bloque jamais la route appelante.

import { db } from "@/lib/db"

export const BOOST_STALE_PENDING_MS = 7 * 24 * 60 * 60 * 1000 // pending non payée > 7 j

/**
 * Expirations paresseuses :
 *  - active dont endAt est passé        → ended   (fin naturelle)
 *  - pending_payment de plus de 7 jours → expired (paiement jamais venu)
 * @param storeId limiter à une boutique (sinon toute la plateforme)
 */
export async function expireDueCampaigns(storeId?: string): Promise<void> {
  const now = new Date()
  const stalePendingBefore = new Date(now.getTime() - BOOST_STALE_PENDING_MS)
  const where = storeId ? { storeId } : {}
  try {
    await db.boostCampaign.updateMany({
      where: { ...where, status: "active", endAt: { lt: now } },
      data: { status: "ended" },
    })
    await db.boostCampaign.updateMany({
      where: { ...where, status: "pending_payment", createdAt: { lt: stalePendingBefore } },
      data: { status: "expired" },
    })
  } catch {
    // best effort
  }
}
