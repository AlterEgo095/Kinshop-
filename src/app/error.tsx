"use client"

// Vague 3 — Borne d'erreur client bilingue. Remplace l'écran par défaut
// « Application error: a client-side exception has occurred » (anglais, brut).
// Même contrat que la landing / la 404 : rendu initial fr, bascule via le
// cookie kinshop_lang après hydratation.

import { useEffect } from "react"
import Link from "next/link"
import { LangProvider, useLang } from "@/components/kinshop/lang-context"
import { Button } from "@/components/ui/button"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

function ErrorInner({ error, reset }: ErrorProps) {
  const { tr } = useLang()

  useEffect(() => {
    // Journal client : utile en support (« quel digest ? quelle erreur ? »).
    console.error("[kinshop] erreur client:", error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/60 to-background px-4">
      <div className="text-center max-w-md">
        <p className="text-6xl select-none">🛠️</p>
        <h1 className="mt-4 text-2xl md:text-3xl font-bold tracking-tight">{tr("err.500.title")}</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">{tr("err.500.body")}</p>
        {error.digest ? (
          <p className="mt-2 text-xs text-muted-foreground/70">Réf. {error.digest}</p>
        ) : null}
        <div className="mt-8 flex items-center justify-center gap-3">
          <Button onClick={reset} className="h-12 px-8 text-base">
            {tr("err.500.cta")}
          </Button>
          <Button asChild variant="outline" className="h-12 px-6 text-base">
            <Link href="/">{tr("err.500.home")}</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ErrorBoundary(props: ErrorProps) {
  return (
    <LangProvider>
      <ErrorInner {...props} />
    </LangProvider>
  )
}
