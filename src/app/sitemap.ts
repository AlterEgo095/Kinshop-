// Sitemap (SEO — vague premium). L'application est une SPA : la seule URL
// canonique publique est l'accueil. Étendue naturelle quand des pages
// boutiques/produits server-side apparaîtront (lire Store/Product ici).
import type { MetadataRoute } from "next"

const SITE_URL = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN}`
  : "https://kinshop.store"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ]
}
