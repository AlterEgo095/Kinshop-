// KinShop — Envoi d'emails transactionnels (mission sécurité 2026-09-15)
// ⚠️ Server-only : à importer UNIQUEMENT dans les routes API.
//
// Infrastructure : SMTP authentifié + TLS implicite (port 465) via le serveur
// mail de production (mailcow). Domaine expéditeur aligné SPF/DKIM/DMARC :
// v=spf1 mx a -all ; dkim._domainkey.aenews.digital (RSA 2048, rspamd signe) ;
// _dmarc p=none adkim=s aspf=s → conformité DMARC stricte sur le From.
//
// Sécurité : JAMAIS de mot de passe ni de secret dans les logs ; le transport
// est initialisé paresseusement (les variables SMTP_* vivent uniquement dans
// le .env du serveur). Timeout borné + 1 retry unique sur erreur transitoire.
// Échec d'envoi ≠ échec HTTP de la route appelante : la route gère elle-même
// la réponse générique et l'audit.

import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

let cachedTransport: Transporter | null = null

function getTransport(): Transporter {
  if (cachedTransport) return cachedTransport
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || "465")
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) {
    throw new Error("SMTP_NON_CONFIGURE")
  }
  cachedTransport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // TLS implicite (SMTPS)
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
    tls: { rejectUnauthorized: true }, // vérification stricte du certificat
  })
  return cachedTransport
}

const PLATFORM = "KinShop"
const APP_URL = process.env.APP_URL || "https://kinshop.store"

function baseLayout(title: string, bodyHtml: string): string {
  const year = new Date().getFullYear()
  return `<!doctype html>
<html lang="fr">
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#059669;padding:20px 28px;">
          <span style="font-size:20px;color:#ffffff;font-weight:700;text-decoration:none;">🛍️ Kin<span style="color:#a7f3d0">Shop</span></span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${title}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 28px 24px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
            © ${year} ${PLATFORM} — La plateforme boutiques WhatsApp de Kinshasa.<br>
            Cet email vous a été envoyé suite à une action sur ${APP_URL}. Vous ne recevrez jamais votre mot de passe par email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Envoyer un email avec 1 retry unique sur erreur transitoire. */
async function sendWithRetry(mail: { to: string; subject: string; html: string; text: string }): Promise<void> {
  const from = process.env.SMTP_FROM || `${PLATFORM} <${process.env.SMTP_USER}>`
  try {
    await getTransport().sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text })
    return
  } catch (first) {
    // 1 seul retry après 1,5 s (erreur transitoire réseau/SMTP) — jamais de boucle.
    await new Promise((r) => setTimeout(r, 1500))
    await getTransport().sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text })
  }
}

/**
 * Email de réinitialisation : lien sécurisé https://kinshop.store/reset-password?token=…
 * Ne contient JAMAIS le mot de passe, ni aucune donnée sensible au-delà du prénom.
 */
export async function sendPasswordResetEmail(to: string, name: string, rawToken: string, ttlMinutes: number): Promise<void> {
  const link = `${APP_URL}/reset-password?token=${encodeURIComponent(rawToken)}`
  const title = "Réinitialisation de votre mot de passe"
  const prenom = (name || "").split(" ")[0] || "bonjour"
  const html = baseLayout(
    title,
    `<p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">Bonjour <strong>${prenom}</strong>,</p>
     <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">Vous avez demandé la réinitialisation du mot de passe de votre compte ${PLATFORM}. Cliquez sur le bouton ci-dessous pour en choisir un nouveau :</p>
     <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 18px;"><tr><td align="center">
       <a href="${link}" style="display:inline-block;background:#059669;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:13px 30px;border-radius:10px;">Réinitialiser mon mot de passe</a>
     </td></tr></table>
     <p style="margin:0 0 10px;font-size:13px;color:#6b7280;line-height:1.7;">Ce lien est <strong>valable ${ttlMinutes} minutes</strong> et ne peut être utilisé qu'une seule fois. Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :</p>
     <p style="margin:0 0 16px;font-size:12px;color:#059669;word-break:break-all;">${link}</p>
     <p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;">
       ⚠️ Si vous n'êtes pas à l'origine de cette demande, <strong>ignorez cet email</strong> : votre mot de passe actuel reste inchangé.
     </p>`,
  )
  const text = [
    `Bonjour ${prenom},`,
    "",
    `Vous avez demandé la réinitialisation du mot de passe de votre compte ${PLATFORM}.`,
    `Lien (valable ${ttlMinutes} minutes, usage unique) :`,
    link,
    "",
    "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe actuel reste inchangé.",
  ].join("\n")
  await sendWithRetry({ to, subject: `Réinitialisation de votre mot de passe — ${PLATFORM}`, html, text })
}

/**
 * Email de confirmation de modification du mot de passe (sécurité).
 * Ne contient JAMAIS le nouveau mot de passe.
 */
export async function sendPasswordChangedEmail(to: string, name: string): Promise<void> {
  const title = "Votre mot de passe a été modifié"
  const prenom = (name || "").split(" ")[0] || "bonjour"
  const when = new Date().toLocaleString("fr-FR", { timeZone: "Africa/Kinshasa", dateStyle: "full", timeStyle: "short" })
  const html = baseLayout(
    title,
    `<p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">Bonjour <strong>${prenom}</strong>,</p>
     <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">Le mot de passe de votre compte ${PLATFORM} vient d'être modifié le <strong>${when}</strong> (heure de Kinshasa).</p>
     <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.7;">Toutes les sessions actives ont été déconnectées. Vous pouvez vous connecter avec votre nouveau mot de passe.</p>
     <p style="margin:0;font-size:13px;color:#b91c1c;line-height:1.6;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;">
       ⚠️ Vous n'êtes pas à l'origine de cette modification ? Contactez immédiatement le support ${PLATFORM}.
     </p>`,
  )
  const text = [
    `Bonjour ${prenom},`,
    "",
    `Le mot de passe de votre compte ${PLATFORM} vient d'être modifié le ${when} (heure de Kinshasa).`,
    "Toutes les sessions actives ont été déconnectées.",
    "Vous n'êtes pas à l'origine de cette modification ? Contactez immédiatement le support KinShop.",
  ].join("\n")
  await sendWithRetry({ to, subject: `Votre mot de passe a été modifié — ${PLATFORM}`, html, text })
}
