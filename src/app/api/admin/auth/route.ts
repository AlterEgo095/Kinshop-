import { NextRequest, NextResponse } from "next/server"
import { getAdminPin, isUsingDefaultPin, logAdminAction, notePinFailure, pinRateLimitedResponse } from "@/lib/admin"

// POST /api/admin/auth — Vérifier le PIN administrateur
// F-05 (audit) : anti brute-force — 5 échecs / 15 min / IP → 429.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const pin = String(body.pin || "").trim()

    if (!pin || pin !== getAdminPin()) {
      if (!notePinFailure(req)) return pinRateLimitedResponse()
      return NextResponse.json(
        { error: "PIN incorrect. Réessaie." },
        { status: 401 },
      )
    }

    // Journalise la connexion (sans jamais stocker le PIN)
    await logAdminAction("admin.login", "console", "Connexion à la console d'administration")

    return NextResponse.json({ ok: true, isDefaultPin: isUsingDefaultPin() })
  } catch (e) {
    console.error("POST /api/admin/auth", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
