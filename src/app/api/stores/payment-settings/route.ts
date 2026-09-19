import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { requireStoreOwner } from "@/lib/auth"
import { parseStorePaymentSettings } from "@/lib/direct-payments"

// P1 (Phase C) — Brique 1 : lecture des coordonnées de paiement direct du
// vendeur (Store.paymentSettings), réservée au PROPRIÉTAIRE de la boutique
// (dérivation serveur par session). Ces coordonnées ne sont jamais servies
// par la route publique GET /api/stores (champ retiré de la réponse publique).
//
// Le formulaire « Paiements directs » du dashboard appelle cette route pour
// initialiser ses champs, et sauvegarde via PATCH /api/stores.

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug")
    if (!slug) return NextResponse.json({ error: "Paramètre slug requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response

    return NextResponse.json({ settings: parseStorePaymentSettings(guard.store.paymentSettings) })
  } catch (e) {
    console.error("GET /api/stores/payment-settings", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
