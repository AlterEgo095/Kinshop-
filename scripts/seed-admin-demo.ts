// Seed KinShop Admin — Données de démonstration pour la console d'administration
// Additif & idempotent : ne duplique jamais (slug/ref uniques). Usage : bun run scripts/seed-admin-demo.ts

import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const RATE = 2850

function daysAgo(n: number, hourOffset = 0): Date {
  return new Date(Date.now() - n * 86400_000 + hourOffset * 3600_000)
}

function makeRef(i: number): string {
  return `KIN-ADM${String(i).padStart(3, "0")}`
}

interface NewStore {
  slug: string
  name: string
  ownerName: string
  whatsapp: string
  description: string
  logoEmoji: string
  isPremium: boolean
  premiumUntil: Date | null
  createdAt: Date
  products: { name: string; emoji: string; priceUSD: number; category: string; stock: number }[]
}

const NEW_STORES: NewStore[] = [
  {
    slug: "diva-mode",
    name: "Diva Mode Kin",
    ownerName: "Diva Mbala",
    whatsapp: "243899112233",
    description: "Mode féminine tendance : robes, talons, sacs et accessoires chic à petits prix. ✨",
    logoEmoji: "👗",
    isPremium: true,
    premiumUntil: daysAgo(-20), // expire dans 20 jours → visible dans l'alerte expirant
    createdAt: daysAgo(10),
    products: [
      { name: "Robe satin soirée", emoji: "👚", priceUSD: 32, category: "Mode & Vêtements", stock: 8 },
      { name: "Sandales talons 9cm", emoji: "👠", priceUSD: 25, category: "Mode & Vêtements", stock: 12 },
      { name: "Sac bandoulière doré", emoji: "👜", priceUSD: 20, category: "Mode & Vêtements", stock: 15 },
      { name: "Parfum fleur de coton", emoji: "💐", priceUSD: 14, category: "Beauté & Cosmétiques", stock: 20 },
    ],
  },
  {
    slug: "kin-tech-gadgets",
    name: "Kin Tech Gadgets",
    ownerName: "Patrick Ilunga",
    whatsapp: "243822233445",
    description: "Gadgets électroniques malins : écouteurs, powerbanks, montres connectées. Garantie 7 jours. 📱",
    logoEmoji: "📱",
    isPremium: true,
    premiumUntil: daysAgo(-40), // expire dans 40 jours
    createdAt: daysAgo(6),
    products: [
      { name: "Écouteurs TWS Pro", emoji: "🎧", priceUSD: 12, category: "Électronique", stock: 30 },
      { name: "Powerbank 30000mAh charge rapide", emoji: "🔋", priceUSD: 18, category: "Électronique", stock: 22 },
      { name: "Montre connectée Smart Fit", emoji: "⌚", priceUSD: 22, category: "Électronique", stock: 10 },
      { name: "Ring light trépied streaming", emoji: "💡", priceUSD: 15, category: "Électronique", stock: 7 },
      { name: "Support voiture magnétique", emoji: "🚗", priceUSD: 5, category: "Électronique", stock: 40 },
    ],
  },
  {
    slug: "frais-bon-kin",
    name: "Frais & Bon Kin",
    ownerName: "Mama Béa",
    whatsapp: "243855566777",
    description: "Produits frais et épicerie fine livrés à domicile : fruits, légumes, poissons fumés. 🥬",
    logoEmoji: "🥬",
    isPremium: false,
    premiumUntil: null,
    createdAt: daysAgo(2),
    products: [
      { name: "Panier légumes frais (5 kg)", emoji: "🥦", priceUSD: 10, category: "Alimentation", stock: 25 },
      { name: "Poisson fumé premium 1 kg", emoji: "🐟", priceUSD: 13, category: "Alimentation", stock: 18 },
      { name: "Mangues douces — plateau 3 kg", emoji: "🥭", priceUSD: 7, category: "Alimentation", stock: 30 },
      { name: "Piment pilé maison 250g", emoji: "🌶️", priceUSD: 2, category: "Alimentation", stock: 50 },
    ],
  },
]

const ZONES = ["Gombe", "Ngaliema", "Lingwala", "Masina", "Kintambo", "Limete", "Bandalungwa", "Matete"]
const CUSTOMERS = [
  { name: "Chadrack L.", phone: "243811223344" },
  { name: "Sarah K.", phone: "243822334455" },
  { name: "Joël M.", phone: "243833445566" },
  { name: "Esther N.", phone: "243844556677" },
  { name: "Bienvenu T.", phone: "243855667788" },
  { name: "Grâce M.", phone: "243866778899" },
  { name: "Fiston K.", phone: "243877889900" },
  { name: "Nadine B.", phone: "243888990011" },
]
const PAYMENTS = ["mpesa", "airtel", "orange", "cash"]
const STATUSES = ["new", "paid", "confirmed", "delivered", "delivered", "cancelled"]

