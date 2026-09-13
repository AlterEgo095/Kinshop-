// POST /api/auth/register — Création de compte utilisateur (V8)
// Un compte = une identité authentifiée. La création de boutique exige ce compte.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createSession, hashPassword, setSessionCookie } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    // Anti-spam : 30 inscriptions/heure/IP (tolérant au CGNAT des opérateurs mobiles,
    // tout en bloquant un spammeur mono-IP)
    if (!rateLimit(`register:${clientIp(req)}`, 30, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de tentatives d'inscription. Réessaie dans une heure." },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => null)
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const password = String(body?.password || "")
    const whatsapp = String(body?.whatsapp || "").replace(/\D/g, "")

    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: "Ton nom est requis (2 à 60 caractères)." }, { status: 400 })
    }
    if (!EMAIL_RE.test(email) || email.length > 120) {
      return NextResponse.json({ error: "Adresse email invalide." }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Le mot de passe doit contenir au moins 8 caractères." },
        { status: 400 },
      )
    }
    if (whatsapp && whatsapp.length < 9) {
      return NextResponse.json({ error: "Numéro WhatsApp invalide (ex : 0812345678)." }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email. Connecte-toi plutôt." },
        { status: 409 },
      )
    }

    const user = await db.user.create({
      data: {
        name,
        email,
        whatsapp,
        passwordHash: hashPassword(password),
      },
    })

    const { token, expiresAt } = await createSession(user.id)

    // P5 (F5-5) — création de compte tracée (jamais de mot de passe dans le journal)
    await logAudit({
      action: "auth.register",
      target: `auth:${user.email.slice(0, 120)}`,
      detail: `Nouveau compte créé — IP ${clientIp(req)}`,
      actorType: "user",
      actorId: user.id,
      entityType: "auth",
      entityId: user.id,
    })

    const res = NextResponse.json(
      {
        user: { id: user.id, email: user.email, name: user.name, whatsapp: user.whatsapp },
        store: null,
      },
      { status: 201 },
    )
    setSessionCookie(res, token, expiresAt)
    return res
  } catch (e) {
    console.error("POST /api/auth/register", e)
    return NextResponse.json({ error: "Erreur serveur lors de la création du compte." }, { status: 500 })
  }
}
