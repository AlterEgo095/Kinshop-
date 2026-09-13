// GET /api/reports/mine — Suivi des signalements du compte (P5, F5-6)
// Le rapporteur voit l'état d'avancement de SES signalements (statut + note
// de résolution). Aucun signalement d'autrui n'est exposé.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, unauthorized } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()

    const reports = await db.report.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        targetType: true,
        targetLabel: true,
        reason: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ reports })
  } catch (e) {
    console.error("GET /api/reports/mine", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
