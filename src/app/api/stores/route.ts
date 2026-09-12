import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeImages, slugify } from "@/lib/kinshop"
import { getPlatformSettings } from "@/lib/admin"

// POST /api/stores — Créer une boutique
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const name = String(body.name || "").trim()
    const ownerName = String(body.ownerName || "").trim()
    const whatsapp = String(body.whatsapp || "").trim()

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Le nom de la boutique est requis (2 caractères min)." }, { status: 400 })
    }
    if (!ownerName) {
      return NextResponse.json({ error: "Le nom du propriétaire est requis." }, { status: 400 })
    }

    const digits = whatsapp.replace(/\D/g, "")
    if (digits.length < 9) {
      return NextResponse.json({ error: "Numéro WhatsApp invalide (ex : 0812345678)." }, { status: 400 })
    }

    // Slug : demandé par l'utilisateur ou dérivé du nom, garanti unique
    let base = slugify(String(body.slug || "")) || slugify(name) || "boutique"
    let slug = base
    let i = 1
    const exists = async (s: string) => (await db.store.findUnique({ where: { slug: s } })) !== null
    while (await exists(slug)) {
      i += 1
      slug = `${base}-${i}`
    }

    // Taux FC par défaut : paramétrable depuis la console admin (PlatformSetting)
    const settings = await getPlatformSettings()

    const store = await db.store.create({
      data: {
        slug,
        name,
        ownerName,
        whatsapp: digits,
        description: String(body.description || "").slice(0, 300),
        city: String(body.city || "Kinshasa"),
        logoEmoji: String(body.logoEmoji || "🛍️").slice(0, 8),
        rateFC: Number(body.rateFC) > 0 ? Number(body.rateFC) : settings.defaultRateFC,
      },
    })

    return NextResponse.json({ store }, { status: 201 })
  } catch (e) {
    console.error("POST /api/stores", e)
    return NextResponse.json({ error: "Erreur serveur lors de la création de la boutique." }, { status: 500 })
  }
}

// GET /api/stores?slug=xxx — Boutique publique avec produits
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({
      where: { slug },
      include: { products: { orderBy: { createdAt: "desc" } } },
    })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // Réponse publique : on masque les champs internes Chariow
    const { chariowEmail, chariowPhone, chariowSaleId, ...publicStore } = store
    return NextResponse.json(
      {
        store: {
          ...publicStore,
          // V4 — galerie multi-photos normalisée (retombe sur imageUrl si vide)
          products: publicStore.products.map((p) => ({ ...p, images: normalizeImages(p.images, p.imageUrl) })),
        },
      },
      // no-store : le taux FC/$ peut être modifié à tout moment par l'admin
      // (synchronisation temps réel) — jamais de réponse périmée côté client.
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/stores", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/stores — Mise à jour des réglages
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const existing = await db.store.findUnique({ where: { slug } })
    if (!existing) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const data: Record<string, string | number> = {}
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim()
    if (typeof body.ownerName === "string" && body.ownerName.trim()) data.ownerName = body.ownerName.trim()
    if (typeof body.description === "string") data.description = body.description.slice(0, 300)
    if (typeof body.city === "string" && body.city.trim()) data.city = body.city.trim()
    if (typeof body.logoEmoji === "string" && body.logoEmoji) data.logoEmoji = body.logoEmoji.slice(0, 8)
    if (typeof body.whatsapp === "string") {
      const digits = body.whatsapp.replace(/\D/g, "")
      if (digits.length >= 9) data.whatsapp = digits
    }
    if (Number(body.rateFC) > 0) data.rateFC = Number(body.rateFC)

    const store = await db.store.update({ where: { slug }, data })
    return NextResponse.json({ store })
  } catch (e) {
    console.error("PATCH /api/stores", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
