import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeImages } from "@/lib/kinshop"

// POST /api/products — Ajouter un produit (avec galerie multi-photos V4)
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

    const store = await db.store.findUnique({ where: { id: storeId } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // V4 — galerie multi-photos (5 max, 1re = principale). Rétrocompat imageUrl.
    const images = normalizeImages(body.images, typeof body.imageUrl === "string" ? body.imageUrl : undefined)

    const product = await db.product.create({
      data: {
        storeId,
        name: name.slice(0, 120),
        emoji: String(body.emoji || "📦").slice(0, 8),
        imageUrl: images[0] || "",
        images: JSON.stringify(images),
        priceUSD,
        category: String(body.category || "Divers").slice(0, 40),
        stock: Number.isInteger(Number(body.stock)) && Number(body.stock) > 0 ? Number(body.stock) : 99,
      },
    })

    return NextResponse.json(
      { product: { ...product, images: normalizeImages(product.images) } },
      { status: 201 },
    )
  } catch (e) {
    console.error("POST /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/products — Modifier un produit (galerie photos, prix, stock…)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = String(body.id || "")
    const storeId = String(body.storeId || "")
    if (!id || !storeId) {
      return NextResponse.json({ error: "id et storeId requis." }, { status: 400 })
    }

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })
    if (product.storeId !== storeId) {
      return NextResponse.json({ error: "Ce produit n'appartient pas à ta boutique." }, { status: 403 })
    }

    const data: Record<string, string | number> = {}

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120)
    if (typeof body.emoji === "string" && body.emoji.trim()) data.emoji = body.emoji.slice(0, 8)
    if (typeof body.category === "string" && body.category.trim()) data.category = body.category.slice(0, 40)
    if (Number(body.priceUSD) > 0) data.priceUSD = Number(body.priceUSD)
    if (Number.isInteger(Number(body.stock)) && Number(body.stock) >= 0) data.stock = Number(body.stock)

    // V4 — galerie : remplacée intégralement si le champ images est fourni
    if (Array.isArray(body.images) || typeof body.images === "string") {
      const images = normalizeImages(body.images)
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

// DELETE /api/products?id=xxx — Supprimer un produit
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
