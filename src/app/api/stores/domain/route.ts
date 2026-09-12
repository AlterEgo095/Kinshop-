import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { db } from "@/lib/db"
import { requireStoreOwner, forbidden } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"
import {
  normalizeDomain,
  isPlatformDomain,
  verifyDomainOwnership,
  checkDomainRouting,
  PLATFORM_DOMAIN,
  PLATFORM_IPV4,
  VERIFY_PREFIX,
} from "@/lib/domain"

// GET /api/stores/domain?slug=xxx — état du domaine personnalisé (V8 : propriétaire uniquement)
export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") || "").trim()
  if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

  try {
    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const store = guard.store

    return NextResponse.json({
      domain: {
        customDomain: store.customDomain,
        verified: store.domainVerified,
        token: store.customDomain ? store.domainToken : "",
        platformDomain: PLATFORM_DOMAIN,
        platformIPv4: PLATFORM_IPV4,
        verifyHost: store.customDomain ? `${VERIFY_PREFIX}.${store.customDomain}` : "",
      },
    })
  } catch (e) {
    console.error("GET /api/stores/domain", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// POST /api/stores/domain — { slug, action: "claim" | "verify" | "remove", domain? }
// V8 : propriétaire uniquement (en plus de la barrière Premium existante)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const slug = String(body.slug || "").trim()
    const action = String(body.action || "").trim()
    if (!slug || !action) {
      return NextResponse.json({ error: "Paramètres slug et action requis." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const store = guard.store

    // Feature flag : domaines personnalisés pilotés depuis la console admin
    if (action === "claim" && !(await isFeatureOn("customDomains"))) {
      return forbidden("Les domaines personnalisés sont momentanément désactivés sur la plateforme.")
    }

    // Fonctionnalité réservée aux boutiques Premium
    if (!store.isPremium || (store.premiumUntil && new Date(store.premiumUntil).getTime() < Date.now())) {
      return NextResponse.json({ error: "Le domaine personnalisé est réservé aux boutiques Premium." }, { status: 402 })
    }

    // ── Revendiquer un nouveau domaine ──
    if (action === "claim") {
      const domain = normalizeDomain(String(body.domain || ""))
      if (!domain) {
        return NextResponse.json({ error: "Nom de domaine invalide. Exemple : maboutique.cd" }, { status: 400 })
      }
      if (isPlatformDomain(domain)) {
        return NextResponse.json(
          { error: `Ce domaine appartient à la plateforme KinShop (${PLATFORM_DOMAIN}).` },
          { status: 400 },
        )
      }
      const taken = await db.store.findFirst({
        where: { customDomain: domain, id: { not: store.id } },
        select: { slug: true },
      })
      if (taken) {
        return NextResponse.json({ error: "Ce domaine est déjà relié à une autre boutique." }, { status: 409 })
      }
      const token = randomBytes(16).toString("hex")
      const updated = await db.store.update({
        where: { id: store.id },
        data: { customDomain: domain, domainToken: token, domainVerified: false },
      })
      return NextResponse.json({
        ok: true,
        domain: {
          customDomain: updated.customDomain,
          verified: updated.domainVerified,
          token: updated.domainToken,
          platformDomain: PLATFORM_DOMAIN,
          platformIPv4: PLATFORM_IPV4,
          verifyHost: `${VERIFY_PREFIX}.${updated.customDomain}`,
        },
      })
    }

    // ── Vérifier la propriété du domaine (TXT DNS via DNS-over-HTTPS) ──
    if (action === "verify") {
      if (!store.customDomain || !store.domainToken) {
        return NextResponse.json({ error: "Aucun domaine à vérifier. Revendique d'abord un domaine." }, { status: 400 })
      }
      const owned = await verifyDomainOwnership(store.customDomain, store.domainToken)
      if (!owned) {
        return NextResponse.json(
          {
            error: `Enregistrement TXT introuvable ou incorrect sur ${VERIFY_PREFIX}.${store.customDomain}. Après modification DNS, compte quelques minutes de propagation, puis réessaie.`,
          },
          { status: 400 },
        )
      }
      const routing = await checkDomainRouting(store.customDomain)
      const updated = await db.store.update({ where: { id: store.id }, data: { domainVerified: true } })
      return NextResponse.json({
        ok: true,
        routing,
        domain: {
          customDomain: updated.customDomain,
          verified: updated.domainVerified,
          token: updated.domainToken,
          platformDomain: PLATFORM_DOMAIN,
          platformIPv4: PLATFORM_IPV4,
          verifyHost: `${VERIFY_PREFIX}.${updated.customDomain}`,
        },
      })
    }

    // ── Retirer le domaine personnalisé ──
    if (action === "remove") {
      await db.store.update({
        where: { id: store.id },
        data: { customDomain: null, domainVerified: false, domainToken: "" },
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Action inconnue (claim | verify | remove)." }, { status: 400 })
  } catch (e) {
    console.error("POST /api/stores/domain", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
