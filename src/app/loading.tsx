// Vague 3 — État de chargement racine. Affiché par Next pendant le rendu
// dynamique de l'accueil (force-dynamic) : un écran d'attente léger et
// marqué, à la place du blanc. Aucun texte (aucune dépendance i18n).

import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background"
      role="status"
      aria-label="Chargement / Loading"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white text-2xl">
          🛍️
        </div>
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    </div>
  )
}
