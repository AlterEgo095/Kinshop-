// POST /api/premium/verify — Vérifie auprès de Chariow si le Premium a été payé
//
// Fallback robuste au webhook Pulse : interroge l'API Chariow (vente explicite
// si l'indice client est fourni + ventes récentes du produit configuré), croise
// l'email de facturation de la boutique, puis active/prolonge le Premium (+30 j).
// SÉCURITÉ : réservé au PROPRIÉTAIRE authentifié de la boutique (anti-IDOR) ;
// le serveur revalide toujours le statut réel de la vente côté Chariow.
// Idempotent : une vente déjà appliquée (chariowSaleId) n'est jamais rejouée.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyAndApplyPremium } from "@/lib/premium"
import { requireStoreOwner, forbidden, unauthorized } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"

export async function POST(req: NextRequest) {
  try {
    if (!(await isFeatureOn("premiumProgram"))) {
      return forbidden("Le programme Premium est momentanément désactivé sur la plateforme.")
    }

    const body = await req.json().catch(() => null)
    const slug = String(body?.slug || "").trim()
    const hintSaleId = String(body?.saleId || "").trim()
    if (!slug) return NextResponse.json({ error: "Boutique manquante." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) {
      return guard.ok === false && guard.response.status === 401
        ? unauthorized("Connecte-toi pour vérifier ton paiement.")
        : guard.response
    }
    const store = guard.ok ? guard.store : null
    if (!store) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 })

    const result = await verifyAndApplyPremium(store, hintSaleId || undefined)

    // Relecture de l'état réel après écriture éventuelle
    const fresh = await db.store.findUnique({
      where: { slug },
      select: { isPremium: true, premiumUntil: true },
    })
    return NextResponse.json({
      activated: result.activated,
      reason: result.reason ?? null,
      saleId: result.saleId ?? null,
      isPremium: fresh?.isPremium ?? false,
      premiumUntil: fresh?.premiumUntil ?? null,
    })
  } catch (e) {
    console.error("POST /api/premium/verify", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
