import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import { slugify } from "@/lib/kinshop"

// Catégories GLOBALES du marketplace — Super Admin uniquement (PIN)
// POST : créer | PATCH : modifier | DELETE : supprimer (référencée = refusé)

function cleanName(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40)
}

export async function POST(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const name = cleanName(body.name)
    const icon = String(body.icon || "📦").slice(0, 8)
    const order = Math.max(0, Math.min(999, Number(body.order) || 0))
    if (name.length < 2) return NextResponse.json({ error: "Nom requis (2 caractères min)." }, { status: 400 })

    const slug = slugify(name)
    if (!slug) return NextResponse.json({ error: "Nom invalide (slug impossible)." }, { status: 400 })

    const exists = await db.globalCategory.findFirst({ where: { OR: [{ name }, { slug }] } })
    if (exists) return NextResponse.json({ error: "Cette catégorie existe déjà (doublon refusé)." }, { status: 409 })

    const cat = await db.globalCategory.create({ data: { name, slug, icon, order } })
    await logAdminAction("category.global.create", `globalCategory:${cat.id}`, `Catégorie globale « ${name} » créée`)
    return NextResponse.json({ category: cat }, { status: 201 })
  } catch (e) {
    console.error("POST /api/admin/categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })
    const cat = await db.globalCategory.findUnique({ where: { id } })
    if (!cat) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 })

    const data: { name?: string; slug?: string; icon?: string; active?: boolean; order?: number } = {}
    if (body.name !== undefined) {
      const name = cleanName(body.name)
      if (name.length < 2) return NextResponse.json({ error: "Nom requis (2 caractères min)." }, { status: 400 })
      const clash = await db.globalCategory.findFirst({ where: { name, NOT: { id } } })
      if (clash) return NextResponse.json({ error: "Ce nom est déjà utilisé." }, { status: 409 })
      data.name = name
      data.slug = slugify(name)
    }
    if (body.icon !== undefined) data.icon = String(body.icon || "📦").slice(0, 8)
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.order !== undefined) data.order = Math.max(0, Math.min(999, Number(body.order) || 0))

    const updated = await db.globalCategory.update({ where: { id }, data })
    await logAdminAction("category.global.update", `globalCategory:${id}`, `« ${cat.name} » mis à jour (${Object.keys(data).join(", ")})`)
    return NextResponse.json({ category: updated })
  } catch (e) {
    console.error("PATCH /api/admin/categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })
    const cat = await db.globalCategory.findUnique({ where: { id } })
    if (!cat) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 })

    // STRATÉGIE DE MIGRATION : une catégorie référencée n'est jamais supprimée
    // en cascade silencieuse — on exige une désactivation ou une réaffectation.
    const linked = await db.storeCategory.count({ where: { globalCategoryId: id } })
    if (linked > 0) {
      return NextResponse.json(
        {
          error: `Impossible de supprimer : ${linked} catégorie(s) de boutique y sont rattachées. Désactive-la (active=false) ou détache-les d'abord.`,
        },
        { status: 409 },
      )
    }

    await db.globalCategory.delete({ where: { id } })
    await logAdminAction("category.global.delete", `globalCategory:${id}`, `« ${cat.name} » supprimée (non référencée)`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET : liste complète (actives + inactives) pour la console
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied
  try {
    const cats = await db.globalCategory.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { _count: { select: { storeCategories: true } } },
    })
    return NextResponse.json({ categories: cats })
  } catch (e) {
    console.error("GET /api/admin/categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
