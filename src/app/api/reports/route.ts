import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"
import { rateLimit, clientIp } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"
import { REPORT_TARGET_TYPES, REPORT_REASONS } from "@/lib/order-workflow"

// POST /api/reports — Signalement (V10) : boutique / produit / commande / utilisateur
// Comptes authentifiés uniquement (anti-abus) ; rate limit 5/h/IP ; 1 signalement
// ouvert max par cible+compte. Les décisions appartiennent au Super Admin.
export async function POST(req: NextRequest) {
  try {
    if (!(await isFeatureOn("reports"))) {
      return NextResponse.json({ error: "Les signalements sont désactivés pour le moment." }, { status: 403 })
    }

    const body = await req.json()
    const targetType = String(body.targetType || "")
    const targetId = String(body.targetId || "")
    const reason = String(body.reason || "autre")
    const details = String(body.details || "").slice(0, 600)

    if (!REPORT_TARGET_TYPES.includes(targetType as never)) {
      return NextResponse.json({ error: "Type de signalement invalide." }, { status: 400 })
    }
    if (!REPORT_REASONS.includes(reason as never)) {
      return NextResponse.json({ error: "Motif invalide." }, { status: 400 })
    }
    if (!targetId) return NextResponse.json({ error: "Cible requise." }, { status: 400 })
    if (details.length < 10) {
      return NextResponse.json({ error: "Décris le problème en quelques mots (10 caractères min)." }, { status: 400 })
    }

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()

    if (!rateLimit(`report:${clientIp(req)}`, 5, 60 * 60_000)) {
      return NextResponse.json({ error: "Trop de signalements — réessaie plus tard." }, { status: 429 })
    }

    // Résoudre la cible + copie lisible résiliente (le libellé survit à une suppression)
    let targetLabel = ""
    if (targetType === "store") {
      const s = await db.store.findUnique({ where: { id: targetId } })
      if (!s) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })
      targetLabel = s.name
    } else if (targetType === "product") {
      const p = await db.product.findUnique({ where: { id: targetId }, include: { store: true } })
      if (!p) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })
      targetLabel = `${p.name} (${p.store.name})`
    } else if (targetType === "order") {
      const o = await db.order.findUnique({ where: { id: targetId } })
      if (!o) return NextResponse.json({ error: "Commande introuvable." }, { status: 404 })
      targetLabel = o.ref
    } else if (targetType === "user") {
      const u = await db.user.findUnique({ where: { id: targetId } })
      if (!u) return NextResponse.json({ error: "Utilisateur introuvable." }, { status: 404 })
      targetLabel = u.name || u.email
    }

    // 1 signalement ouvert max par compte+cible
    const dup = await db.report.findFirst({
      where: { reporterId: user.id, targetType, targetId, status: { in: ["open", "under_review", "action_required"] } },
    })
    if (dup) {
      return NextResponse.json({ error: "Tu as déjà signalé cet élément — l'équipe l'examine." }, { status: 409 })
    }

    const report = await db.report.create({
      data: {
        targetType,
        targetId,
        targetLabel: targetLabel.slice(0, 120),
        reporterId: user.id,
        reporterLabel: user.name || user.email,
        reason,
        details,
      },
    })

    await logAudit({
      action: "report.created",
      target: `report:${report.id}`,
      detail: `${targetType}:${targetLabel} — motif ${reason} — par ${user.name || user.email}`,
      actorType: "user",
      actorId: user.id,
      entityType: "report",
      entityId: report.id,
    })

    return NextResponse.json({ report }, { status: 201 })
  } catch (e) {
    console.error("POST /api/reports", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
