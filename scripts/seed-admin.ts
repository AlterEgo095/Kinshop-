// KinShop — Création / mise à jour du compte ADMINISTRATEUR (rôle admin).
//
// Usage (depuis la racine du projet) :
//   ADMIN_EMAIL="kinshop@aenews.store" ADMIN_PASSWORD="••••" bun scripts/seed-admin.ts
//   ADMIN_EMAIL="kinshop@aenews.store" ADMIN_PASSWORD_HASH="s1\$salt\$hash" bun scripts/seed-admin.ts
//
// • Le mot de passe n'est JAMAIS stocké en clair : scrypt (format s1$salt$hash),
//   identique au système d'authentification utilisateur (src/lib/auth.ts).
// • ADMIN_PASSWORD_HASH permet de provisionner un serveur sans jamais y
//   transmettre le mot de passe en clair (le hash est calculé ailleurs).
// • Sécurité : toute session existante du compte est révoquée (le changement
//   de mot de passe prend effet immédiatement partout).

import { PrismaClient } from "@prisma/client"
import { randomBytes, scryptSync } from "crypto"

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `s1$${salt}$${hash}`
}

function looksLikeValidHash(hash: string): boolean {
  const parts = hash.split("$")
  return (
    parts.length === 3 &&
    parts[0] === "s1" &&
    parts[1].length === 32 &&
    parts[2].length === 128 &&
    /^[0-9a-f]+$/.test(parts[1]) &&
    /^[0-9a-f]+$/.test(parts[2])
  )
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD || ""
  const passwordHashInput = process.env.ADMIN_PASSWORD_HASH || ""

  if (!email || !email.includes("@")) {
    console.error("✗ ADMIN_EMAIL requis (adresse email valide).")
    process.exit(1)
  }

  if (passwordHashInput) {
    if (!looksLikeValidHash(passwordHashInput)) {
      console.error("✗ ADMIN_PASSWORD_HASH invalide (format attendu : s1$salt$hash scrypt 64 octets).")
      process.exit(1)
    }
  } else if (password) {
    if (password.length < 8) {
      console.error("✗ ADMIN_PASSWORD trop faible : 8 caractères minimum.")
      process.exit(1)
    }
  } else {
    console.error("✗ Fournis ADMIN_PASSWORD ou ADMIN_PASSWORD_HASH.")
    process.exit(1)
  }

  const hash = passwordHashInput || hashPassword(password)

  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash: hash, role: "admin", status: "active" },
    create: {
      email,
      passwordHash: hash,
      role: "admin",
      status: "active",
      name: "KinShop Admin",
    },
  })

  // Hygiène : révoque les sessions existantes du compte (changement de mot de
  // passe effectif immédiat, plus aucune session héritée).
  const revoked = await db.session.deleteMany({ where: { userId: user.id } })

  console.log(
    `✓ Administrateur prêt : ${user.email} (id=${user.id}, role=${user.role}, status=${user.status}) — ${revoked.count} session(s) révoquée(s)`,
  )
}

main()
  .catch((e) => {
    console.error("✗ Échec du seed admin :", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
