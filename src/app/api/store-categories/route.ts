import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { isPremiumActive } from "@/lib/plans"
import { getPlanQuotas } from "@/lib/config-registry"
import { rateLimit, clientIp } from "@/lib/ratelimit"
import { slugify } from "@/lib/kinshop"
import { logAudit } from "@/lib/audit"

// Catégories PROPRES À UNE BOUTIQUE — propriétaire uniquement (V10)
// Anti-abus : quota par plan, déduplication par boutique, longueur bornée,
// noms réservés refusés, rate limit (6/15 min/IP).

const RESERVED_NAMES = new Set(["admin", "kinshop", "kinshop-admin", "tous", "all", "api"])
const NAME_MAX = 40

function cleanName(raw: string): string {
  return String(raw || "").trim().replace(/\s+/g, " ").slice(0, NAME_MAX)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const { store, user } = guard

    // Rate limit anti-spam
    if (!rateLimit(`storecat:${clientIp(req)}`, 20, 15 * 60_000)) {
      return NextResponse.json({ error: "Trop de tentatives — réessaie dans quelques minutes." }, { status: 429 })
    }

    const name = cleanName(body.name)
    if (name.length < 2) return NextResponse.json({ error: "Nom requis (2 caractères min)." }, { status: 400 })
    if (RESERVED_NAMES.has(slugify(name))) {
      return NextResponse.json({ error: "Ce nom est réservé." }, { status: 400 })
    }

    // Quota par plan (côté serveur)
    const plan = isPremiumActive(store) ? "premium" : "free"
    const quotas = await getPlanQuotas(plan)
    const count = await db.storeCategory.count({ where: { storeId: store.id } })
    if (count >= quotas.maxStoreCategories) {
      return NextResponse.json(
        { error: `Limite du plan ${plan === "free" ? "gratuit" : "Premium"} atteinte (${quotas.maxStoreCategories} catégories).`, quota: true },
        { status: 402 },
      )
    }

    // Déduplication par boutique (nom et slug)
    const catSlug = slugify(name)
    if (!catSlug) return NextResponse.json({ error: "Nom invalide." }, { status: 400 })
    const dup = await db.storeCategory.findFirst({
      where: { storeId: store.id, OR: [{ name }, { slug: catSlug }] },
    })
    if (dup) return NextResponse.json({ error: "Cette catégorie existe déjà dans ta boutique." }, { status: 409 })

    // Rattachement optionnel à une catégorie globale (validée)
    let globalCategoryId: string | null = null
    if (body.globalCategoryId) {
      const gc = await db.globalCategory.findUnique({ where: { id: String(body.globalCategoryId) } })
      if (gc && gc.active) globalCategoryId = gc.id
      else return NextResponse.json({ error: "Catégorie globale introuvable." }, { status: 400 })
    }

    const cat = await db.storeCategory.create({
      data: { storeId: store.id, name, slug: catSlug, globalCategoryId, order: count },
    })

    await logAudit({
      action: "category.store.create",
      target: `storeCategory:${cat.id}`,
      detail: `« ${name} » créée dans ${store.name}${globalCategoryId ? " (rattachée à une catégorie globale)" : ""}`,
      actorType: "owner",
      actorId: user.id,
      entityType: "store",
      entityId: store.id,
    })

    return NextResponse.json({ category: cat }, { status: 201 })
  } catch (e) {
    console.error("POST /api/store-categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

    const cat = await db.storeCategory.findUnique({ where: { id } })
    if (!cat) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()
    const guard = await requireStoreOwner(req, { id: cat.storeId })
    if (!guard.ok) return guard.response

    const data: { name?: string; slug?: string; active?: boolean; order?: number; globalCategoryId?: string | null } = {}
    if (body.name !== undefined) {
      const name = cleanName(body.name)
      if (name.length < 2) return NextResponse.json({ error: "Nom requis (2 caractères min)." }, { status: 400 })
      const catSlug = slugify(name)
      const clash = await db.storeCategory.findFirst({
        where: { storeId: cat.storeId, name, NOT: { id } },
      })
      if (clash) return NextResponse.json({ error: "Ce nom est déjà utilisé dans ta boutique." }, { status: 409 })
      data.name = name
      data.slug = catSlug
    }
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.order !== undefined) data.order = Math.max(0, Math.min(999, Number(body.order) || 0))
    if (body.globalCategoryId !== undefined) {
      if (body.globalCategoryId === null || body.globalCategoryId === "") {
        data.globalCategoryId = null
      } else {
        const gc = await db.globalCategory.findUnique({ where: { id: String(body.globalCategoryId) } })
        if (!gc) return NextResponse.json({ error: "Catégorie globale introuvable." }, { status: 400 })
        data.globalCategoryId = gc.id
      }
    }

    const updated = await db.storeCategory.update({ where: { id }, data })
    await logAudit({
      action: "category.store.update",
      target: `storeCategory:${id}`,
      detail: `« ${cat.name} » mise à jour (${Object.keys(data).join(", ")})`,
      actorType: "owner",
      actorId: user.id,
      entityType: "store",
      entityId: cat.storeId,
    })
    return NextResponse.json({ category: updated })
  } catch (e) {
    console.error("PATCH /api/store-categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE : suppression contrôlée. Les produits liés perdent leur catégorie
// structurée (SetNull) mais CONSERVENT leur libellé legacy → aucune perte.
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const cat = await db.storeCategory.findUnique({ where: { id } })
    if (!cat) return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 })

    const user = await getUserFromRequest(req)
    if (!user) return unauthorized()
    const guard = await requireStoreOwner(req, { id: cat.storeId })
    if (!guard.ok) return guard.response

    const productCount = await db.product.count({ where: { storeCategoryId: id } })
    await db.storeCategory.delete({ where: { id } })

    await logAudit({
      action: "category.store.delete",
      target: `storeCategory:${id}`,
      detail: `« ${cat.name} » supprimée (${productCount} produit(s) réassignés au libellé libre)`,
      actorType: "owner",
      actorId: user.id,
      entityType: "store",
      entityId: cat.storeId,
    })

    return NextResponse.json({ ok: true, reassignedProducts: productCount })
  } catch (e) {
    console.error("DELETE /api/store-categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET : catégories de la boutique (avec nombre de produits)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    const cats = await db.storeCategory.findMany({
      where: { storeId: guard.store.id },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { _count: { select: { products: true } } },
    })
    return NextResponse.json({ categories: cats })
  } catch (e) {
    console.error("GET /api/store-categories", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
