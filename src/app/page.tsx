import { headers } from "next/headers"
import { db } from "@/lib/db"
import { normalizeDomain } from "@/lib/domain"
import { KinShopApp } from "@/components/kinshop/kinshop-app"

// Résolution dynamique obligatoire : la page dépend de l'en-tête Host
// (kinshop.aenews.digital = plateforme, maboutique.cd = boutique du vendeur)
export const dynamic = "force-dynamic"

export default async function Home() {
  // V7 — Domaine personnalisé : si le Host correspond au domaine vérifié d'une
  // boutique, on ouvre directement sa vitrine ; sinon on affiche la plateforme.
  let initialSlug: string | undefined
  try {
    const h = await headers()
    const host = normalizeDomain(h.get("host") || "")
    if (host) {
      const store = await db.store.findFirst({
        where: { customDomain: host, domainVerified: true },
        select: { slug: true },
      })
      if (store) initialSlug = store.slug
    }
  } catch {
    // Host indisponible ou erreur : plateforme par défaut
  }
  return <KinShopApp initialSlug={initialSlug} />
}
