import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import { normalizeImages, normalizeSpecs, serializeSpecs, MAX_DESCRIPTION_CHARS } from "@/lib/kinshop"

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

// PATCH /api/admin/products — Ajuster stock / prix / présentation commerciale
// Mission Premium : l'administration supervise les contenus produits SANS toucher
// au code — elle peut corriger ou retirer une image, une description ou des
// caractéristiques (dérive de contenu, réclamation, conformité…). Contrairement
// au vendeur, l'admin n'est PAS limitée par les quotas du plan (override métier),
// mais chaque action est scellée dans le journal d'audit (logAdminAction).
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return NextResponse.json({ error: "Produit introuvable." }, { status: 404 })

    const data: Record<string, string | number | null> = {}
    const changes: string[] = []

    if (Number.isFinite(Number(body.stock))) {
      data.stock = Math.max(0, Math.round(Number(body.stock)))
    }
    if (Number(body.priceUSD) > 0) {
      data.priceUSD = Math.round(Number(body.priceUSD) * 100) / 100
    }

    // Mission Premium — présentation commerciale (override admin, hors quotas plan)
    if (Array.isArray(body.images) || typeof body.images === "string") {
      const images = normalizeImages(body.images)
      data.images = JSON.stringify(images)
      data.imageUrl = images[0] || ""
      changes.push(`galerie → ${images.length} photo(s)`)
    }
    if (typeof body.description === "string") {
      const description = body.description.trim()
      if (description.length > MAX_DESCRIPTION_CHARS * 2) {
        return NextResponse.json(
          { error: `Description trop longue (max ${MAX_DESCRIPTION_CHARS * 2} caractères en administration).` },
          { status: 400 },
        )
      }
      data.description = description
      changes.push(description ? `description modifiée (${description.length} car.)` : "description effacée")
    }
    if (Array.isArray(body.specs)) {
      const specs = normalizeSpecs(body.specs)
      data.specs = serializeSpecs(specs)
      changes.push(`${specs.length} caractéristique(s)`)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "Aucune modification valide (stock, priceUSD, images, description, specs)." },
        { status: 400 },
      )
    }

    const updated = await db.product.update({ where: { id }, data })
    await logAdminAction(
      "product.update",
      `product:${product.id}`,
      `Produit « ${product.name} » ajusté (stock: ${updated.stock}, prix: $${updated.priceUSD})` +
        (changes.length ? ` — admin : ${changes.join(", ")}` : ""),
    )

    return NextResponse.json({
      product: {
        ...updated,
        images: normalizeImages(updated.images),
        specs: normalizeSpecs(updated.specs),
      },
    })
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
