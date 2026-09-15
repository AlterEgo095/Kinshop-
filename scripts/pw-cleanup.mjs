// KinShop — Nettoyage des tokens de récupération de mot de passe (mission sécurité 2026-09-15)
// Exécuté quotidiennement par le cron de l'utilisateur aenews.
// Supprime : tokens expirés (> 7 j), tokens utilisés (> 7 j), tokens révoqués (> 7 j),
// sessions expirées (> 7 j). Les entrées du journal d'audit ne sont JAMAIS supprimées.
// Exécution : /home/aenews/.bun/bin/bun /opt/KINSHOP/scripts/pw-cleanup.mjs

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const CUTOFF_DAYS = 7

async function main() {
  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 60 * 60 * 1000)
  const now = new Date()

  const expired = await db.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  })
  const used = await db.passwordResetToken.deleteMany({
    where: { usedAt: { not: null }, usedAt: { lt: cutoff } },
  })
  const revoked = await db.passwordResetToken.deleteMany({
    where: { revokedAt: { not: null }, revokedAt: { lt: cutoff }, usedAt: null, expiresAt: { gte: cutoff } },
  })
  const sessions = await db.session.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  })

  console.log(
    `[pw-cleanup] ${new Date().toISOString()} — tokens expirés: ${expired.count}, utilisés: ${used.count}, révoqués: ${revoked.count}, sessions expirées: ${sessions.count}`,
  )
}

main()
  .catch((e) => {
    console.error("[pw-cleanup] ERREUR:", e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
