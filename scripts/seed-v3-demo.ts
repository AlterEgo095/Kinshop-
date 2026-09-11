// Seed V3 KinFacture — Facture de démonstration pour la boutique Maman Ngo
// Usage : bun run scripts/seed-v3-demo.ts (idempotent)

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const DEMO_SLUG = "maman-ngo"

async function main() {
  console.log("🌱 Seed V3 — facture démo KinFacture…")

  const store = await db.store.findUnique({ where: { slug: DEMO_SLUG } })
  if (!store) {
    console.log(`⚠️ Boutique « ${DEMO_SLUG} » introuvable — lance d'abord scripts/seed-kinshop.ts`)
    return
  }

  const existing = await db.invoice.findUnique({ where: { number: "KF-DEMO01" } })
  if (existing) {
    console.log("✅ Facture démo déjà présente (KF-DEMO01)")
    return
  }

  const items = [
    { desc: "Pagne wax premium (6 yards) — lot de 10", qty: 10, unitFC: 68400 },
    { desc: "Livraison Gombe → Limete", qty: 1, unitFC: 15000 },
  ]
  const totalFC = items.reduce((s, it) => s + it.qty * it.unitFC, 0)
  const totalUSD = Math.round((totalFC / store.rateFC) * 100) / 100

  await db.invoice.create({
    data: {
      number: "KF-DEMO01",
      storeId: store.id,
      clientName: "ONG Lumière Kinshasa",
      clientPhone: "243812345678",
      items: JSON.stringify(items),
      totalFC,
      totalUSD,
      note: "Merci pour votre confiance — paiement par mobile money, référence KF-DEMO01.",
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      status: "sent",
    },
  })

  console.log(`✅ Facture démo créée : KF-DEMO01 — ${totalFC} FC (${totalUSD} $) pour ${store.name}`)
  console.log(`   Lien public : /#/facture/KF-DEMO01`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
