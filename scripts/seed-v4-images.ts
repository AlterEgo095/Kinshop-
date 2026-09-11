// KinShop V4 — Seed d'images produits démo (idempotent)
// Attache des galeries multi-photos aux produits des boutiques démo.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const IMAGE_MAP: { storeSlug: string; productName: string; images: string[] }[] = [
  {
    storeSlug: "maman-ngo",
    productName: "Pagne wax premium (6 yards)",
    images: ["/images/products/robe-pagne.jpg", "/images/products/pagne-2.jpg"],
  },
  {
    storeSlug: "maman-ngo",
    productName: "Riz parfumé — sac 25 kg",
    images: ["/images/products/riz.jpg"],
  },
  {
    storeSlug: "maman-ngo",
    productName: "Casque Bluetooth Bass+ 40h",
    images: ["/images/products/smartphone.jpg"],
  },
  {
    storeSlug: "diva-mode",
    productName: "Robe satin soirée",
    images: ["/images/products/robe-pagne.jpg"],
  },
  {
    storeSlug: "diva-mode",
    productName: "Sandales talons 9cm",
    images: ["/images/products/sneakers.jpg", "/images/products/sneakers-2.jpg"],
  },
  {
    storeSlug: "kin-tech-gadgets",
    productName: "Écouteurs TWS Pro",
    images: ["/images/products/smartphone.jpg"],
  },
]

async function main() {
  let updated = 0
  for (const item of IMAGE_MAP) {
    const store = await db.store.findUnique({ where: { slug: item.storeSlug } })
    if (!store) {
      console.log(`⚠️ Boutique « ${item.storeSlug} » absente — ignorée`)
      continue
    }
    const product = await db.product.findFirst({
      where: { storeId: store.id, name: { contains: item.productName.split(" ")[0] } },
      orderBy: { createdAt: "asc" },
    })
    if (!product) {
      console.log(`⚠️ Produit « ${item.productName} » absent — ignoré`)
      continue
    }
    const json = JSON.stringify(item.images)
    if (product.images === json) {
      console.log(`• ${product.name} : déjà à jour`)
      continue
    }
    await db.product.update({
      where: { id: product.id },
      data: { images: json, imageUrl: item.images[0] },
    })
    updated += 1
    console.log(`✅ ${item.storeSlug} / ${product.name} : ${item.images.length} photo(s)`)
  }
  console.log(`\nTerminé — ${updated} produit(s) mis à jour`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
