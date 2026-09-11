// Seed V6 KinShop — Confiance & Croissance : zones de livraison, codes promo et avis
// de démonstration pour la boutique Maman Ngo.
// Usage : bun run scripts/seed-v6-demo.ts (idempotent)

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const DEMO_SLUG = "maman-ngo"

const ZONES = [
  { name: "Gombe", feeFC: 500 },
  { name: "Ngaliema", feeFC: 800 },
  { name: "Limete", feeFC: 1000 },
  { name: "Masina", feeFC: 1500 },
  { name: "Kinshasa (centre-ville)", feeFC: 0 },
]

const COUPONS = [
  { code: "BIENVENUE10", type: "percent", value: 10, minTotalUSD: 0, maxUses: 0 },
  { code: "NGOMA2", type: "fixed", value: 2, minTotalUSD: 15, maxUses: 100 },
]

async function main() {
  console.log("🌱 Seed V6 — zones de livraison, codes promo & avis démo…")

  const store = await db.store.findUnique({ where: { slug: DEMO_SLUG } })
  if (!store) {
    console.log(`⚠️ Boutique « ${DEMO_SLUG} » introuvable — lance d'abord scripts/seed-kinshop.ts`)
    return
  }

  // ── Zones de livraison (skip si déjà présentes) ──
  let zonesAdded = 0
  for (const z of ZONES) {
    const exists = await db.deliveryZone.findUnique({
      where: { storeId_name: { storeId: store.id, name: z.name } },
    })
    if (!exists) {
      await db.deliveryZone.create({
        data: { storeId: store.id, name: z.name, feeFC: z.feeFC, active: true },
      })
      zonesAdded += 1
    }
  }
  console.log(`🚚 Zones : ${zonesAdded} ajoutée(s), ${ZONES.length - zonesAdded} déjà présente(s)`)

  // ── Codes promo (skip si déjà présents) ──
  let couponsAdded = 0
  for (const c of COUPONS) {
    const exists = await db.coupon.findUnique({
      where: { storeId_code: { storeId: store.id, code: c.code } },
    })
    if (!exists) {
      await db.coupon.create({
        data: {
          storeId: store.id,
          code: c.code,
          type: c.type,
          value: c.value,
          minTotalUSD: c.minTotalUSD,
          maxUses: c.maxUses,
          active: true,
        },
      })
      couponsAdded += 1
    }
  }
  console.log(`🏷️ Codes promo : ${couponsAdded} ajouté(s), ${COUPONS.length - couponsAdded} déjà présent(s)`)

  // ── Avis clients (attachés à une commande démo existante si possible) ──
  let reviewsAdded = 0
  const demoOrder = await db.order.findFirst({
    where: { storeId: store.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  const REVIEWS = [
    {
      authorName: "Chantal M.",
      rating: 5,
      comment:
        "Livraison rapide à Gombe, le pagne était exactement comme sur les photos. Je recommande Maman Ngo à toutes mes copines !",
      useOrder: true,
    },
    {
      authorName: "Jean-Paul K.",
      rating: 5,
      comment: "Commande passée le matin, livrée le soir même. Communication impeccable sur WhatsApp.",
      useOrder: false,
    },
    {
      authorName: "Espérance L.",
      rating: 4,
      comment: "Bonne qualité, prix corrects. Juste un petit retard de livraison à Masina, mais le vendeur a prévenu.",
      useOrder: false,
    },
    {
      authorName: "Nadine B.",
      rating: 5,
      comment: "Ma boutique préférée pour les tissus wax. Le paiement M-Pesa est très pratique.",
      useOrder: false,
    },
  ]

  for (const r of REVIEWS) {
    // Idempotence : 1 avis max par auteur pour cette boutique
    const exists = await db.review.findFirst({
      where: { storeId: store.id, authorName: r.authorName },
    })
    if (exists) continue
    let orderId = ""
    if (r.useOrder && demoOrder) {
      const alreadyLinked = await db.review.findFirst({ where: { orderId: demoOrder.id } })
      if (!alreadyLinked) orderId = demoOrder.id
    }
    await db.review.create({
      data: {
        storeId: store.id,
        orderId,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        hidden: false,
      },
    })
    reviewsAdded += 1
  }
  console.log(`⭐ Avis : ${reviewsAdded} ajouté(s)`)

  console.log("✅ Seed V6 terminé — boutique démo enrichie :")
  console.log(`   Boutique : /#/boutique/${DEMO_SLUG}`)
  console.log("   Codes actifs : BIENVENUE10 (-10%), NGOMA2 (-2$ dès 15$)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
