import { NextResponse } from "next/server"
import { getPlatformSettings } from "@/lib/admin"

// GET /api/platform — Paramètres publics (mode maintenance + annonce globale)
// Utilisé par la boutique publique pour afficher la maintenance et le bandeau d'annonce.
export async function GET() {
  try {
    const settings = await getPlatformSettings()
    return NextResponse.json({
      maintenance: settings.maintenance,
      announcement: settings.announcement,
    })
  } catch (e) {
    console.error("GET /api/platform", e)
    // En cas d'erreur, on ne bloque jamais l'affichage public
    return NextResponse.json({ maintenance: false, announcement: "" })
  }
}
