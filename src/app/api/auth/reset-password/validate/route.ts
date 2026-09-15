// POST /api/auth/reset-password/validate — Validation d'un token de réinitialisation
// (mission sécurité 2026-09-15)
//
// Appelée par la page /reset-password AVANT d'afficher le formulaire.
// - Vérifie côté serveur : token présent, hash connu, non expiré, non utilisé,
//   non révoqué, compte actif.
// - Ne révèle JAMAIS d'information sur le compte (pas d'email, pas de nom).
// - Rate limiting : 30 validations / 15 min / IP (l'anti brute-force du token
//   lui-même est structurel : 256 bits d'entropie, hashé en base).

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clientIp, rateLimit } from "@/lib/ratelimit"
import { hashResetToken } from "@/lib/pwreset"

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    if (!rateLimit(`pwval:ip:${ip}`, 30, 15 * 60 * 1000)) {
      return NextResponse.json({ valid: false }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    const token = String(body?.token || "").trim()
    if (!token || token.length < 32 || token.length > 128) {
      return NextResponse.json({ valid: false })
    }

    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: { expiresAt: true, usedAt: true, revokedAt: true, user: { select: { status: true } } },
    })

    const valid =
      !!row &&
      !row.usedAt &&
      !row.revokedAt &&
      row.expiresAt.getTime() > Date.now() &&
      row.user.status === "active"

    return NextResponse.json({ valid })
  } catch (e) {
    console.error("POST /api/auth/reset-password/validate", e)
    return NextResponse.json({ valid: false }, { status: 500 })
  }
}
