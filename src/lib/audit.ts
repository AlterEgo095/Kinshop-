// KinShop V10 — Journal d'audit GLOBAL (server-only)
// Chaque action critique (admin, vendeur, client, système) laisse une trace :
// qui, quoi, sur quoi, quand, avant→après. Aucune route ne supprime d'entrée.

import { db } from "@/lib/db"

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

/** Journalisation globale — jamais bloquante pour la requête métier. */
export async function logAudit(input: AuditInput): Promise<void> {
  try {
    await db.adminAction.create({
      data: {
        action: input.action.slice(0, 80),
        target: input.target.slice(0, 200),
        detail: (input.detail ?? "").slice(0, 500),
        actorType: input.actorType ?? "system",
        actorId: input.actorId ?? "",
        entityType: input.entityType ?? "",
        entityId: input.entityId ?? "",
      },
    })
  } catch (e) {
    console.error("logAudit", e)
  }
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
