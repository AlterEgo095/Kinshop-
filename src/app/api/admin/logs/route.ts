import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin } from "@/lib/admin"

// GET /api/admin/logs?type=pulse|audit — Journaux (webhooks Chariow + audit admin)
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const type = req.nextUrl.searchParams.get("type") || "audit"
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 50, 200)

    if (type === "pulse") {
      const pulses = await db.pulseDelivery.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      })
      return NextResponse.json({ logs: pulses })
    }

    const audit = await db.adminAction.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    })
    return NextResponse.json({ logs: audit })
  } catch (e) {
    console.error("GET /api/admin/logs", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
