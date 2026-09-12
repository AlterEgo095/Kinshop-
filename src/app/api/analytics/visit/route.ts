import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/analytics/visit — Comptabilise une visite de boutique (V2 stats)
// 1 incrémentation max par navigateur/session (dédupliqué côté client via sessionStorage)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const slug = String(body?.slug || "")
    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { slug }, select: { id: true, status: true } })
    if (!store || store.status !== "active") {
      // Pas d'erreur côté client : une visite d'une boutique suspendue ne compte simplement pas
      return NextResponse.json({ ok: true, counted: false })
    }

    const day = new Date()
    day.setUTCHours(0, 0, 0, 0)

    // V10 — Déduplication visiteur unique : hash(slug|ip|ua|jour), respectueux
    // (aucune adresse IP stockée en clair, aucune donnée personnelle).
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local"
    const ua = (req.headers.get("user-agent") || "").slice(0, 120)
    const dedupKey = createHash("sha256").update(`${slug}|${ip}|${ua}|${day.toISOString().slice(0, 10)}`).digest("hex")
    let isNewVisitor = false
    try {
      await db.visitDedup.create({ data: { key: dedupKey } })
      isNewVisitor = true
    } catch {
      isNewVisitor = false // clé déjà présente : visiteur récurrent
    }

    const existing = await db.storeVisit.findUnique({
      where: { storeId_day: { storeId: store.id, day } },
      select: { id: true },
    })

    if (existing) {
      await db.storeVisit.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, ...(isNewVisitor ? { unique: { increment: 1 } } : {}) },
      })
    } else {
      await db.storeVisit.create({ data: { storeId: store.id, day, count: 1, unique: isNewVisitor ? 1 : 0 } })
    }

    return NextResponse.json({ ok: true, counted: true })
  } catch (e) {
    console.error("POST /api/analytics/visit", e)
    return NextResponse.json({ ok: true, counted: false })
  }
}
