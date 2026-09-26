import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner, quotaExceeded, getUserFromRequest, unauthorized } from "@/lib/auth"
import { isFeatureOn, getConfigValue } from "@/lib/config-registry"
import { logAudit } from "@/lib/audit"
import { isPaymentSimulationEnabled } from "@/lib/simulation"
import { expireDueCampaigns } from "@/lib/boost"
import { withStoreQuotaWrite, type TxClient } from "@/lib/quota-guard"
import {
  initiateCheckout,
  buildBoostRedirectUrl,
  resolveChariowBoostProductId,
  isChariowBoostLiveAsync,
} from "@/lib/chariow"

// Boost V10 — PROMOTION PAYANTE, indépendante de l'abonnement Premium :
// Premium = fonctionnalités ; Boost = visibilité (accueil « Sponsorisé »).
//
// POST /api/boost { slug, days: 7|30 }       → campagne en attente de paiement
//   Phase F — si un produit Chariow À PRIX FIXE est configuré pour le palier,
//   une session checkout est initiée et l'URL de paiement est renvoyée
//   (payment.mode="chariow") ; sinon repli : campagne en attente, activation
//   par l'administration (payment.mode="manual") ou démo (simulation).
// PATCH /api/boost { id, action: "checkout" } → re-initie le paiement Chariow
//   d'une campagne en attente (paiement plus tard / session abandonnée).
// PATCH /api/boost { id }                     → DÉMO SEULE : paiement simulé → active
// GET  /api/boost?slug=                       → campagnes de la boutique

/**
 * Phase F — Initie une session checkout Chariow pour une campagne de boost.
 * Montant : DÉCIDÉ PAR LE PRODUIT CHARIOW À PRIX FIXE (config admin) — le
 * client ne fournit JAMAIS de montant. Metadata serveur : kind=boost + id
 * campagne → le webhook Pulse active la campagne après paiement vérifié.
 */
async function startBoostCheckout(campaignId: string): Promise<
  { ok: true; url: string; saleId: string | null } | { ok: false; status: number; error: string }
