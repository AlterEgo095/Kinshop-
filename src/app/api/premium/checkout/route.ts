// POST /api/premium/checkout — Initie le paiement Premium via Chariow
//
// Mode LIVE (CHARIOW_API_KEY + CHARIOW_PRODUCT_ID configurés) :
//   crée une session checkout sur api.chariow.com/v1/checkout et renvoie
//   l'URL de paiement mobile money hébergée par Chariow.
// Mode SIMULATION (clés absentes) :
//   renvoie mode="sim" — l'app affiche un écran de paiement de démonstration
//   qui active le Premium via /api/premium/simulate-confirm.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  initiateCheckout,
  buildPremiumRedirectUrl,
  resolveChariowProductId,
  isChariowLiveAsync,
} from "@/lib/chariow"
import { normalizePhone } from "@/lib/kinshop"
import { requireStoreOwner, forbidden, unauthorized } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"
import { verifyAndApplyPremium } from "@/lib/premium"
import { isPaymentSimulationEnabled } from "@/lib/simulation"

export async function POST(req: NextRequest) {
  try {
    // Feature flag : programme Premium piloté depuis la console admin
    if (!(await isFeatureOn("premiumProgram"))) {
      return forbidden("Le programme Premium est momentanément désactivé sur la plateforme.")
    }

    const body = await req.json()
    const slug = String(body.slug || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const firstName = String(body.firstName || "").trim().slice(0, 50)
    const lastName = String(body.lastName || "").trim().slice(0, 50) || "-"

    if (!slug) return NextResponse.json({ error: "Boutique manquante." }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 })
    }
    if (!firstName) {
      return NextResponse.json({ error: "Ton prénom est requis." }, { status: 400 })
    }
    const digits = normalizePhone(String(body.phone || ""))
    if (digits.length < 9) {
      return NextResponse.json({ error: "Numéro de téléphone invalide (ex : 0812345678)." }, { status: 400 })
    }

    // V8 : seul le propriétaire peut payer l'abonnement de SA boutique
    const user = await requireStoreOwner(req, { slug })
    if (!user.ok) {
      return user.ok === false && user.response.status === 401
        ? unauthorized("Connecte-toi pour souscrire au Premium de ta boutique.")
        : user.response
    }
    const store = user.ok ? user.store : null
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // On mémorise les coordonnées de facturation sur la boutique (champ dédié,
    // sans jamais toucher aux champs d'abonnement — seul Chariow/admin les écrit)
    await db.store.update({
      where: { id: store.id },
      data: { chariowEmail: email, chariowPhone: digits },
    })

    // ─── PRÉ-CHECK LIVE : vente déjà payée non encore appliquée ? ───
    // Couvre le cas « popup fermée avant la page de retour » : au lieu de
    // créer une nouvelle session, on active le Premium de la vente existante.
    // (Ne s'applique que si le paiement réel est branché — sinon no-op.)
    const precheck = await verifyAndApplyPremium(store)
    if (precheck.activated) {
      const fresh = await db.store.findUnique({
        where: { slug },
        select: { isPremium: true, premiumUntil: true },
      })
      return NextResponse.json({
        mode: "already_paid" as const,
        slug,
        saleId: precheck.saleId ?? null,
        isPremium: fresh?.isPremium ?? true,
        premiumUntil: fresh?.premiumUntil ?? null,
      })
    }

    // ─── MODE SIMULATION ───
    // Paiement réel = clé API (.env) + produit résolu dynamiquement (console admin ou .env)
    if (!(await isChariowLiveAsync())) {
      // Kill-switch (audit F-01) : la démo de paiement n'existe que si
      // PAYMENT_SIMULATION=on est explicitement défini dans l'environnement.
      // Sinon (production) : pas de flux de paiement du tout — message honnête.
      if (!isPaymentSimulationEnabled()) {
        return NextResponse.json(
          {
            error:
              "Le paiement Premium n'est pas encore disponible : le produit Chariow doit être configuré dans la console ADMIN → Paiements.",
          },
          { status: 503 },
        )
      }
      return NextResponse.json({
        mode: "sim" as const,
        slug,
        message:
          "Mode démo : paiement simulé (produit Chariow non encore branché — colle l'ID produit dans la console ADMIN, section Paiements).",
      })
    }

    // ─── MODE LIVE (Chariow) ───
    const productId = await resolveChariowProductId()
    const result = await initiateCheckout({
      productId,
      email,
      firstName,
      lastName,
      phoneDigits: digits,
      redirectUrl: buildPremiumRedirectUrl(),
      customMetadata: {
        app: "kinshop",
        store_slug: slug,
        store_name: store.name,
      },
      paymentCurrency: "USD",
      customerIp: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    })

    if (!result.checkoutUrl) {
      // Produit gratuit ou réponse inattendue
      return NextResponse.json(
        { error: "Chariow n'a pas renvoyé d'URL de paiement. Vérifie le produit configuré (prix fixe, type supporté)." },
        { status: 502 },
      )
    }

    return NextResponse.json({
      mode: "live" as const,
      url: result.checkoutUrl,
      saleId: result.saleId,
    })
  } catch (e) {
    console.error("POST /api/premium/checkout", e)
    const msg = e instanceof Error ? e.message : "Erreur serveur."
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
