import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, clientIp } from "@/lib/ratelimit"

// POST /api/boost/click — Mesure d'interaction honnête (V10, durcie P6 F6-3)
// Incrémente le compteur de clics d'une campagne ACTIVE uniquement.
//
// P6 F6-3 — le compteur de clics est une métrique de facturation/ROI : il
// était gonflable à volonté (aucune dédup, aucune limite). Désormais :
//  1. rate limit léger par IP (anti-bot grossier) ;
//  2. dédup journalier hash(ip|ua|campagne|jour) via VisitDedup — un même
//     visiteur ne compte qu'UNE fois par campagne et par jour (aucune IP
//     stockée en clair, aucune donnée personnelle).
// La réponse reste toujours { ok: true } silencieuse (fire-and-forget UX).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const id = String(body?.id || "")
    if (!id) return NextResponse.json({ ok: false }, { status: 400 })

    const ip = clientIp(req)
    // 1) Anti-bot grossier : 30 clics / 5 min / IP (navigation réelle : ~1-2 clics)
    if (!rateLimit(`boostclick:${ip}`, 30, 5 * 60 * 1000)) {
      return NextResponse.json({ ok: true })
    }

    const now = new Date()
    const campaign = await db.boostCampaign.findFirst({
      where: { id, status: "active", startAt: { lte: now }, endAt: { gte: now } },
      select: { id: true },
    })
    if (!campaign) return NextResponse.json({ ok: true })

    // 2) Dédup journalier par visiteur (même mécanisme que les visites)
    const day = new Date(now)
    day.setUTCHours(0, 0, 0, 0)
    const ua = (req.headers.get("user-agent") || "").slice(0, 120)
    const dedupKey = createHash("sha256")
      .update(`boostclk|${id}|${ip}|${ua}|${day.toISOString().slice(0, 10)}`)
      .digest("hex")
    let isFirstToday = false
    try {
      await db.visitDedup.create({ data: { key: dedupKey } })
      isFirstToday = true
    } catch {
      isFirstToday = false // déjà compté aujourd'hui pour ce visiteur
    }

    if (isFirstToday) {
      await db.boostCampaign.update({ where: { id }, data: { clicks: { increment: 1 } } })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
