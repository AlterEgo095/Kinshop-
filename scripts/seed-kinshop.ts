// Seed KinShop — Boutique démo « Maman Ngo »
// Usage : bun run scripts/seed-kinshop.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const DEMO_SLUG = "maman-ngo"

const PRODUCTS = [
  { name: "Pagne wax premium (6 yards)", emoji: "👗", priceUSD: 24, category: "Mode & Vêtements" },
  { name: "Sac à main cuir Kin Style", emoji: "👜", priceUSD: 18, category: "Mode & Vêtements" },
  { name: "Casque Bluetooth Bass+ 40h", emoji: "🎧", priceUSD: 15, category: "Électronique" },
  { name: "Chargeur solaire portable 20000mAh", emoji: "🔋", priceUSD: 12, category: "Électronique" },
  { name: "Riz parfumé — sac 25 kg", emoji: "🍚", priceUSD: 28, category: "Alimentation" },
  { name: "Huile de palme artisanale 5L", emoji: "🫗", priceUSD: 9, category: "Alimentation" },
  { name: "Beurre de karité pur 500g", emoji: "🧴", priceUSD: 6, category: "Beauté & Cosmétiques" },
  { name: "Savon noir africain x3", emoji: "🧼", priceUSD: 4, category: "Beauté & Cosmétiques" },
  { name: "Marmite en fonte 8L", emoji: "🍲", priceUSD: 22, category: "Maison & Cuisine" },
  { name: "Set 6 verres traditionnels", emoji: "🥃", priceUSD: 8, category: "Maison & Cuisine" },
  { name: "Ballon de football pro", emoji: "⚽", priceUSD: 14, category: "Divers" },
  { name: "Jus d'ananas naturel 1L (fait maison)", emoji: "🧃", priceUSD: 2.5, category: "Alimentation" },
]

async function main() {
  console.log("🌱 Seed KinShop…")

  // Boutique démo
  const existing = await db.store.findUnique({ where: { slug: DEMO_SLUG } })
  let store = existing
  if (!store) {
    store = await db.store.create({
      data: {
        slug: DEMO_SLUG,
        name: "Boutique Maman Ngo",
        ownerName: "Ngo Mputu",
        whatsapp: "243812345678",
        description:
          "Pagnes wax, électronique, produits du terroir et bien plus. Livraison rapide dans tout Kinshasa. Bienvenue chez moi ! 🇨🇩",
        city: "Kinshasa",
        logoEmoji: "🥑",
        rateFC: 2850,
      },
    })
    console.log("✅ Boutique démo créée :", store.name)
  } else {
    console.log("ℹ️  Boutique démo déjà présente :", store.name)
  }

  // Produits (si vides)
  const count = await db.product.count({ where: { storeId: store.id } })
  if (count === 0) {
    for (const p of PRODUCTS) {
      await db.product.create({ data: { ...p, storeId: store.id } })
    }
    console.log(`✅ ${PRODUCTS.length} produits ajoutés`)
  } else {
    console.log(`ℹ️  ${count} produits déjà présents`)
  }

  // Commandes d'exemple (si aucune)
  const orderCount = await db.order.count({ where: { storeId: store.id } })
  if (orderCount === 0) {
    const allProducts = await db.product.findMany({ where: { storeId: store.id }, take: 4 })
    if (allProducts.length >= 2) {
      const items1 = [
        { productId: allProducts[0].id, name: allProducts[0].name, emoji: allProducts[0].emoji, priceUSD: allProducts[0].priceUSD, qty: 2 },
      ]
      const items2 = [
        { productId: allProducts[1].id, name: allProducts[1].name, emoji: allProducts[1].emoji, priceUSD: allProducts[1].priceUSD, qty: 1 },
      ]
      const total1 = items1.reduce((s, i) => s + i.priceUSD * i.qty, 0)
      const total2 = items2.reduce((s, i) => s + i.priceUSD * i.qty, 0)
      await db.order.createMany({
        data: [
          {
            ref: "KIN-DEMO01",
            storeId: store.id,
            customerName: "Kabongo Jean",
            customerPhone: "243898765432",
            zone: "Gombe",
            items: JSON.stringify(items1),
            totalUSD: total1,
            totalFC: Math.round(total1 * 2850),
            paymentMethod: "mpesa",
            note: "Livrer après 17h svp",
            status: "new",
          },
          {
            ref: "KIN-DEMO02",
            storeId: store.id,
            customerName: "Chantal Mbala",
            customerPhone: "243991122334",
            zone: "Ngaliema",
            items: JSON.stringify(items2),
            totalUSD: total2,
            totalFC: Math.round(total2 * 2850),
            paymentMethod: "airtel",
            note: "",
            status: "confirmed",
          },
        ],
      })
      console.log("✅ 2 commandes d'exemple ajoutées")
    }
  } else {
    console.log(`ℹ️  ${orderCount} commandes déjà présentes`)
  }

  console.log("🎉 Seed terminé !")
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed :", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
