// KinShop — Récupération de mot de passe (mission sécurité 2026-09-15)
// ⚠️ Server-only : à importer UNIQUEMENT dans les routes API.
//
// Principes :
// - Token brut = 32 octets CSPRNG (64 hex) — généré côté serveur, n'existe QUE
//   dans l'email envoyé. La base ne stocke QUE son SHA-256 (même contrat que
//   les sessions opaques V8).
// - Usage unique + expiration (60 min) + révocation (nouvelle demande ou usage).
// - Anti-énumération : la route forgot répond toujours la même chose ; le coût
//   CPU (scrypt) est égalisé pour les emails inconnus (burn factice) afin de
//   réduire l'écart temporel observable.
// - Jamais de token brut ni de mot de passe dans les logs (audit via logAudit).

import { createHash, randomBytes, scryptSync } from "crypto"

/** Longueur de validité du lien de réinitialisation. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 60 minutes

/** Génère un token cryptographiquement sûr et imprévisible (256 bits d'entropie). */
export function generateResetToken(): string {
  return randomBytes(32).toString("hex")
}

/** Hash SHA-256 du token — la seule forme stockée en base. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Égalisation temporelle anti-énumération : pour un email inconnu, on exécute
 * un scrypt factice dont le coût est comparable à verifyPassword() du chemin
 * "compte existant". Réduit l'écart de latence exploitable entre « existe »
 * et « n'existe pas » (aucune réponse ne diffère côté client).
 */
export function burnCpuForTiming(): void {
  const salt = randomBytes(16).toString("hex")
  scryptSync("timing-equalizer-kinshop", salt, 64)
}

/**
 * Politique de mot de passe à la réinitialisation.
 * Cohérente avec l'inscription (8 caractères minimum) + refus des mots de
 * passe manifestement faibles/prévisibles et de toute valeur dérivée de
 * l'email. Retourne null si OK, sinon un message d'erreur (FR).
 */
const WEAK_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "motdepasse",
  "motdepasse1",
  "azertyuiop",
  "azerty123",
  "qwertyuiop",
  "qwerty123",
  "00000000",
  "11111111",
  "12121212",
  "12341234",
  "88888888",
  "iloveyou",
  "kinshop",
  "kinshop123",
  "kinshop2026",
  "abc12345",
  "abcd1234",
])

export function validateNewPassword(password: string, email: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Le mot de passe doit contenir au moins 8 caractères."
  }
  if (password.length > 72) {
    return "Le mot de passe ne peut pas dépasser 72 caractères."
  }
  const lower = password.toLowerCase()
  if (WEAK_PASSWORDS.has(lower)) {
    return "Ce mot de passe est trop faible ou trop prévisible. Choisis-en un plus solide."
  }
  const emailLower = email.toLowerCase()
  const localPart = emailLower.split("@")[0]
  if (lower === emailLower || (localPart.length >= 4 && lower.includes(localPart))) {
    return "Ce mot de passe est trop facile à deviner à partir de ton email. Choisis-en un autre."
  }
  return null
}
