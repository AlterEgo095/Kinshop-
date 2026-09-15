// POST /api/csp-report — récepteur des violations CSP (vague 2).
// La politique est déployée en Report-Only côté nginx : les navigateurs
// rapportent ici ce qu'ils AURAIENT bloqué. Objectif : observer la réalité du
// trafic (scripts tiers, styles inline, connexions sortantes) pour durcir la
// politique progressivement SANS casser la production.
// Volontairement muet : 204 toujours, journalisation throttlée (max 1 ligne / 5 s)
// pour ne pas inonder les logs PM2 en cas de violation en boucle.

import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

let lastLogAt = 0

export async function POST(req: NextRequest) {
  try {
    const raw = await req.text()
    const now = Date.now()
    if (now - lastLogAt > 5000 && raw.length > 0 && raw.length < 4000) {
      lastLogAt = now
      console.log("[csp-report]", raw.slice(0, 800))
    }
  } catch {
    // Corps illisible : on ignore silencieusement — récepteur passif.
  }
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  })
}