> {
  const campaign = await db.boostCampaign.findUnique({ where: { id: campaignId }, include: { store: true } })
  if (!campaign) return { ok: false, status: 404, error: "Campagne introuvable." }
  if (campaign.status !== "pending_payment") {
    return { ok: false, status: 400, error: "Cette campagne n'est plus en attente de paiement." }
  }

  // Palier dérivé de la fenêtre planifiée (7 ou 30 jours — créé par POST)
  const days = Math.round((campaign.endAt.getTime() - campaign.startAt.getTime()) / 86_400_000)
  if (![7, 30].includes(days)) {
    return { ok: false, status: 400, error: "Palier de campagne inconnu (7 ou 30 jours attendus)." }
  }
  if (!(await isChariowBoostLiveAsync(days as 7 | 30))) {
    return {
      ok: false,
      status: 503,
      error:
        "Le paiement en ligne du boost n'est pas encore disponible : le produit Chariow du palier doit être configuré dans la console ADMIN → Paiements.",
    }
  }

  const productId = await resolveChariowBoostProductId(days as 7 | 30)
  // Store.ownerId est nullable (onDelete: SetNull) — garde explicite avant findUnique
  const ownerId = campaign.store.ownerId
  const owner = ownerId
    ? await db.user.findUnique({ where: { id: ownerId }, select: { email: true, name: true, whatsapp: true } })
    : null
  const [firstName, ...rest] = (owner?.name || "Vendeur KinShop").trim().split(/\s+/)
  try {
    const result = await initiateCheckout({
      productId,
      email: owner?.email || "boost@kinshop.store",
      firstName: firstName || "Vendeur",
      lastName: rest.join(" ") || "-",
      phoneDigits: owner?.whatsapp || campaign.store.chariowPhone || "",
      redirectUrl: buildBoostRedirectUrl(),
      customMetadata: {
        app: "kinshop",
        kind: "boost",
        boost_id: campaign.id,
        store_slug: campaign.store.slug,
        days: String(days),
      },
      paymentCurrency: "USD",
    })

    if (!result.checkoutUrl) {
      return {
        ok: false,
        status: 502,
        error: "Chariow n'a pas renvoyé d'URL de paiement. Vérifie le produit configuré (prix fixe, type supporté, publié).",
      }
    }
    return { ok: true, url: result.checkoutUrl, saleId: result.saleId }
  } catch (e) {
    // Erreur fournisseur structurée (produit non publié/type service, API
    // indisponible…) : message actionnable pour POST comme pour le PATCH
    // « checkout » — jamais un 500 générique.
    console.error("startBoostCheckout", e)
    return {
      ok: false,
      status: 502,
      error: e instanceof Error ? e.message : "Initiation du paiement impossible.",
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    // TD3 (cycle 3) — identité avant le feature-gate et la validation de forme
    // (l'autorisation propriétaire, qui a besoin du slug du corps, reste à sa place).
    const session = await getUserFromRequest(req)
    if (!session) return unauthorized()

    if (!(await isFeatureOn("boost"))) {
      return NextResponse.json({ error: "La promotion payante est désactivée pour le moment." }, { status: 403 })
    }

    const body = await req.json()
    const slug = String(body.slug || "")
    const days = Number(body.days)

    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })
    if (![7, 30].includes(days)) {
      return NextResponse.json({ error: "Durée invalide (7 ou 30 jours)." }, { status: 400 })
    }

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const { store, user } = guard

    // Prix : DÉCIDÉ PAR LE SERVEUR (config admin) — jamais par le frontend
    const costUSD = await getConfigValue<number>(days === 7 ? "boost.price7USD" : "boost.price30USD")
    const maxActive = await getConfigValue<number>("boost.maxActivePerStore")

    // P6 F6-1 — purge paresseuse hors tx (UX : la campagne expirée du owner
    // cesse immédiatement de polluer le compteur) puis vérification FAIS FOI
    // DANS la transaction (P6 F6-2 — anti-TOCTOU, même pattern que F-07) :
    // expiration + count + create dans la même unité atomique par boutique.
    const result = await withStoreQuotaWrite(store.id, async (tx: TxClient) => {
      const now = new Date()
      const stalePendingBefore = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      await tx.boostCampaign.updateMany({
        where: { storeId: store.id, status: "active", endAt: { lt: now } },
        data: { status: "ended" },
      })
      await tx.boostCampaign.updateMany({
        where: { storeId: store.id, status: "pending_payment", createdAt: { lt: stalePendingBefore } },
        data: { status: "expired" },
      })

      const activeCount = await tx.boostCampaign.count({
        where: { storeId: store.id, status: { in: ["pending_payment", "active"] } },
      })
      if (activeCount >= maxActive) return { overQuota: true as const, campaign: null, activeCount }

      const startAt = new Date()
      const endAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
      const campaign = await tx.boostCampaign.create({
        data: { storeId: store.id, placement: "home_featured", startAt, endAt, costUSD, status: "pending_payment" },
      })
      return { overQuota: false as const, campaign }
    })

    if (result.overQuota || !result.campaign) {
      return quotaExceeded(
        `Tu as déjà ${result.activeCount} campagne(s) en cours (max ${maxActive}). Attends la fin de la campagne en cours.`,
      )
    }
    const campaign = result.campaign

    await logAudit({
      action: "boost.created",
      target: `boost:${campaign.id}`,
      detail: `${store.name} — ${days} j — $${costUSD.toFixed(2)} (paiement en attente)`,
      actorType: "owner",
      actorId: user.id,
      entityType: "boost",
      entityId: campaign.id,
    })

    // ─── Phase F — Paiement via Chariow (produit à prix fixe) ───
    // Si le palier est configuré : session checkout immédiate. En cas d'échec
    // fournisseur, la campagne reste en attente (aucune perte) et l'erreur
    // est renvoyée dans payment — le vendeur retentera via PATCH action="checkout".
    let payment: { mode: "chariow"; url: string; saleId: string | null } | { mode: "manual" } | {
      mode: "chariow_error"
      error: string
    } = { mode: "manual" }
    if (await isChariowBoostLiveAsync(days as 7 | 30)) {
      try {
        const checkout = await startBoostCheckout(campaign.id)
        if (checkout.ok) {
          payment = { mode: "chariow", url: checkout.url, saleId: checkout.saleId }
          await logAudit({
            action: "boost.checkout_sent",
            target: `boost:${campaign.id}`,
            detail: `Session checkout Chariow initiée (${days} j) — vente ${checkout.saleId ?? "?"}`,
            actorType: "owner",
            actorId: user.id,
            entityType: "boost",
            entityId: campaign.id,
          })
        } else {
          payment = { mode: "chariow_error", error: checkout.error }
        }
      } catch (e) {
        console.error("POST /api/boost checkout", e)
        payment = {
          mode: "chariow_error",
          error: e instanceof Error ? e.message : "Initiation du paiement impossible.",
        }
      }
    }

    return NextResponse.json({ campaign, payment }, { status: 201 })
  } catch (e) {
    console.error("POST /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH : deux actions.
//   { id, action: "checkout" } — re-initie la session Chariow d'une campagne
//   en attente (PAS une confirmation de paiement : aucune écriture de statut,
//   activation uniquement par webhook vérifié ou administration) — autorisé
//   en production.
//   { id } — DÉMO SEULE : paiement simulé → active. KILL-SWITCH (audit F-03) :
//   le propriétaire ne peut JAMAIS confirmer lui-même le paiement d'une
//   campagne hors mode démo explicite. En production, l'activation relève
//   du webhook Chariow (Phase F) ou de l'ADMINISTRATION (PATCH /api/admin/boost
//   action "activate") — jamais d'une simple requête client.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // ─── Action "checkout" (Phase F) : re-initiation de paiement ───
    if (body.action === "checkout") {
      const id = String(body.id || "")
      if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

      const campaign = await db.boostCampaign.findUnique({ where: { id }, include: { store: true } })
      if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })

      const guard = await requireStoreOwner(req, { id: campaign.storeId })
      if (!guard.ok) return guard.response

      const checkout = await startBoostCheckout(id)
      if (!checkout.ok) return NextResponse.json({ error: checkout.error }, { status: checkout.status })

      await logAudit({
        action: "boost.checkout_sent",
        target: `boost:${id}`,
        detail: `Re-initiation checkout Chariow — vente ${checkout.saleId ?? "?"}`,
        actorType: "owner",
        actorId: guard.user.id,
        entityType: "boost",
        entityId: id,
      })
      return NextResponse.json({ url: checkout.url, saleId: checkout.saleId })
    }

    // ─── Confirmation démo (inchangée) ───
    if (!isPaymentSimulationEnabled()) {
      return NextResponse.json(
        {
          error:
            "Le paiement de la campagne doit être vérifié par l'administration KinShop avant activation.",
        },
        { status: 403 },
      )
    }

    const id = String(body.id || "")
    if (!id) return NextResponse.json({ error: "id requis." }, { status: 400 })

    const campaign = await db.boostCampaign.findUnique({ where: { id }, include: { store: true } })
    if (!campaign) return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 })

    const guard = await requireStoreOwner(req, { id: campaign.storeId })
    if (!guard.ok) return guard.response

    if (campaign.status !== "pending_payment") {
      return NextResponse.json({ error: "Cette campagne n'est plus en attente de paiement." }, { status: 400 })
    }

    const paymentRef = `BOOST-${Date.now().toString(36).toUpperCase()}`
    const updated = await db.boostCampaign.update({
      where: { id },
      data: { status: "active", paymentRef },
    })

    await logAudit({
      action: "boost.paid",
      target: `boost:${id}`,
      detail: `${campaign.store.name} — campagne ACTIVE jusqu'au ${updated.endAt.toISOString().slice(0, 10)} — réf ${paymentRef}`,
      actorType: "owner",
      actorId: guard.user.id,
      entityType: "boost",
      entityId: id,
    })

    return NextResponse.json({ campaign: updated })
  } catch (e) {
    console.error("PATCH /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// GET : campagnes de la boutique (F6-1 — purge paresseuse avant lecture :
// le owner voit des statuts réels, jamais une campagne périmée « active »)
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    await expireDueCampaigns(guard.store.id)

    const campaigns = await db.boostCampaign.findMany({
      where: { storeId: guard.store.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    })
    return NextResponse.json({ campaigns })
  } catch (e) {
    console.error("GET /api/boost", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
