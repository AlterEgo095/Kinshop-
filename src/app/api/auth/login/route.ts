// POST /api/auth/login — Connexion utilisateur (V8)

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/ratelimit"

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
      return NextResponse.json({ error: "Email ou mot de passe incorrect." }, { status: 401 })
    }

    const { token, expiresAt } = await createSession(user.id)

    // Boutique du vendeur (un utilisateur = une boutique)
    const store = await db.store.findFirst({
      where: { ownerId: user.id },
      select: { slug: true, name: true, logoEmoji: true },
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
