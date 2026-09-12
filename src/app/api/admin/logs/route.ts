import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin } from "@/lib/admin"

// GET /api/admin/logs?type=pulse|audit — Journal d'audit GLOBAL (V10)
// Filtres : q (texte), actorType (admin|user|owner|customer|system), action (préfixe),
// entityType (store|product|order|invoice|report|refund|boost|config|auth), limit.
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const type = sp.get("type") || "audit"
    const limit = Math.min(Number(sp.get("limit")) || 80, 500)

    if (type === "pulse") {
      const pulses = await db.pulseDelivery.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      return NextResponse.json({ logs: pulses })
    }

    const where: Record<string, unknown> = {}
    const q = (sp.get("q") || "").toLowerCase().trim()
    const actorType = sp.get("actorType") || ""
    const action = (sp.get("action") || "").toLowerCase().trim()
    const entityType = sp.get("entityType") || ""

    if (actorType) where.actorType = actorType
    if (entityType) where.entityType = entityType
    if (action) where.action = { startsWith: action }
    if (q) {
      where.OR = [
        { target: { contains: q } },
        { detail: { contains: q } },
        { action: { contains: q } },
      ]
    }

    const audit = await db.adminAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return NextResponse.json({ logs: audit })
  } catch (e) {
    console.error("GET /api/admin/logs", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
