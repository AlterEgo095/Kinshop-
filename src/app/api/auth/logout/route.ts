// POST /api/auth/logout — Déconnexion (supprime la session côté serveur)
// P5 (F5-5) : déconnexion tracée dans le journal d'audit.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clearSessionCookie, destroySession } from "@/lib/auth"
import { logAudit } from "@/lib/audit"

export async function POST(req: NextRequest) {
  const token = req.cookies.get("kinshop_session")?.value
  if (token) {
    // Identifier l'utilisateur AVANT la destruction de la session (trace)
    const tokenHash = (await import("crypto")).createHash("sha256").update(token).digest("hex")
    const session = await db.session
      .findUnique({ where: { tokenHash }, include: { user: { select: { id: true, email: true } } } })
      .catch(() => null)

    await destroySession(token)

    if (session?.user) {
      await logAudit({
        action: "auth.logout",
        target: `auth:${session.user.email.slice(0, 120)}`,
        detail: "Déconnexion (session détruite côté serveur)",
        actorType: "user",
        actorId: session.user.id,
        entityType: "auth",
        entityId: session.user.id,
      })
    }
  }

  const res = NextResponse.json({ ok: true })
  clearSessionCookie(res)
  return res
}
