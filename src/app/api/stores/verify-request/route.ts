// POST /api/stores/verify-request — Demande de vérification du propriétaire (P5, F5-2)
//
// Le workflow de vérification était jusqu'ici réservé à l'admin (PATCH
// /api/admin/stores action=verify) SANS aucun moyen pour le propriétaire de
// se manifester : le statut restait figé sur unverified. Cette route ouvre le
// circuit : owner (boutique active) → verificationStatus = pending → l'admin
// tranche (verified / rejected) depuis la console.
//
// Garde-fous : propriétaire authentifié (anti-IDOR), boutique ACTIVE, une
// seule demande en cours, cooldown anti-spam gouvernance.verificationCooldownDays.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner } from "@/lib/auth"
import { getConfigValue } from "@/lib/config-registry"
import { logAudit } from "@/lib/audit"
import { rateLimit } from "@/lib/ratelimit"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const slug = String(body.slug || "")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const { user, store } = guard

    if (store.verificationStatus === "verified") {
      return NextResponse.json({ error: "Cette boutique est déjà vérifiée." }, { status: 409 })
    }
    if (store.verificationStatus === "pending") {
      return NextResponse.json(
        { error: "Ta demande de vérification est déjà en cours d'examen." },
        { status: 409 },
      )
    }

    // Anti-spam : cooldown entre deux demandes (paramétrable console admin)
    const cooldownDays = await getConfigValue<number>("governance.verificationCooldownDays")
    if (store.verificationRequestedAt && cooldownDays > 0) {
      const elapsed = Date.now() - new Date(store.verificationRequestedAt).getTime()
      const waitMs = cooldownDays * 24 * 60 * 60 * 1000
      if (elapsed < waitMs) {
        const daysLeft = Math.ceil((waitMs - elapsed) / (24 * 60 * 60 * 1000))
        return NextResponse.json(
          {
            error: `Une demande de vérification a déjà été envoyée — réessaie dans ${daysLeft} jour(s).`,
          },
          { status: 429 },
        )
      }
    }

    // Anti-abus : 3 demandes / 24 h / compte (ceinture + bretelles)
    if (!rateLimit(`verify-req:${user.id}`, 3, 24 * 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de demandes de vérification. Réessaie demain." },
        { status: 429 },
      )
    }

    const updated = await db.store.update({
      where: { id: store.id },
      data: { verificationStatus: "pending", verificationRequestedAt: new Date() },
    })

    await logAudit({
      action: "store.verify_requested",
      target: `store:${store.slug}`,
      detail: `Demande de vérification envoyée par ${user.name || user.email}`,
      actorType: "owner",
      actorId: user.id,
      entityType: "store",
      entityId: store.id,
    })

    return NextResponse.json({
      ok: true,
      verificationStatus: updated.verificationStatus,
      verificationRequestedAt: updated.verificationRequestedAt,
    })
  } catch (e) {
    console.error("POST /api/stores/verify-request", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
