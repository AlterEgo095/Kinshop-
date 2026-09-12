// Seed V10 — Catégories globales du marketplace (idempotent)
import { PrismaClient } from "@prisma/client"
import { slugify } from "../src/lib/slug"
const db = new PrismaClient()

const CATEGORIES: { name: string; icon: string }[] = [
  { name: "Téléphones", icon: "📱" },
  { name: "Accessoires téléphones", icon: "🔌" },
  { name: "Informatique", icon: "💻" },
  { name: "Électronique", icon: "📺" },
  { name: "Mode & Vêtements", icon: "👗" },
  { name: "Beauté & Cosmétiques", icon: "💄" },
  { name: "Alimentation", icon: "🥑" },
  { name: "Maison & Cuisine", icon: "🏠" },
  { name: "Matériaux de construction", icon: "🧱" },
  { name: "Ciment", icon: "🏗️" },
  { name: "Services", icon: "🛠️" },
  { name: "Divers", icon: "📦" },
]

async function main() {
  let created = 0
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i]
    const slug = slugify(c.name)
    const existing = await db.globalCategory.findUnique({ where: { slug } })
    if (!existing) {
      await db.globalCategory.create({ data: { name: c.name, slug, icon: c.icon, order: i } })
      created++
    }
  }
  console.log(`Catégories globales : ${created} créée(s), ${CATEGORIES.length - created} déjà présentes`)
  await db.$disconnect()
}
main()
