// POST /api/auth/reset-password — Consommation atomique du token + nouveau mot de passe
// (mission sécurité 2026-09-15)
//
// SÉCURITÉ :
// - Claim-then-act ATOMIQUE : le token est consommé par un updateMany
//   conditionnel (usedAt:null, revokedAt:null, expiresAt futur). SQLite
//   sérialise les écritures → deux requêtes concurrentes avec le même token
//   ne peuvent JAMAIS réussir toutes les deux (la 2e trouve 0 ligne).
// - Après consommation : hash scrypt existant (s1$salt$hash — aucun changement
//   global du système de hash), révocation de TOUS les autres tokens actifs de
//   l'utilisateur et suppression de TOUTES ses sessions (architecture sessions
//   opaques serveur → révocation réelle et immédiate).
// - Politique de mot de passe : 8 caractères minimum (cohérent inscription) +
//   refus des valeurs manifestement faibles / dérivées de l'email.
// - Audit complet sans token brut ni mot de passe.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clientIp, rateLimit } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"
import { hashPassword } from "@/lib/auth"
import { hashResetToken, validateNewPassword } from "@/lib/pwreset"
import { sendPasswordChangedEmail } from "@/lib/mailer"

const GENERIC_INVALID =
  "Ce lien de réinitialisation est invalide, expiré ou a déjà été utilisé. Demande un nouveau lien."

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    if (!rateLimit(`pwreset:ip:${ip}`, 10, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de tentatives. Réessaie dans quelques minutes." },
        { status: 429 },
      )
    }

    const body = await req.json().catch(() => null)
    const token = String(body?.token || "").trim()
    const password = typeof body?.password === "string" ? body.password : ""
    if (!token || token.length < 32 || token.length > 128) {
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 })
    }

    const tokenHash = hashResetToken(token)

    // Protection par token (complémentaire) : 10 tentatives / 30 min / token
    if (!rateLimit(`pwreset:tk:${tokenHash.slice(0, 24)}`, 10, 30 * 60 * 1000)) {
      return NextResponse.json(
        { error: "Trop de tentatives pour ce lien. Demande un nouveau lien de réinitialisation." },
        { status: 429 },
      )
    }

    // Lecture unique token + utilisateur (aucune écriture à ce stade)
    const row = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        user: { select: { id: true, email: true, name: true, status: true } },
      },
    })
    if (!row || row.usedAt || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
      await logAudit({
        action: "auth.password_reset_invalid_token",
        target: "auth:password-reset",
        detail: `Tentative avec token invalide/expiré/utilisé — IP ${ip}`,
        actorType: "user",
        entityType: "auth",
      }).catch(() => {})
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 })
    }

    // Compte actif obligatoire (cohérent avec le fail-closed login P5)
    if (!row.user || row.user.status !== "active") {
      return NextResponse.json(
        { error: "Ce compte ne peut pas être réinitialisé. Contacte le support KinShop." },
        { status: 403 },
      )
    }

    // Politique de mot de passe (avant toute écriture — avec le vrai email)
    const policyError = validateNewPassword(password, row.user.email)
    if (policyError) {
      await logAudit({
        action: "auth.password_reset_failed",
        target: `auth:${row.user.email.slice(0, 120)}`,
        detail: `Mot de passe refusé par la politique — IP ${ip}`,
        actorType: "user",
        actorId: row.user.id,
        entityType: "auth",
        entityId: row.user.id,
      }).catch(() => {})
      return NextResponse.json({ error: policyError }, { status: 400 })
    }

    // ── ÉTAPE 1 : consommation ATOMIQUE du token (claim-then-act) ──────────
    // SQLite sérialise les écritures : deux requêtes concurrentes ne peuvent
    // jamais consommer le même token (la seconde voit usedAt non-null → 0 ligne).
    const now = new Date()
    const claim = await db.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claim.count !== 1) {
      await logAudit({
        action: "auth.password_reset_race_blocked",
        target: "auth:password-reset",
        detail: `Tentative concurrente de consommation refusée — IP ${ip}`,
        actorType: "user",
        entityType: "auth",
      }).catch(() => {})
      return NextResponse.json({ error: GENERIC_INVALID }, { status: 400 })
    }

    // ── ÉTAPE 2 : changement du mot de passe + invalidation sessions + tokens ──
    await db.$transaction([
      db.user.update({
        where: { id: row.userId },
        data: { passwordHash: hashPassword(password) },
      }),
      // Architecture sessions opaques serveur → révocation réelle : suppression
      // de toutes les sessions (l'utilisateur devra se reconnecter partout).
      db.session.deleteMany({ where: { userId: row.userId } }),
      // Tous les AUTRES tokens actifs de l'utilisateur deviennent inutilisables
      db.passwordResetToken.updateMany({
        where: { userId: row.userId, id: { not: row.id }, usedAt: null, revokedAt: null },
        data: { revokedAt: now },
      }),
    ])

    await logAudit({
      action: "auth.password_reset_completed",
      target: `auth:${row.user.email.slice(0, 120)}`,
      detail: `Mot de passe réinitialisé avec succès — toutes les sessions révoquées, tous les tokens de récupération invalidés — IP ${ip}`,
      actorType: "user",
      actorId: row.user.id,
      entityType: "auth",
      entityId: row.user.id,
    })

    // ── ÉTAPE 3 : email de confirmation de sécurité (non bloquant) ──────────
    try {
      await sendPasswordChangedEmail(row.user.email, row.user.name)
    } catch (mailError) {
      await logAudit({
        action: "auth.password_reset_email_failed",
        target: `auth:${row.user.email.slice(0, 120)}`,
        detail: `Échec d'envoi de l'email de confirmation (mot de passe bien modifié) — IP ${ip}`,
        actorType: "user",
        actorId: row.user.id,
        entityType: "auth",
        entityId: row.user.id,
      }).catch(() => {})
      console.error("POST /api/auth/reset-password : email de confirmation échoué (non bloquant)")
    }

    return NextResponse.json({
      message: "Mot de passe réinitialisé avec succès. Tu peux maintenant te connecter avec ton nouveau mot de passe.",
    })
  } catch (e) {
    console.error("POST /api/auth/reset-password", e)
    return NextResponse.json(
      { error: "Erreur serveur lors de la réinitialisation. Réessaie dans quelques instants." },
      { status: 500 },
    )
  }
}
