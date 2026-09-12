// GET /api/auth/me — Identité de l'utilisateur connecté + sa boutique (V8)
// Sert de garde côté frontend : le dashboard et le wizard ne s'ouvrent que
// lorsqu'une session serveur valide existe (le serveur reste l'autorité).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getUserFromRequest } from "@/lib/auth"
import { planOf } from "@/lib/plans"

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      // 200 avec user:null : évite les erreurs en console côté client (état normal « visiteur »)
      return NextResponse.json({ user: null, store: null }, { headers: { "Cache-Control": "no-store" } })
    }

    const store = await db.store.findFirst({
      where: { ownerId: user.id },
      select: {
        id: true,
        slug: true,
        name: true,
        logoEmoji: true,
        isPremium: true,
        premiumUntil: true,
        status: true,
      },
    })

    return NextResponse.json(
      {
        user,
        store: store
          ? {
              ...store,
              plan: planOf(store).id,
              quota: planOf(store),
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    console.error("GET /api/auth/me", e)
    return NextResponse.json({ user: null, store: null }, { status: 500 })
  }
}