async function main() {
  console.log("🌱 Seed admin KinShop…")

  // Récupère toutes les boutiques existantes (dont maman-ngo de la démo V1)
  const allStores = await db.store.findMany({ include: { products: true } })
  const bySlug = new Map(allStores.map((s) => [s.slug, s]))

  // 1. Créer les nouvelles boutiques si absentes
  for (const def of NEW_STORES) {
    if (bySlug.has(def.slug)) {
      console.log("ℹ️  Boutique déjà présente :", def.slug)
      continue
    }
    const created = await db.store.create({
      data: {
        slug: def.slug,
        name: def.name,
        ownerName: def.ownerName,
        whatsapp: def.whatsapp,
        description: def.description,
        logoEmoji: def.logoEmoji,
        isPremium: def.isPremium,
        premiumUntil: def.premiumUntil,
        createdAt: def.createdAt,
        updatedAt: def.createdAt,
        products: {
          create: def.products.map((p) => ({ ...p })),
        },
      },
      include: { products: true },
    })
    bySlug.set(def.slug, created)
    console.log("✅ Boutique créée :", def.name, `(${created.products.length} produits)`)
  }

  // 2. Commandes réparties sur 14 jours pour chaque boutique
  let refIndex = 1
  let createdOrders = 0

  // Vérifie les refs déjà utilisées pour l'idempotence
  const existingRefs = new Set(
    (await db.order.findMany({ where: { ref: { startsWith: "KIN-ADM" } }, select: { ref: true } })).map((o) => o.ref),
  )

  for (const store of bySlug.values()) {
    if (!store || store.products.length === 0) continue
    const ordersPerStore = store.slug === "maman-ngo" ? 8 : 6
    for (let i = 0; i < ordersPerStore; i++) {
      const ref = makeRef(refIndex)
      refIndex += 1
      if (existingRefs.has(ref)) continue

      const product = store.products[(i * 3) % store.products.length]
      const qty = ((i % 3) + 1)
      const customer = CUSTOMERS[(i + createdOrders) % CUSTOMERS.length]
      const dayOffset = (i * 2) % 14 // étalées sur 2 semaines
      const status = STATUSES[i % STATUSES.length]
      const totalUSD = Math.round(product.priceUSD * qty * 100) / 100

      await db.order.create({
        data: {
          ref,
          storeId: store.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          zone: ZONES[(i + createdOrders) % ZONES.length],
          items: JSON.stringify([
            { productId: product.id, name: product.name, emoji: product.emoji, priceUSD: product.priceUSD, qty },
          ]),
          totalUSD,
          totalFC: totalUSD * RATE,
          paymentMethod: PAYMENTS[(i + createdOrders) % PAYMENTS.length],
          status,
          createdAt: daysAgo(dayOffset, i),
          updatedAt: daysAgo(dayOffset, i),
        },
      })
      createdOrders += 1
    }
  }
  console.log(`✅ ${createdOrders} commande(s) créées (réf KIN-ADMxxx)`)

  // 3. Paramètres plateforme par défaut (annonces vides, maintenance off, taux 2850)
  const settingsDefaults: Record<string, string> = {
    maintenance: "off",
    announcement: "",
    defaultRateFC: "2850",
  }
  for (const [key, value] of Object.entries(settingsDefaults)) {
    await db.platformSetting.upsert({ where: { key }, update: {}, create: { key, value } })
  }
  console.log("✅ Paramètres plateforme initialisés")

  // 4. Entrée d'audit de départ
  const auditCount = await db.adminAction.count()
  if (auditCount === 0) {
    await db.adminAction.create({
      data: {
        action: "platform.seed",
        target: "platform",
        detail: "Données de démonstration initialisées pour la console d'administration",
      },
    })
    console.log("✅ Journal d'audit initialisé")
  }

  const summary = await Promise.all([
    db.store.count(),
    db.product.count(),
    db.order.count(),
  ])
  console.log(`📊 Total : ${summary[0]} boutiques · ${summary[1]} produits · ${summary[2]} commandes`)
}

main()
  .catch((e) => {
    console.error("❌ Seed échoué :", e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
