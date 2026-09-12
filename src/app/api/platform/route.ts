import { NextResponse } from "next/server"
import { getPlatformSettings } from "@/lib/admin"
import { getPublicConfig } from "@/lib/config-registry"

// GET /api/platform — Paramètres publics + configuration publique dynamique
// Consommé par l'app pour : l'écran de maintenance, le bandeau d'annonce, la
// synchronisation temps réel du taux FC/$ (polling 30 s + focus) et la
// configuration dynamique (feature flags, plans, catalogue, paiements, contenus).
// Chaque modification faite dans la console ADMIN se propage ici en ≤ 30 s
// (immédiat au focus de l'onglet) — le serveur reste l'autorité finale : les
// API vérifient flags et quotas à chaque requête, indépendamment du cache UI.
export async function GET() {
  try {
    const [settings, config] = await Promise.all([getPlatformSettings(), getPublicConfig()])
    return NextResponse.json(
      {
        maintenance: settings.maintenance,
        announcement: settings.announcement,
        defaultRateFC: settings.defaultRateFC,
        // Configuration dynamique administrable (feature flags, plans, catalogue…)
        config,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/platform", e)
    // En cas d'erreur, on ne bloque jamais l'affichage public
    return NextResponse.json(
      { maintenance: false, announcement: "", defaultRateFC: 2850, config: {} },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
