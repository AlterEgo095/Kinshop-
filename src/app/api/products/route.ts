import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeImages } from "@/lib/kinshop"
import { requireStoreOwner, quotaExceeded } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas } from "@/lib/config-registry"
import { withStoreQuotaWrite } from "@/lib/quota-guard"

// POST /api/products — Ajouter un produit (V8 : propriétaire + quota du plan)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const storeId = String(body.storeId || "")
    const name = String(body.name || "").trim()

    if (!storeId) return NextResponse.json({ error: "storeId requis." }, { status: 400 })
    if (!name) return NextResponse.json({ error: "Le nom du produit est requis." }, { status: 400 })

    const priceUSD = Number(body.priceUSD)
    if (!priceUSD || priceUSD <= 0) {
      return NextResponse.json({ error: "Le prix (USD) doit être supérieur à 0." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { id: storeId })
    if (!guard.ok) return guard.response
    const { store } = guard
    const plan = planOf(store)
    // Quotas dynamiques (paramétrables dans la console admin → appliqués côté serveur)
    const quotas = await getPlanQuotas(plan.id)

    // ── Quota produits (pré-check UX — la vérification FAIS FOI est atomique ci-dessous) ──
    const count = await db.product.count({ where: { storeId: store.id } })
    if (count >= quotas.maxProducts) {
      return quotaExceeded(
        plan.id === "free"
          ? `Limite du plan Free atteinte (${quotas.maxProducts} produits). Passe Premium pour en ajouter davantage.`
          : `Limite de ${quotas.maxProducts} produits atteinte.`,
      )
    }

    // V4 — galerie multi-photos (limite plan dynamique, 1re = principale). Rétrocompat imageUrl.
    const images = normalizeImages(body.images, typeof body.imageUrl === "string" ? body.imageUrl : undefined)
    if (images.length > quotas.maxProductImages) {
      return quotaExceeded(
        plan.id === "free"
          ? `Le plan Free autorise ${quotas.maxProductImages} seule photo par produit — passe Premium pour les galeries.`
          : `Maximum ${quotas.maxProductImages} photos par produit.`,
      )
    }

    // V10 — catégorie de boutique optionnelle : l'ID doit appartenir à CETTE boutique
    let storeCategoryId: string | undefined
    if (body.storeCategoryId) {
      const cat = await db.storeCategory.findFirst({
        where: { id: String(body.storeCategoryId), storeId: store.id },
      })
      if (!cat) {
        return NextResponse.json({ error: "Catégorie de boutique invalide." }, { status: 400 })
      }
      storeCategoryId = cat.id
    }

    // F-07 (audit) — création atomique : le quota est revérifié DANS la même
    // transaction que le create (mutex boutique + transaction Prisma) — deux
    // requêtes concurrentes ne peuvent plus dépasser le quota du plan.
    const result = await withStoreQuotaWrite(store.id, async (tx) => {
      const n = await tx.product.count({ where: { storeId: store.id } })
      if (n >= quotas.maxProducts) return { overQuota: true as const, product: null }
      const product = await tx.product.create({
        data: {
          storeId,
          name: name.slice(0, 120),
          emoji: String(body.emoji || "📦").slice(0, 8),
          imageUrl: images[0] || "",
          images: JSON.stringify(images),
          priceUSD,
          category: String(body.category || "Divers").slice(0, 40),
          stock: Number.isInteger(Number(body.stock)) && Number(body.stock) > 0 ? Number(body.stock) : 99,
          // V10 — catégorie de boutique (validée : appartient bien à CETTE boutique)
          ...(storeCategoryId ? { storeCategoryId } : {}),
        },
      })
      return { overQuota: false as const, product }
    })
    if (result.overQuota) {
      return quotaExceeded(
        plan.id === "free"
          ? `Limite du plan Free atteinte (${quotas.maxProducts} produits). Passe Premium pour en ajouter davantage.`
          : `Limite de ${quotas.maxProducts} produits atteinte.`,
      )
    }
    const product = result.product

    return NextResponse.json(
      { product: { ...product, images: normalizeImages(product.images) } },
      { status: 201 },
    )
  } catch (e) {
    console.error("POST /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/products — Modifier un produit (V8 : propriété dérivée du produit,
// le storeId fourni par le client est ignoré → anti-IDOR)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    // La propriété se vérifie depuis la boutique qui possède le produit (serveur),
    // jamais depuis le storeId envoyé par le client.
    const guard = await requireStoreOwner(req, { id: product.storeId })
    if (!guard.ok) return guard.response
    const plan = planOf(guard.store)
    const quotas = await getPlanQuotas(plan.id)

    const data: Record<string, string | number | null> = {}

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120)
    if (typeof body.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.slice(0, 8)
    if (typeof body.category === "string" && body.category.trim()) data.category = body.category.slice(0, 40)
    // V10 — catégorie de boutique (validée contre la boutique du produit) / détachement si null
    if (body.storeCategoryId !== undefined) {
      if (body.storeCategoryId === null || body.storeCategoryId === "") {
        data.storeCategoryId = null
      } else {
        const cat = await db.storeCategory.findFirst({
          where: { id: String(body.storeCategoryId), storeId: product.storeId },
        })
        if (!cat) {
          return NextResponse.json({ error: "Catégorie de boutique invalide." }, { status: 400 })
        }
        data.storeCategoryId = cat.id
      }
    }
    if (Number(body.priceUSD) > 0) data.priceUSD = Number(body.priceUSD)
    if (Number.isInteger(Number(body.stock)) && Number(body.stock) >= 0) data.stock = Number(body.stock)

    // V4 — galerie : remplacée intégralement si le champ images est fourni (quota plan)
    if (Array.isArray(body.images) || typeof body.images === "string") {
      const images = normalizeImages(body.images)
      if (images.length > quotas.maxProductImages) {
        return quotaExceeded(
          plan.id === "free"
            ? `Le plan Free autorise ${quotas.maxProductImages} seule photo par produit — passe Premium pour les galeries.`
            : `Maximum ${quotas.maxProductImages} photos par produit.`,
        )
      }
      data.images = JSON.stringify(images)
      data.imageUrl = images[0] || ""
    }

    const updated = await db.product.update({ where: { id }, data })
    return NextResponse.json({ product: { ...updated, images: normalizeImages(updated.images) } })
  } catch (e) {
    console.error("PATCH /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/products?id=xxx — Supprimer un produit (V8 : propriétaire uniquement)
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: product.storeId })
    if (!guard.ok) return guard.response

    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
