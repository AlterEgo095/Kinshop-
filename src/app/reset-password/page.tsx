// KinShop — Route /reset-password (mission sécurité 2026-09-15)
// Page autonome atteinte depuis l'email de réinitialisation.
// - noindex : page fonctionnelle, hors SEO.
// - Suspense : useSearchParams (client) exige une boundary Suspense en prérendu.

import type { Metadata } from "next"
import { Suspense } from "react"
import { ResetPasswordView } from "@/components/kinshop/reset-password-view"

export const metadata: Metadata = {
  title: "Réinitialiser ton mot de passe — KinShop",
  description: "Choisis un nouveau mot de passe pour ton compte KinShop.",
  robots: { index: false, follow: false },
}

// Rendu STATIQUE forcé : le HTML prérendu ne contient AUCUNE donnée de la
// requête (ni URL, ni query). Next.js embarque sinon les searchParams dans le
// payload RSC des pages dynamiques — ce qui exposerait le token dans la source
// HTML. Le token est donc lu exclusivement côté client (window.location.search
// dans reset-password-view) et ne transite QUE via l'URL de la requête HTTPS.
export const dynamic = "force-static"

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-white text-lg">🛍️</span>
            <span className="text-sm">Chargement…</span>
          </div>
        </div>
      }
    >
      <ResetPasswordView />
    </Suspense>
  )
}
