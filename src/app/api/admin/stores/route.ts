import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import { getConfigValue } from "@/lib/config-registry"

// GET /api/admin/stores — Liste complète des boutiques (avec compteurs & CA)
export async function GET(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const sp = req.nextUrl.searchParams
    const q = (sp.get("q") || "").toLowerCase().trim()
    const status = sp.get("status") || "" // active | suspended
    const premium = sp.get("premium") || "" // yes | no

    const stores = await db.store.findMany({
      include: {
        _count: { select: { products: true, orders: true } },
        orders: { select: { totalUSD: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    let list = stores
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.slug.toLowerCase().includes(q) ||
          s.ownerName.toLowerCase().includes(q) ||
          s.whatsapp.includes(q.replace(/\D/g, "") || "␀"),
      )
    }
    if (status === "active" || status === "suspended") {
      list = list.filter((s) => s.status === status)
    }
    if (premium === "yes") list = list.filter((s) => s.isPremium)
    if (premium === "no") list = list.filter((s) => !s.isPremium)

    const now = Date.now()
    const data = list.map((s) => {
      const revenue = s.orders
        .filter((o) => o.status !== "cancelled")
        .reduce((acc, o) => acc + o.totalUSD, 0)
      // Premium réellement actif ?
      const premiumActive =
        s.isPremium && s.premiumUntil && new Date(s.premiumUntil).getTime() > now
      const { orders, ...rest } = s
      return {
        ...rest,
        premiumActive: Boolean(premiumActive),
        productsCount: s._count.products,
        ordersCount: s._count.orders,
        revenueUSD: Math.round(revenue * 100) / 100,
      }
    })

    return NextResponse.json({ stores: data, total: data.length })
  } catch (e) {
    console.error("GET /api/admin/stores", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/stores — Actions de modération & gestion premium
export async function PATCH(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const id = String(body.id || "")
    const action = String(body.action || "")
    if (!id || !action) {
      return NextResponse.json({ error: "Paramètres id et action requis." }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { id } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    let data: Record<string, unknown> = {}
    let logDetail = ""

    switch (action) {
      case "suspend":
        data = { status: "suspended" }
        logDetail = `Boutique ${store.slug} suspendue`
        break
      case "activate":
        data = { status: "active" }
        logDetail = `Boutique ${store.slug} réactivée`
        break
      case "verify": {
        // V10 — Vérification des propriétaires : unverified | pending | verified | rejected
        const v = String(body.verificationStatus || "")
        if (!["unverified", "pending", "verified", "rejected"].includes(v)) {
          return NextResponse.json({ error: "verificationStatus invalide (unverified|pending|verified|rejected)." }, { status: 400 })
        }
        data = { verificationStatus: v }
        logDetail = `Vérification de ${store.slug} → ${v}`
        break
      }
      case "grant-premium": {
        // Durées bornées par des règles métier paramétrables côté admin
        const minDays = await getConfigValue<number>("business.premiumMinDays")
        const maxDays = await getConfigValue<number>("business.premiumGrantMaxDays")
        const days = Math.min(Math.max(Number(body.days) || 30, minDays), maxDays)
        const now = Date.now()
        const base =
          store.premiumUntil && new Date(store.premiumUntil).getTime() > now
            ? new Date(store.premiumUntil).getTime()
            : now
        data = { isPremium: true, premiumUntil: new Date(base + days * 86400_000) }
        logDetail = `Premium ${days}j accordé à ${store.slug}`
        break
      }
      case "revoke-premium":
        data = { isPremium: false, premiumUntil: null }
        logDetail = `Premium révoqué pour ${store.slug}`
        break
      case "domain-verify":
        if (!store.customDomain) {
          return NextResponse.json({ error: "Cette boutique n'a aucun domaine personnalisé." }, { status: 400 })
        }
        data = { domainVerified: true }
        logDetail = `Domaine ${store.customDomain} validé manuellement pour ${store.slug}`
        break
      case "domain-unlink":
        data = { customDomain: null, domainVerified: false, domainToken: "" }
        logDetail = `Domaine ${store.customDomain || ""} délié de ${store.slug}`
        break
      case "assign-owner": {
        // V8 — Réattribue (ou détache) la propriété d'une boutique, notamment
        // pour adopter les boutiques orphelines créées avant l'introduction des comptes.
        const email = String(body.email || "").trim().toLowerCase()
        if (!email) {
          data = { ownerId: null }
          logDetail = `Propriété de ${store.slug} retirée (boutique orpheline)`
        } else {
          const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true } })
          if (!user) {
            return NextResponse.json({ error: `Aucun compte utilisateur pour ${email}.` }, { status: 404 })
          }
          const owned = await db.store.findFirst({ where: { ownerId: user.id, id: { not: store.id } }, select: { slug: true } })
          if (owned) {
            return NextResponse.json(
              { error: `${email} possède déjà la boutique ${owned.slug} (un compte = une boutique).` },
              { status: 409 },
            )
          }
          data = { ownerId: user.id }
          logDetail = `${store.slug} réattribuée à ${email}`
        }
        break
      }
      default:
        return NextResponse.json({ error: "Action inconnue." }, { status: 400 })
    }

    const updated = await db.store.update({ where: { id }, data })
    await logAdminAction(`store.${action}`, `store:${store.slug}`, logDetail)

    return NextResponse.json({
      store: {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
        verificationStatus: updated.verificationStatus,
        isPremium: updated.isPremium,
        premiumUntil: updated.premiumUntil,
        customDomain: updated.customDomain,
        domainVerified: updated.domainVerified,
      },
    })
  } catch (e) {
    console.error("PATCH /api/admin/stores", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// DELETE /api/admin/stores?id=xxx — Supprimer définitivement une boutique (cascade)
export async function DELETE(req: NextRequest) {
  const denied = guardAdmin(req)
  if (denied) return denied

  try {
    const id = req.nextUrl.searchParams.get("id")
    if (!id) return NextResponse.json({ error: "Paramètre id requis." }, { status: 400 })

    const store = await db.store.findUnique({ where: { id } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    await db.store.delete({ where: { id } })
    await logAdminAction("store.delete", `store:${store.slug}`, `Suppression de « ${store.name} » (${store.slug}) et de tout son contenu`)

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("DELETE /api/admin/stores", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
