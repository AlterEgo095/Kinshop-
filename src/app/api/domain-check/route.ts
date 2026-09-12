import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeDomain } from "@/lib/domain"

// GET /api/domain-check?domain=xxx — endpoint « ask » pour le TLS à la demande (Caddy on_demand_tls).
// Répond 200 si le domaine est celui d'une boutique vérifiée (certificat autorisé), 403 sinon.
// Aucune donnée retournée : endpoint minimal, résistant au scan.
export async function GET(req: NextRequest) {
  const asked =
    req.nextUrl.searchParams.get("domain") ||
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  const domain = normalizeDomain(asked)
  if (!domain) return new NextResponse(null, { status: 403 })

  try {
    const store = await db.store.findFirst({
      where: { customDomain: domain, domainVerified: true },
      select: { id: true },
    })
    return new NextResponse(null, { status: store ? 200 : 403 })
  } catch (e) {
    console.error("GET /api/domain-check", e)
    return new NextResponse(null, { status: 403 })
  }
}
