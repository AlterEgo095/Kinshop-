import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/products — Ajouter un produit
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

    const product = await db.product.create({
      data: {
        storeId,
        name: name.slice(0, 120),
        emoji: String(body.emoji || "📦").slice(0, 8),
        imageUrl: String(body.imageUrl || "").slice(0, 500),
        priceUSD,
        category: String(body.category || "Divers").slice(0, 40),
        stock: Number.isInteger(Number(body.stock)) && Number(body.stock) > 0 ? Number(body.stock) : 99,
      },
    })

    return NextResponse.json({ product }, { status: 201 })
  } catch (e) {
    console.error("POST /api/products", e)
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
