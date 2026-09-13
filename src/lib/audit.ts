// KinShop V10/P5 — Journal d'audit GLOBAL (server-only)
// Chaque action critique (admin, vendeur, client, système) laisse une trace :
// qui, quoi, sur quoi, quand, avant→après. Aucune route ne supprime d'entrée.
//
// P5 (F5-4) — CHAÎNE D'INTÉGRITÉ : chaque entrée scelle la précédente
// (hash = sha256(prevHash | createdAt | payload)). Toute altération ou
// suppression d'une entrée journalisée casse la chaîne et devient DÉTECTABLE
// via verifyAuditChain(). Les entrées héritées (pré-P5, hash vide) sont
// ignorées par la vérification mais comptabilisées (rétrocompatibilité).
//
// Sérialisation : mutex en-processus (même technique que quota-guard) — la
// topologie PM2 actuelle est un fork mono-processus, donc le mutex est valide.

import { createHash } from "crypto"
import { db } from "@/lib/db"
import { withQuotaLock } from "@/lib/quota-guard"

export type AuditActorType = "admin" | "user" | "owner" | "customer" | "system"

export interface AuditInput {
  action: string // ex. "order.status", "store.created", "refund.executed"
  target: string // libellé lisible ex. "order:CMD-2026-000001"
  detail?: string
  actorType?: AuditActorType
  actorId?: string
  entityType?: string // store | product | order | invoice | report | refund | boost | config | auth
  entityId?: string
}

const AUDIT_CHAIN_LOCK = "audit:chain"

function sliceAudit(input: AuditInput) {
  return {
    action: input.action.slice(0, 80),
    target: input.target.slice(0, 200),
    detail: (input.detail ?? "").slice(0, 500),
    actorType: input.actorType ?? "system",
    actorId: input.actorId ?? "",
    entityType: input.entityType ?? "",
    entityId: input.entityId ?? "",
  }
}

/** Empreinte canonique d'une entrée de journal (payload réellement stocké). */
function computeAuditHash(
  prevHash: string,
  entry: {
    createdAt: Date
    action: string
    target: string
    detail: string
    actorType: string
    actorId: string
    entityType: string
    entityId: string
  },
): string {
  return createHash("sha256")
    .update(
      [
        prevHash,
        entry.createdAt.toISOString(),
        entry.action,
        entry.target,
        entry.detail,
        entry.actorType,
        entry.actorId,
        entry.entityType,
        entry.entityId,
      ].join("|"),
    )
    .digest("hex")
}

/** Journalisation globale — jamais bloquante pour la requête métier. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await withQuotaLock(AUDIT_CHAIN_LOCK, async () => {
      const data = sliceAudit(input)
      const createdAt = new Date()
      // Dernière entrée SCELLÉE (pré-P5 : hash vide, hors chaîne)
      const prev = await db.adminAction.findFirst({
        where: { hash: { not: "" } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { hash: true },
      })
      const prevHash = prev?.hash ?? ""
      const hash = computeAuditHash(prevHash, { ...data, createdAt })
      await db.adminAction.create({ data: { ...data, createdAt, prevHash, hash } })
    })
  } catch (e) {
    console.error("logAudit", e)
  }
}

export interface AuditChainVerdict {
  intact: boolean
  /** Entrées scellées vérifiées */
  checked: number
  /** Entrées héritées (pré-P5, sans empreinte) */
  legacy: number
  brokenAt: { id: string; seq: number; reason: string } | null
}

/**
 * Vérifie l'intégrité de la chaîne d'audit (F5-4) : recalcul de chaque
 * empreinte + contrôle d'enchaînement (prevHash[i] === hash[i-1]).
 * La vérification parcourt les entrées SCELLÉES ; les entrées héritées
 * (hash vide, antérieures à P5) sont comptabilisées mais non vérifiées.
 */
export async function verifyAuditChain(): Promise<AuditChainVerdict> {
  const entries = await db.adminAction.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      action: true,
      target: true,
      detail: true,
      actorType: true,
      actorId: true,
      entityType: true,
      entityId: true,
      prevHash: true,
      hash: true,
    },
  })

  let checked = 0
  let legacy = 0
  let prevHash = ""

  for (const e of entries) {
    if (!e.hash) {
      legacy += 1
      continue
    }
    const seq = checked + 1
    if (e.prevHash !== prevHash) {
      return {
        intact: false,
        checked,
        legacy,
        brokenAt: {
          id: e.id,
          seq,
          reason: "Enchaînement rompu — entrée insérée ou supprimée dans le journal.",
        },
      }
    }
    const expected = computeAuditHash(e.prevHash, e)
    if (expected !== e.hash) {
      return {
        intact: false,
        checked,
        legacy,
        brokenAt: {
          id: e.id,
          seq,
          reason: "Empreinte invalide — contenu de l'entrée altéré après écriture.",
        },
      }
    }
    prevHash = e.hash
    checked += 1
  }

  return { intact: true, checked, legacy, brokenAt: null }
}

/** Helper acteur depuis un utilisateur authentifié. */
export function actorFromUser(
  user: { id: string; name: string; role: string } | null | undefined,
  fallbackType: AuditActorType = "user",
): { actorType: AuditActorType; actorId: string; actorLabel: string } {
  if (!user) return { actorType: "system", actorId: "", actorLabel: "Système" }
  return {
    actorType: fallbackType,
    actorId: user.id,
    actorLabel: user.name || user.id,
  }
}
