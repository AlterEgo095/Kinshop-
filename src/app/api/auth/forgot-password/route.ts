// POST /api/auth/forgot-password — Demande de réinitialisation de mot de passe
// (mission sécurité 2026-09-15)
//
// SÉCURITÉ :
// - Réponse TOUJOURS identique (200 + message générique) que le compte existe
//   ou non, qu'il soit suspendu, etc. → aucune énumération de comptes.
// - Coût CPU égalisé (scrypt factice) pour les emails inconnus : réduit
//   l'écart temporel observable entre « existe » et « n'existe pas ».
// - Rate limiting : 5 demandes/h/IP + 3 demandes/h/email (réutilise
//   l'infrastructure rateLimit() V8 ; mono-instance PM2, cohérent).
// - Token : 256 bits CSPRNG, seul le SHA-256 est stocké, 60 min, usage unique.
//   Une nouvelle demande révoque immédiatement les tokens précédents.
// - Audit : password_reset.* via logAudit — jamais de token brut.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { clientIp, rateLimit } from "@/lib/ratelimit"
import { logAudit } from "@/lib/audit"
import { burnCpuForTiming, generateResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "@/lib/pwreset"
import { sendPasswordResetEmail } from "@/lib/mailer"

const GENERIC_MESSAGE =
  "Si un compte est associé à cette adresse email, un lien de réinitialisation vous sera envoyé. Vérifiez votre boîte de réception (et vos spams)."

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    const body = await req.json().catch(() => null)
    const email = String(body?.email || "").trim().toLowerCase()

    // Rate limiting (l'échec 429 est lui-même neutre : il ne révèle rien)
    if (!rateLimit(`pwreq:ip:${ip}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json(
        { message: "Trop de demandes. Réessaie dans quelques minutes." },
        { status: 429 },
      )
    }
    if (!email || !EMAIL_RE.test(email) || email.length > 120) {
      // Format invalide : réponse générique identique (aucune information divulguée)
      return NextResponse.json({ message: GENERIC_MESSAGE })
    }
    if (!rateLimit(`pwreq:em:${email}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { message: "Trop de demandes pour cette adresse. Réessaie dans quelques minutes." },
        { status: 429 },
      )
    }

    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, status: true } })

    if (user && user.status === "active") {
      // ── Chemin « compte actif » ──────────────────────────────────────────
      // Nettoyage opportuniste des tokens expirés (évite la croissance infinie)
      await db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {})

      const rawToken = generateResetToken()
      const tokenHash = hashResetToken(rawToken)
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

      // Transaction : révocation des tokens précédents + création du nouveau
      await db.$transaction([
        db.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
        db.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt, requestIp: ip.slice(0, 45) },
        }),
      ])

      await logAudit({
        action: "auth.password_reset_token_created",
        target: `auth:${email.slice(0, 120)}`,
        detail: `Token de réinitialisation créé (60 min, usage unique) — IP ${ip}`,
        actorType: "user",
        actorId: user.id,
        entityType: "auth",
        entityId: user.id,
      })

      try {
        await sendPasswordResetEmail(email, user.name, rawToken, RESET_TOKEN_TTL_MS / 60_000)
        await logAudit({
          action: "auth.password_reset_email_sent",
          target: `auth:${email.slice(0, 120)}`,
          detail: `Email de réinitialisation envoyé — IP ${ip}`,
          actorType: "user",
          actorId: user.id,
          entityType: "auth",
          entityId: user.id,
        })
      } catch (mailError) {
        // Échec d'envoi : réponse générique inchangée, mais l'incident est tracé
        await logAudit({
          action: "auth.password_reset_email_failed",
          target: `auth:${email.slice(0, 120)}`,
          detail: `Échec d'envoi email de réinitialisation (${mailError instanceof Error ? mailError.message.slice(0, 120) : "erreur inconnue"}) — IP ${ip}`,
          actorType: "user",
          actorId: user.id,
          entityType: "auth",
          entityId: user.id,
        }).catch(() => {})
        console.error("POST /api/auth/forgot-password : envoi email échoué (réponse générique conservée)")
      }
    } else {
      // ── Chemin « email inconnu / compte suspendu / supprimé » ───────────
      // Égalisation temporelle : coût CPU comparable au chemin « compte actif »
      // (verifyPassword scrypt) — la réponse reste strictement identique.
      burnCpuForTiming()

      if (user) {
        // Compte suspendu : pas d'email, trace interne dédiée
        await logAudit({
          action: "auth.password_reset_blocked_suspended",
          target: `auth:${email.slice(0, 120)}`,
          detail: `Demande de réinitialisation refusée (compte suspendu) — IP ${ip}`,
          actorType: "user",
          actorId: user.id,
          entityType: "auth",
          entityId: user.id,
        }).catch(() => {})
      } else {
        await logAudit({
          action: "auth.password_reset_unknown_email",
          target: `auth:${email.slice(0, 120)}`,
          detail: `Demande de réinitialisation pour un email sans compte — IP ${ip}`,
          actorType: "user",
          entityType: "auth",
        }).catch(() => {})
      }
    }

    // Réponse générique — IDENTIQUE dans tous les cas (anti-énumération)
    return NextResponse.json({ message: GENERIC_MESSAGE })
  } catch (e) {
    console.error("POST /api/auth/forgot-password", e)
    // Même en erreur serveur inattendue : message neutre (pas d'énumération)
    return NextResponse.json(
      { message: "Une erreur est survenue. Réessaie dans quelques instants." },
      { status: 500 },
    )
  }
}
