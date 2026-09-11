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
import { isChariowLive, initiateCheckout, buildPremiumRedirectUrl, getChariowConfig } from "@/lib/chariow"
import { normalizePhone } from "@/lib/kinshop"

export async function POST(req: NextRequest) {
  try {
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

    const store = await db.store.findUnique({ where: { slug } })
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    // On mémorise les coordonnées de facturation sur la boutique
    await db.store.update({
      where: { slug },
      data: { chariowEmail: email, chariowPhone: digits },
    })

    // ─── MODE SIMULATION ───
    if (!isChariowLive()) {
      return NextResponse.json({
        mode: "sim" as const,
        slug,
        message: "Mode démo : paiement simulé (clés Chariow non configurées).",
      })
    }

    // ─── MODE LIVE (Chariow) ───
    const cfg = getChariowConfig()
    const result = await initiateCheckout({
      productId: cfg.productId,
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
