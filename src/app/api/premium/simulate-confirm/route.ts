// POST /api/premium/simulate-confirm — Active le Premium en MODE SIMULATION
//
// Kill-switch (audit F-01) : DÉSACTIVÉ par défaut — production incluse — même
// quand Chariow n'est pas encore configuré. Nécessite PAYMENT_SIMULATION=on
// dans l'environnement (mode démo explicite) ET Chariow non branché.
// En production, le Premium ne peut être activé QUE par : paiement réel Chariow
// (webhook Pulse HMAC, vérification à la demande) ou administration.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { isChariowLiveAsync } from "@/lib/chariow"
import { requireStoreOwner, forbidden } from "@/lib/auth"
import { isFeatureOn } from "@/lib/config-registry"
import { isPaymentSimulationEnabled, simulationDisabledResponse } from "@/lib/simulation"

const PREMIUM_DAYS = 30

export async function POST(req: NextRequest) {
  try {
    // Kill-switch EN TÊTE : aucun traitement, aucune fuite d'information si
    // la simulation n'est pas explicitement activée dans cet environnement.
    if (!isPaymentSimulationEnabled()) return simulationDisabledResponse()

    if (await isChariowLiveAsync()) {
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
