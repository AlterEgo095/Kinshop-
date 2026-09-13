// POST /api/auth/login — Connexion utilisateur (V8)
// P5 (F5-5) : chaque tentative (échec / succès) laisse une trace d'audit —
// jamais de mot de passe, uniquement email, issue et IP.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    // Anti brute-force : 60 tentatives / 15 min / IP (tolérant au CGNAT)
    if (!rateLimit(`login:${ip}`, 60, 15 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de tentatives de connexion. Réessaie dans quelques minutes." },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => null)
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis." }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    // Message générique : ne pas révéler si l'email existe (énumération de comptes)
    if (!user || !verifyPassword(password, user.passwordHash)) {
      await logAudit({
        action: "auth.login_failed",
        target: `auth:${email.slice(0, 120)}`,
        detail: `Échec de connexion — IP ${ip}`,
        actorType: "user",
        entityType: "auth",
        entityId: user?.id ?? "",
      })
      return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 })
    }

    // P5 (F5-3) — compte suspendu par l'administration : connexion refusée
    if (user.status === "suspended") {
      await logAudit({
        action: "auth.login_blocked",
        target: `auth:${email.slice(0, 120)}`,
        detail: `Connexion refusée — compte suspendu${user.suspendedReason ? ` — motif : ${user.suspendedReason}` : ""} — IP ${ip}`,
        actorType: "user",
        actorId: user.id,
        entityType: "auth",
        entityId: user.id,
      })
      return NextResponse.json(
        {
          error:
            "Ce compte a été suspendu par l'administration KinShop. Contacte le support si tu penses qu'il s'agit d'une erreur.",
        },
        { status: 403 },
      )
    }

    const { token, expiresAt } = await createSession(user.id)

    // Boutique du vendeur (un utilisateur = une boutique)
    const store = await db.store.findFirst({
      where: { ownerId: user.id },
      select: { slug: true, name: true, logoEmoji: true },
    })

    await logAudit({
      action: "auth.login",
      target: `auth:${user.email.slice(0, 120)}`,
      detail: `Connexion réussie — IP ${ip}`,
      actorType: "user",
      actorId: user.id,
      entityType: "auth",
      entityId: user.id,
    })

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, whatsapp: user.whatsapp },
      store: store || null,
    })
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (e) {
    console.error("POST /api/auth/login", e)
    return NextResponse.json({ error: "Erreur serveur lors de la connexion." }, { status: 500 })
  }
}
