import { NextResponse } from "next/server"
import { getPlatformSettings } from "@/lib/admin"

// GET /api/platform — Paramètres publics (mode maintenance + annonce + taux de change)
// Consommé par l'app pour : l'écran de maintenance, le bandeau d'annonce et la
// synchronisation en temps réel du taux FC/$ (polling côté client).
export async function GET() {
  try {
    const settings = await getPlatformSettings()
    return NextResponse.json(
      {
        maintenance: settings.maintenance,
        announcement: settings.announcement,
        defaultRateFC: settings.defaultRateFC,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/platform", e)
    // En cas d'erreur, on ne bloque jamais l'affichage public
    return NextResponse.json(
      { maintenance: false, announcement: "", defaultRateFC: 2850 },
      { headers: { "Cache-Control": "no-store" } },
    )
  }
}
