import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/reviews?slug=xxx — Avis publics d'une boutique + statistiques (moyenne, distribution)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const reviews = await db.review.findMany({
      where: { storeId: store.id, hidden: false },
      orderBy: { createdAt: "desc" },
      take: 60,
    })

    // Le vendeur a besoin des avis masqués pour la modération : paramètre all=1
    const all = req.nextUrl.searchParams.get("all") === "1"
    if (all) {
      const allReviews = await db.review.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
      return NextResponse.json({ reviews: allReviews })
    }

    const count = reviews.length
    const avg = count > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0
    const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const r of reviews) {
      const k = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5
      dist[k] += 1
    }

    return NextResponse.json({ reviews, stats: { avg, count, dist } })
  } catch (e) {
    console.error("GET /api/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// POST /api/reviews — Laisser un avis (public). ref optionnelle → badge « Commande vérifiée ».
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    const authorName = String(body.authorName || "").trim()
    const rating = Math.round(Number(body.rating) || 0)
    const comment = String(body.comment || "").trim()
    const ref = String(body.ref || "").trim().toUpperCase()

    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })
    if (authorName.length < 2 || authorName.length > 40) {
      return NextResponse.json({ error: "Ton nom est requis (2 à 40 caractères)." }, { status: 400 })
    }
    if (rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Choisis une note entre 1 et 5 étoiles." }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // Lien optionnel avec une commande réelle de cette boutique (badge vérifié)
    let orderId = ""
    if (ref) {
      const order = await db.order.findFirst({
        where: { storeId: store.id, ref },
        select: { id: true },
      })
      if (!order) {
        return NextResponse.json({ error: `Aucune commande ${ref} trouvée dans cette boutique.` }, { status: 404 })
      }
      const already = await db.review.findFirst({ where: { orderId: order.id } })
      if (already) {
        return NextResponse.json({ error: "Un avis a déjà été laissé pour cette commande." }, { status: 409 })
      }
      orderId = order.id
    }

    const review = await db.review.create({
      data: {
        storeId: store.id,
        orderId,
        authorName: authorName.slice(0, 40),
        rating: Math.min(5, Math.max(1, rating)),
        comment: comment.slice(0, 300),
      },
    })

    return NextResponse.json({ review }, { status: 201 })
  } catch (e) {
    console.error("POST /api/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/reviews — Modération vendeur : masquer / restaurer
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.review.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Avis introuvable." }, { status: 404 })

    const review = await db.review.update({
      where: { id },
      data: { hidden: typeof body.hidden === "boolean" ? body.hidden : !existing.hidden },
    })
    return NextResponse.json({ review })
  } catch (e) {
    console.error("PATCH /api/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/reviews?id=xxx — Supprimer un avis (vendeur)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const existing = await db.review.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: "Avis introuvable." }, { status: 404 })

    await db.review.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/reviews", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
