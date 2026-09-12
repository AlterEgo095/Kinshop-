import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeImages, slugify } from "@/lib/kinshop"
import { getPlatformSettings } from "@/lib/admin"
import { getUserFromRequest, requireStoreOwner, unauthorized } from "@/lib/auth"
import { getConfigValue } from "@/lib/config-registry"
import { rateLimit } from "@/lib/ratelimit"

// POST /api/stores — Créer une boutique (V8 : compte authentifié OBLIGATOIRE)
// Un utilisateur = une boutique (MAX_STORES_PER_USER). Le propriétaire est lié
// côté serveur à partir de la session — jamais depuis le corps de la requête.
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return unauthorized("Crée un compte ou connecte-toi pour ouvrir ta boutique.")
    }

    // Anti-spam : 3 créations/jour/utilisateur (la règle « 1 boutique » plafonne déjà)
    if (!rateLimit(`store-create:${user.id}`, 3, 24 * 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de créations de boutique. Réessaie demain." },
        { status: 429 },
      )
    }

    const ownedCount = await db.store.count({ where: { ownerId: user.id } })
    // Règle métier dynamique : boutiques max par compte (paramétrable côté admin)
    const maxStores = await getConfigValue<number>("business.maxStoresPerUser")
    if (ownedCount >= Math.max(1, maxStores)) {
      return NextResponse.json(
        { error: "Tu possèdes déjà ta boutique — un compte KinShop correspond à une boutique." },
        { status: 409 },
      )
    }

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
        ownerId: user.id, // ← propriété liée côté serveur (session)
      },
    })

    return NextResponse.json({ store }, { status: 201 })
  } catch (e) {
    console.error("POST /api/stores", e)
    return NextResponse.json({ error: "Erreur serveur lors de la création de la boutique." }, { status: 500 })
  }
}

// GET /api/stores?slug=xxx — Boutique publique avec produits (aucune donnée sensible)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const store = await db.store.findUnique({
      where: { slug },
      include: { products: { orderBy: { createdAt: "desc" } } },
    })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // F-04 (audit Task 19) : boutique SUSPENDUE → AUCUN contenu servi publiquement
    // (produits, premium, taux…). Squelette minimal uniquement : l'UI vitrine
    // affiche l'avis de suspension (store.status === "suspended"), le dashboard
    // propriétaire ne divulgue rien, et les écritures restent bloquées côté
    // requireStoreOwner. L'administration conserve l'accès via ses propres routes.
    if (store.status === "suspended") {
      return NextResponse.json(
        {
          store: {
            slug: store.slug,
            name: store.name,
            logoEmoji: store.logoEmoji,
            status: "suspended",
            products: [],
          },
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    }

    // Réponse publique : masque les champs internes (Chariow, jeton de domaine, owner)
    const { chariowEmail, chariowPhone, chariowSaleId, domainToken, domainVerified, ownerId, ...publicStore } = store
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

// PATCH /api/stores — Mise à jour des réglages (V8 : propriétaire uniquement)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

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
