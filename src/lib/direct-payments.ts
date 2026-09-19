// KinShop — Paiement direct vendeur (Phase C — P1 + P8)  ⚠️ Server-only
//
// PRINCIPE (prompt §12/§15, plan de correction P1/P8) :
// - Le vendeur renseigne ses coordonnées d'encaissement Mobile Money par moyen
//   (nom du titulaire, numéro, réseau, instructions libres) dans Store.paymentSettings.
// - À la création de chaque commande mobile money, le serveur copie les
//   coordonnées actives dans un SNAPSHOT immuable lié à la commande
//   (OrderPaymentInstruction) — une commande historique conserve à jamais les
//   coordonnées utilisées au moment de sa création.
// - P8 — expiration paresseuse : une déclaration (paymentStatus = declared)
//   jamais confirmée au-delà du délai configuré repasse en failed avec un
//   événement payment_failed explicite, aux points de lecture existants
//   (pattern éprouvé des boosts / purges de campagnes périmées).

import { db } from "@/lib/db"
import { getConfigValue } from "@/lib/config-registry"
import { logAudit } from "@/lib/audit"

/* ─────────── Coordonnées de paiement du vendeur ─────────── */

export const DIRECT_PROVIDERS = ["mpesa", "airtel", "orange"] as const
export type DirectProvider = (typeof DIRECT_PROVIDERS)[number]

export interface DirectPaymentSetting {
  provider: DirectProvider
  accountName: string
  accountNumber: string
  network: string
  instructions: string
  active: boolean
}

/** Réseau opérateur attendu pour un moyen (cohérence d'affichage du snapshot). */
export function defaultNetwork(provider: string): string {
  switch (provider) {
    case "mpesa":
      return "vodacom"
    case "airtel":
      return "airtel"
    case "orange":
      return "orange"
    default:
      return ""
  }
}

/** Parse + valide la liste JSON stockée sur la boutique (jamais trustée). */
export function parseStorePaymentSettings(raw: string | null | undefined): DirectPaymentSetting[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: DirectPaymentSetting[] = []
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue
    const e = entry as Record<string, unknown>
    const provider = String(e.provider || "")
    if (!(DIRECT_PROVIDERS as readonly string[]).includes(provider)) continue
    const accountNumber = String(e.accountNumber || "").replace(/[^\d+]/g, "").slice(0, 20)
    // Une entrée sans numéro valide n'est pas utilisable : ignorée (tolérance).
    if (!accountNumber) continue
    out.push({
      provider: provider as DirectProvider,
      accountName: String(e.accountName || "").slice(0, 60),
      accountNumber,
      network: String(e.network || "").slice(0, 20) || defaultNetwork(provider),
      instructions: String(e.instructions || "").slice(0, 200),
      active: e.active !== false,
    })
  }
  return out
}

/** Coordonnées actives pour un moyen donné (null si non configurées). */
export function getActiveInstruction(
  rawSettings: string | null | undefined,
  method: string,
): DirectPaymentSetting | null {
  const settings = parseStorePaymentSettings(rawSettings)
  return settings.find((s) => s.provider === method && s.active) ?? null
}

/* ─────────── P8 — Expiration paresseuse des déclarations ─────────── */

interface ExpirableOrder {
  id: string
  ref: string
  paymentMethod: string
  paymentStatus: string
  status: string
  declaredAt: Date | null
}

/**
 * Applique l'expiration paresseuse à une liste d'ordres déjà chargés :
 * toute commande `declared` dont declaredAt + délai configuré est dépassé
 * repasse en `failed` (événement payment_failed explicite, journal d'audit).
 * - Ne touche JAMAIS une commande payée/refundée/cash ni les commandes cash.
 * - Garde atomique : updateMany conditionnel { id, paymentStatus: "declared" }
 *   (anti-double-traitement si deux lectures concurrentes expirent la même
 *   commande — le second updateMany ne matche rien et n'écrit pas d'événement).
 * - Retourne la liste enrichie des statuts corrigés (aucun re-fetch nécessaire).
 * - délai = 0 → expiration désactivée (clé administrable, défaut 24 h).
 */
export async function expireOverdueDeclarations<T extends ExpirableOrder>(orders: T[]): Promise<T[]> {
  const timeoutHours = await getConfigValue<number>("business.paymentDeclarationTimeoutHours")
  if (!timeoutHours || timeoutHours <= 0) return orders

  const now = Date.now()
  const deadlineMs = timeoutHours * 60 * 60 * 1000

  for (const order of orders) {
    if (order.paymentStatus !== "declared") continue
    if (!order.declaredAt) continue
    if (order.paymentMethod === "cash") continue
    if (["cancelled", "returned", "refunded", "disputed"].includes(order.status)) continue
    if (now - order.declaredAt.getTime() < deadlineMs) continue

    // Transition atomique declared → failed (garde sur le statut d'origine)
    const updated = await db.order.updateMany({
      where: { id: order.id, paymentStatus: "declared" },
      data: { paymentStatus: "failed" },
    })
    if (updated.count === 0) continue // déjà traitée par une lecture concurrente

    await db.orderEvent.create({
      data: {
        orderId: order.id,
        type: "payment_failed",
        actorType: "system",
        actorId: "",
        actorLabel: "KinShop",
        oldValue: "declared",
        newValue: "failed",
        reason: `Délai de confirmation dépassé (${timeoutHours} h) — l'acheteur peut redéclarer son paiement, le vendeur peut toujours confirmer si l'argent est arrivé.`,
      },
    })
    await logAudit({
      action: "order.payment_declaration_expired",
      target: `order:${order.ref}`,
      detail: `Déclaration de paiement expirée après ${timeoutHours} h — declared → failed`,
      actorType: "system",
      entityType: "order",
      entityId: order.id,
    })

    // Reflet local (pas de re-fetch) : l'appelant renvoie des données à jour
    order.paymentStatus = "failed"
  }

  return orders
}
