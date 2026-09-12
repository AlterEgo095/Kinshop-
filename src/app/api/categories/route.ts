import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/categories?slug=xxx — Catégories du marketplace (V10, public)
// - global : catégories GLOBALES du Super Admin (navigation marketplace)
// - store  : catégories PROPRES à la boutique ?slug= (gérées par le propriétaire)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")

    const global = await db.globalCategory.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, icon: true, order: true },
    })

    let store: { id: string; name: string; slug: string; globalCategoryId: string | null }[] = []
    if (slug) {
      const s = await db.store.findUnique({ where: { slug }, select: { id: true } })
      if (s) {
        store = await db.storeCategory.findMany({
          where: { storeId: s.id, active: true },
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: { id: true, name: true, slug: true, globalCategoryId: true },
        })
      }
    }

    return NextResponse.json(
      { global, store },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
