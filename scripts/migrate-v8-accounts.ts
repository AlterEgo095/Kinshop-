// V8 — Migration locale : crée le compte démo et rattache les boutiques seedées
// Usage : bunx tsx scripts/migrate-v8-accounts.ts
// En production la base est vierge : ce script n'y est pas nécessaire.

import { PrismaClient } from "@prisma/client"
import { randomBytes, scryptSync } from "crypto"

const db = new PrismaClient()

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `s1$${salt}$${hash}`
}

async function main() {
  const email = "demo@kinshop.cd"
  const existing = await db.user.findUnique({ where: { email } })
  const user =
    existing ??
    (await db.user.create({
      data: {
        email,
        name: "Ngo Mputu (démo)",
        whatsapp: "243812345678",
        passwordHash: hashPassword("demo1234"),
      },
    }))
  console.log(`Compte démo : ${email} (mot de passe : demo1234)`)

  // Rattache la boutique démo au compte démo (les autres boutiques seedées restent orphelines)
  const store = await db.store.findUnique({ where: { slug: "maman-ngo" } })
  if (store && !store.ownerId) {
    await db.store.update({ where: { slug: "maman-ngo" }, data: { ownerId: user.id } })
    console.log("Boutique maman-ngo rattachée au compte démo ✅")
  } else if (store) {
    console.log("Boutique maman-ngo déjà rattachée.")
  } else {
    console.log("Boutique maman-ngo absente (lance d'abord le seed).")
  }
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
