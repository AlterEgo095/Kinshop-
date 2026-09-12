import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

const REPORT_STATUSES = ["open", "under_review", "action_required", "resolved", "dismissed"]

// GET /api/admin/reports — Tous les signalements (Super Admin)
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
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

// PATCH /api/admin/reports — Avancer le workflow / clôturer
// Body : { id, status, resolutionNote? } — toute transition est journalisée.
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const status = String(body.status || "")
    const resolutionNote = String(body.resolutionNote || "").slice(0, 500)
    if (!id || !REPORT_STATUSES.includes(status)) {
      return NextResponse.json({ error: "Paramètres requis : id + status valides." }, { status: 400 })
    }

    const report = await db.report.findUnique({ where: { id } })
    if (!report) return NextResponse.json({ error: "Signalement introuvable." }, { status: 404 })

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
