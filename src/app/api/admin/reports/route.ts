import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import { logAudit } from "@/lib/audit"

const REPORT_STATUSES = ["open", "under_review", "action_required", "resolved", "dismissed"]

// P5 (F5-8) — Graphe de transitions appliqué côté SERVEUR (l'UI ne décide plus) :
// open → under_review | dismissed ; under_review → action_required | resolved | dismissed ;
// action_required → resolved | dismissed ; resolved / dismissed = terminaux.
const REPORT_TRANSITIONS: Record<string, string[]> = {
  open: ["under_review", "dismissed"],
  under_review: ["action_required", "resolved", "dismissed"],
  action_required: ["resolved", "dismissed"],
  resolved: [],
  dismissed: [],
}

// GET /api/admin/reports — Tous les signalements (Super Admin)
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const sp = req.nextUrl.searchParams
    const status = sp.get("status") || ""
    const reports = await db.report.findMany({
      where: status && REPORT_STATUSES.includes(status) ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    })
    const counts = {
      open: await db.report.count({ where: { status: "open" } }),
      under_review: await db.report.count({ where: { status: "under_review" } }),
      action_required: await db.report.count({ where: { status: "action_required" } }),
    }
    return NextResponse.json({ reports, counts })
  } catch (e) {
    console.error("GET /api/admin/reports", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/reports — Avancer le workflow / clôturer / suspendre la cible
// Body : { id, status, resolutionNote?, action? }
// P5 : transitions validées par le graphe serveur (F5-8), note OBLIGATOIRE pour
// clôturer (resolved/dismissed), et passerelle de modération action=suspend_store
// (suspend la boutique ciblée puis passe le signalement en action_required).
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const action = String(body.action || "")
    let resolutionNote = String(body.resolutionNote || "").slice(0, 500)

    if (!id) {
      return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })
    }

    const report = await db.report.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: "Signalement introuvable." }, { status: 404 })

    // ── Passerelle modération : suspendre la boutique ciblée ──
    if (action === "suspend_store") {
      if (report.targetType !== "store") {
        return NextResponse.json(
          { error: "La suspension directe ne s'applique qu'aux signalements de boutique." },
          { status: 400 },
        )
      }
      const store = await db.store.findUnique({ where: { id: report.targetId } })
      if (!store) {
        return NextResponse.json({ error: "Boutique ciblée introuvable." }, { status: 404 })
      }
      if (store.status === "suspended") {
        return NextResponse.json({ error: "Cette boutique est déjà suspendue." }, { status: 409 })
      }
      const note = resolutionNote || "Boutique suspendue suite au signalement."
      await db.$transaction([
        db.store.update({ where: { id: store.id }, data: { status: "suspended" } }),
        db.report.update({
          where: { id },
          data: {
            status: "action_required",
            resolutionNote: note.slice(0, 500),
            handledBy: "Super Admin (console)",
          },
        }),
      ])
      await logAdminAction(
        "store.suspend",
        `store:${store.slug}`,
        `Boutique suspendue depuis le signalement ${report.id} (${report.reason}) — ${note}`,
      )
      await logAdminAction(
        "report.status",
        `report:${id}`,
        `${report.targetType}:${report.targetLabel} — ${report.status} → action_required — ${note}`,
      )
      const updated = await db.report.findUnique({ where: { id } })
      return NextResponse.json({ report: updated, storeSuspended: true })
    }

    // ── Transition de workflow classique ──
    if (!REPORT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Paramètres requis : id + status valides." }, { status: 400 })
    }
    if (status === report.status) {
      return NextResponse.json({ error: "Le signalement est déjà dans cet état." }, { status: 409 })
    }
    if (!(REPORT_TRANSITIONS[report.status] ?? []).includes(status)) {
      return NextResponse.json(
        { error: `Transition interdite : ${report.status} → ${status}.` },
        { status: 400 },
      )
    }
    // P5 (F5-6) — une clôture sans décision écrite est interdite
    if ((status === "resolved" || status === "dismissed") && resolutionNote.trim().length < 4) {
      return NextResponse.json(
        { error: "Une note de résolution est obligatoire pour clôturer un signalement." },
        { status: 400 },
      )
    }

    const updated = await db.report.update({
      where: { id },
      data: { status, resolutionNote, handledBy: "Super Admin (console)" },
    })

    await logAdminAction(
      "report.status",
      `report:${id}`,
      `${report.targetType}:${report.targetLabel} — ${report.status} → ${status}${resolutionNote ? ` — ${resolutionNote}` : ""}`,
    )

    return NextResponse.json({ report: updated })
  } catch (e) {
    console.error("PATCH /api/admin/reports", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
