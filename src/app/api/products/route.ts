import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { normalizeImages, normalizeSpecs, serializeSpecs } from "@/lib/kinshop"
import { requireStoreOwner, quotaExceeded } from "@/lib/auth"
import { planOf } from "@/lib/plans"
import { getPlanQuotas } from "@/lib/config-registry"
import { withStoreQuotaWrite } from "@/lib/quota-guard"

// Mission Premium — messages de verrouillage (affichés tels quels à l'utilisateur)
const DESC_LOCKED =
  "La description produit détaillée est une fonctionnalité Premium — active ton abonnement pour présenter tes produits comme un pro."
const SPECS_LOCKED =
  "Les caractéristiques structurées (dimensions, avantages, variantes…) sont une fonctionnalité Premium — active ton abonnement pour les débloquer."

// Mission abonnement — la GESTION du catalogue (édition, suppression) fait partie
// de la proposition de valeur Premium : un plan Free peut créer et vendre, mais
// ajuster ou retirer une fiche exige un abonnement actif (402 + message clair).
// L'administration conserve son override métier via /api/admin/products
// (journalisée dans l'audit), indépendante des plans.
const EDIT_LOCKED =
  "Modifier un produit est une fonctionnalité Premium — active ton abonnement pour gérer ton catalogue comme un pro."
const DELETE_LOCKED =
  "Supprimer un produit est une fonctionnalité Premium — active ton abonnement pour gérer ton catalogue comme un pro."
const descOverLimit = (n: number) =>
  `Description trop longue (${n} caractères max au plan Premium). Raccourcis-la ou réorganise-la.`
const specsOverLimit = (n: number) => `Maximum ${n} caractéristiques par produit.`

// Mission Premium — règle de MAINTENANCE : le contenu existant n'est jamais cassé par
// l'expiration d'un abonnement. On compare avec l'état stocké :
//   - identique → no-op autorisé (idempotence des formulaires) ;
//   - vidage → toujours autorisé (suppression, pas une feature Premium) ;
//   - ajout/modification → vérifiée contre le quota du plan effectif (402 si verrouillé).
function gateDescription(
  provided: unknown,
  stored: string,
  maxChars: number,
): { value?: string; error?: NextResponse } {
  if (provided === undefined) return {}
  const next = String(provided ?? "").trim()
  if (next === stored.trim()) return { value: stored }
  if (!next) return { value: "" } // vider est toujours permis
  if (maxChars <= 0) return { error: quotaExceeded(DESC_LOCKED) }
  if (next.length > maxChars) return { error: quotaExceeded(descOverLimit(maxChars)) }
  return { value: next }
}

function gateSpecs(
  provided: unknown,
  storedJson: string,
  maxSpecs: number,
): { value?: string; error?: NextResponse } {
  if (provided === undefined) return {}
  const next = normalizeSpecs(provided)
  const current = normalizeSpecs(storedJson)
  if (JSON.stringify(next) === JSON.stringify(current)) return { value: serializeSpecs(current) }
  if (next.length === 0) return { value: "[]" } // vider est toujours permis
  if (maxSpecs <= 0) return { error: quotaExceeded(SPECS_LOCKED) }
  if (next.length > maxSpecs) return { error: quotaExceeded(specsOverLimit(maxSpecs)) }
  return { value: serializeSpecs(next) }
}

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

    // Mission Premium — description & caractéristiques (à la création : tout contenu est nouveau)
    const description = String(body.description ?? "").trim()
    if (description) {
      if (quotas.maxDescriptionChars <= 0) return quotaExceeded(DESC_LOCKED)
      if (description.length > quotas.maxDescriptionChars) {
        return quotaExceeded(descOverLimit(quotas.maxDescriptionChars))
      }
    }
    const specs = normalizeSpecs(body.specs)
    if (specs.length > 0) {
      if (quotas.maxSpecs <= 0) return quotaExceeded(SPECS_LOCKED)
      if (specs.length > quotas.maxSpecs) return quotaExceeded(specsOverLimit(quotas.maxSpecs))
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
          // Mission Premium — présentation commerciale (validée contre le plan)
          description: description.slice(0, quotas.maxDescriptionChars > 0 ? quotas.maxDescriptionChars : 0),
          specs: serializeSpecs(specs),
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
      {
        product: {
          ...product,
          images: normalizeImages(product.images),
          specs: normalizeSpecs(product.specs),
        },
      },
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

    // Mission abonnement — plan Free : gestion verrouillée (402 = invitation à s'abonner)
    if (plan.id !== "premium") return quotaExceeded(EDIT_LOCKED)

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

    // V4 — galerie : remplacée intégralement si le champ images est fourni.
    // Mission Premium — règle de MAINTENANCE : réorganiser / remplacer / supprimer
    // reste toujours possible (jamais plus d'images qu'avant) ; seule la CROISSANCE
    // au-delà du quota du plan effectif est bloquée — l'expiration d'un abonnement
    // n'empêche jamais de gérer les photos déjà en place.
    if (Array.isArray(body.images) || typeof body.images === "string") {
      const images = normalizeImages(body.images)
      const existing = normalizeImages(product.images, product.imageUrl)
      if (images.length > existing.length && images.length > quotas.maxProductImages) {
        // Plan Premium garanti ici (gate EDIT_LOCKED plus haut) — message direct.
        return quotaExceeded(`Maximum ${quotas.maxProductImages} photos par produit.`)
      }
      data.images = JSON.stringify(images)
      data.imageUrl = images[0] || ""
    }

    // Mission Premium — description & caractéristiques (règle de maintenance : idem)
    const gatedDesc = gateDescription(body.description, product.description, quotas.maxDescriptionChars)
    if (gatedDesc.error) return gatedDesc.error
    if (gatedDesc.value !== undefined) data.description = gatedDesc.value

    const gatedSpecs = gateSpecs(body.specs, product.specs, quotas.maxSpecs)
    if (gatedSpecs.error) return gatedSpecs.error
    if (gatedSpecs.value !== undefined) data.specs = gatedSpecs.value

    const updated = await db.product.update({ where: { id }, data })
    return NextResponse.json({
      product: {
        ...updated,
        images: normalizeImages(updated.images),
        specs: normalizeSpecs(updated.specs),
      },
    })
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

    // Mission abonnement — suppression réservée au plan Premium actif
    if (planOf(guard.store).id !== "premium") return quotaExceeded(DELETE_LOCKED)

    await db.product.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/products", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
