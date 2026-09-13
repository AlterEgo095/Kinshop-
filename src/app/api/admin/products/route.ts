import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"

// GET /api/admin/products — Tous les produits de la plateforme
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").toLowerCase().trim()
    const storeId = sp.get("storeId") || ""
    const category = sp.get("category") || ""

    const products = await db.product.findMany({
      include: { store: { select: { name: true, slug: true, logoEmoji: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    })

    let list = products
    if (storeId) list = list.filter((p) => p.storeId === storeId)
    if (category) list = list.filter((p) => p.category === category)
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.store.name.toLowerCase().includes(q) ||
          p.store.slug.toLowerCase().includes(q),
      )
    }

    return NextResponse.json({ products: list, total: list.length })
  } catch (e) {
    console.error("GET /api/admin/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/products — Ajuster stock / prix
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    const data: Record<string, number> = {}
    if (Number.isFinite(Number(body.stock))) {
      data.stock = Math.max(0, Math.round(Number(body.stock)))
    }
    if (Number(body.priceUSD) > 0) {
      data.priceUSD = Math.round(Number(body.priceUSD) * 100) / 100
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification valide (stock ou prixUSD)." }, { status: 400 })
    }

    const updated = await db.product.update({ where: { id }, data })
    await logAdminAction(
      "product.update",
      `product:${product.id}`,
      `Produit « ${product.name} » ajusté (stock: ${updated.stock}, prix: $${updated.priceUSD})`,
    )

    return NextResponse.json({ product: updated })
  } catch (e) {
    console.error("PATCH /api/admin/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/admin/products?id=xxx — Supprimer un produit
export async function DELETE(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    await db.product.delete({ where: { id } })
    await logAdminAction("product.delete", `product:${product.id}`, `Suppression du produit « ${product.name} » (boutique ${product.storeId})`)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
