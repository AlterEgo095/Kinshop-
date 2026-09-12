import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/boost/click — Mesure d'interaction honnête (V10)
// Incrémente le compteur de clics d'une campagne ACTIVE uniquement.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ ok: false }, { status: 400 })

    const now = new Date()
    const campaign = await db.boostCampaign.findFirst({
      where: { id, status: "active", startAt: { lte: now }, endAt: { gte: now } },
      select: { id: true },
    })
    if (campaign) {
      await db.boostCampaign.update({ where: { id }, data: { clicks: { increment: 1 } } })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
