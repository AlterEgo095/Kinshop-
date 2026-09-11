import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/notifications?slug=xxx&take=50 — Journal des notifications SMS (V2)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { slug }, select: { id: true } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const take = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("take")) || 50))
    const notifications = await db.notificationLog.findMany({
      where: { storeId: store.id },
      orderBy: { createdAt: "desc" },
      take,
    })

    return NextResponse.json({ notifications })
  } catch (e) {
    console.error("GET /api/notifications", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
