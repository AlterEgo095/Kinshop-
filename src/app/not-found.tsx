"use client"

// Vague 3 — Page 404 premium bilingue. Remplace la page par défaut de Next
// (anglaise, non marquée). Bilingue via le cookie kinshop_lang (LangProvider :
// rendu serveur initial fr, bascule après hydratation — zéro mismatch).

import Link from "next/link"
import { LangProvider, useLang } from "@/components/kinshop/lang-context"
import { Button } from "@/components/ui/button"

function NotFoundInner() {
  const { tr } = useLang()
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50/60 to-background px-4">
      <div className="text-center max-w-md">
        <p className="text-7xl md:text-8xl font-black tracking-tight text-primary select-none">404</p>
        <h1 className="mt-4 text-2xl md:text-3xl font-bold tracking-tight">{tr("err.404.title")}</h1>
        <p className="mt-3 text-muted-foreground leading-relaxed">{tr("err.404.body")}</p>
        <Button asChild className="mt-8 h-12 px-8 text-base">
          <Link href="/">{tr("err.404.cta")}</Link>
        </Button>
        <p className="mt-10 text-sm text-muted-foreground">
          Kin<span className="text-primary font-semibold">Shop</span> · fait avec ❤️ à Kinshasa 🇨🇩
        </p>
      </div>
    </div>
  )
}

export default function NotFound() {
  return (
    <LangProvider>
      <NotFoundInner />
    </LangProvider>
  )
}
