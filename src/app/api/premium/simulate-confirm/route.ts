// POST /api/premium/simulate-confirm — Active le Premium en MODE SIMULATION
//
// Uniquement disponible quand les clés Chariow ne sont PAS configurées (démo).
// V8 : seul le PROPRIÉTAIRE authentifié de la boutique peut la simuler — plus
// personne ne peut activer le Premium d'une boutique étrangère.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isChariowLive } from "@/lib/chariow"
import { requireStoreOwner, forbidden } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"

const PREMIUM_DAYS = 30

export async function POST(req: NextRequest) {
  try {
    if (isChariowLive()) {
      return NextResponse.json(
        { error: "Simulation désactivée : le paiement réel Chariow est actif." },
        { status: 403 },
      )
    }

    // Feature flag : programme Premium piloté depuis la console admin
    if (!(await isFeatureOn("premiumProgram"))) {
      return forbidden("Le programme Premium est momentanément désactivé sur la plateforme.")
    }

    const body = await req.json()
    const slug = String(body.slug || "").trim()
    if (!slug) return NextResponse.json({ error: "Boutique manquante." }, { status: 400 })

    const guard = await requireStoreOwner(req, { slug })
    if (!guard.ok) return guard.response
    const store = guard.store

    // Prolonge de 30 jours à partir de la fin actuelle si déjà premium
    const now = new Date()
    const base = store.premiumUntil && store.premiumUntil > now ? store.premiumUntil : now
    const premiumUntil = new Date(base.getTime() + PREMIUM_DAYS * 24 * 60 * 60 * 1000)

    const updated = await db.store.update({
      where: { slug },
      data: { isPremium: true, premiumUntil },
    })

    return NextResponse.json({
      store: {
        slug: updated.slug,
        isPremium: updated.isPremium,
        premiumUntil: updated.premiumUntil,
      },
      simulated: true,
    })
  } catch (e) {
    console.error("POST /api/premium/simulate-confirm", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
