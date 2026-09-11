import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/reviews — Tous les avis de la plateforme (modération globale)
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").toLowerCase().trim()
    const storeId = sp.get("storeId") || ""
    const hidden = sp.get("hidden") || "all" // all | hidden | visible

    const reviews = await db.review.findMany({
      include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    })

    let list = reviews
    if (storeId) list = list.filter((r) => r.storeId === storeId)
    if (hidden === "hidden") list = list.filter((r) => r.hidden)
    if (hidden === "visible") list = list.filter((r) => !r.hidden)
    if (q) {
      list = list.filter(
        (r) =>
          r.authorName.toLowerCase().includes(q) ||
          r.comment.toLowerCase().includes(q) ||
          r.store.name.toLowerCase().includes(q) ||
          r.store.slug.toLowerCase().includes(q),
      )
    }

    return NextResponse.json({ reviews: list, total: list.length })
  } catch (e) {
    console.error("GET /api/admin/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/reviews — Modération admin : masquer / restaurer
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.review.findUnique({
      where: { id },
      include: { store: { select: { name: true, slug: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Avis introuvable." }, { status: 404 })

    const nextHidden = typeof body.hidden === "boolean" ? body.hidden : !existing.hidden
    const review = await db.review.update({ where: { id }, data: { hidden: nextHidden } })

    await logAdminAction(
      nextHidden ? "review-hide" : "review-restore",
      `review:${id}`,
      `Avis de « ${existing.authorName} » ${nextHidden ? "masqué" : "restauré"} — boutique ${existing.store.name}`,
    )

    return NextResponse.json({ review })
  } catch (e) {
    console.error("PATCH /api/admin/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/admin/reviews?id=xxx — Supprimer définitivement un avis
export async function DELETE(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.review.findUnique({
      where: { id },
      include: { store: { select: { name: true, slug: true } } },
    })
    if (!existing) return NextResponse.json({ error: "Avis introuvable." }, { status: 404 })

    await db.review.delete({ where: { id } })

    await logAdminAction(
      "review-delete",
      `review:${id}`,
      `Avis de « ${existing.authorName} » supprimé — boutique ${existing.store.name}`,
    )

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
