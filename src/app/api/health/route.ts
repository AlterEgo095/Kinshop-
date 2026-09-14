// GET /api/health — sonde de santé publique (supervision externe, vague 1).
// Aucune donnée sensible : état, uptime, ping base, latence, IP perçue du sondeur
// (utile pour vérifier en continu que la chaîne real_ip Cloudflare → nginx est intègre).
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clientIp } from "@/lib/ratelimit"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const startedAt = Date.now()
  let database: "ok" | "degraded" = "degraded"
  try {
    await db.$queryRaw`SELECT 1`
    database = "ok"
  } catch {
    database = "degraded"
  }

  return NextResponse.json(
    {
      status: database === "ok" ? "ok" : "degraded",
      service: "kinshop",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      database,
      latencyMs: Date.now() - startedAt,
      ip: clientIp(req),
    },
    {
      status: database === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  )
}
