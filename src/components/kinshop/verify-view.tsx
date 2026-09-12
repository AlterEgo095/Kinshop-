"use client"

// P4 — Vérification publique d'authenticité des factures (destination du QR
// imprimé sur chaque facture KinShop : /#/verifier/{number}).
// Quiconque scanne ou saisit le numéro obtient un verdict signé par la
// plateforme : authentique / altérée / annulée / inconnue — sans jamais
// exposer de donnée personnelle du client.

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, CheckCircle2, ScanLine, Search, ShieldAlert, ShieldCheck, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { formatFC, formatUSD } from "@/lib/kinshop"

interface VerifyResult {
  valid: boolean
  hashMatch: boolean
  legacy?: boolean
  cancelled?: boolean
  status: string
  number: string
  store: { name: string; logoEmoji: string }
  totalFC: number
  totalUSD: number
  issuedAt: string
  source?: string
  note: string
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
  credited: "Avoir",
}

export function InvoiceVerifyView({ initialNumber, onHome }: { initialNumber?: string; onHome?: () => void }) {
  const [number, setNumber] = useState(initialNumber ?? "")
  const [checkedNumber, setCheckedNumber] = useState("")
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)

  const verify = useCallback(async (raw: string) => {
    const num = raw.trim().toUpperCase()
    if (!num) return
    setLoading(true)
    setChecked(true)
    setResult(null)
    setNotFound(false)
    setCheckedNumber(num)
    try {
      const res = await fetch(`/api/invoices/verify?number=${encodeURIComponent(num)}`, { cache: "no-store" })
      if (res.status === 404) {
        setNotFound(true)
      } else if (res.ok) {
        setResult((await res.json()) as VerifyResult)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // QR scanné → vérification automatique au chargement
  useEffect(() => {
    if (initialNumber) void verify(initialNumber)
  }, [initialNumber, verify])

  const verdict = (() => {
    if (!result) return null
    if (result.cancelled)
      return { tone: "warn" as const, icon: ShieldAlert, title: "Facture annulée", cls: "bg-amber-50 text-amber-900 border-amber-300" }
    if (result.valid)
      return { tone: "ok" as const, icon: ShieldCheck, title: "Facture authentique", cls: "bg-emerald-50 text-emerald-900 border-emerald-300" }
    return { tone: "bad" as const, icon: XCircle, title: "Facture non authentique", cls: "bg-red-50 text-red-900 border-red-300" }
  })()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-emerald-950 text-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {onHome && (
              <Button variant="ghost" size="icon" className="size-9 shrink-0 text-white hover:bg-white/10" onClick={onHome} aria-label="Retour à l'accueil">
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <span className="truncate text-sm font-semibold">Vérification de facture — KinShop</span>
          </div>
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">⚡ KinShop</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100">
              <ScanLine className="size-6 text-emerald-700" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">Vérifier l&apos;authenticité d&apos;une facture</h1>
              <p className="text-sm text-muted-foreground">
                Scannez le QR imprimé sur la facture ou saisissez son numéro (ex. KF-2026-000001).
              </p>
            </div>
          </div>

          <form
            className="mt-5 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void verify(number)
            }}
          >
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Numéro de facture…"
              className="h-12 font-mono text-base"
              aria-label="Numéro de facture à vérifier"
            />
            <Button type="submit" className="h-12 bg-emerald-600 px-5 hover:bg-emerald-700" disabled={loading || !number.trim()}>
              {loading ? <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" /> : <Search className="size-4" aria-hidden="true" />}
              Vérifier
            </Button>
          </form>

          {loading && <Skeleton className="mt-6 h-56 w-full rounded-2xl" />}

          {checked && notFound && !loading && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-5">
              <XCircle className="mt-0.5 size-6 shrink-0 text-red-600" aria-hidden="true" />
              <div>
                <p className="font-bold text-red-900">Facture inconnue de la plateforme</p>
                <p className="mt-1 text-sm text-red-800">
                  Le numéro <span className="font-mono font-semibold">{checkedNumber}</span> n&apos;a jamais été émis par
                  KinShop. Ne payez pas ce document : contactez le vendeur ou signalez-le.
                </p>
              </div>
            </div>
          )}

          {result && verdict && !loading && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-4">
              <div className={`flex items-start gap-3 rounded-2xl border p-5 ${verdict.cls}`}>
                <verdict.icon className="mt-0.5 size-8 shrink-0" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-lg font-bold">{verdict.title}</p>
                  <p className="mt-1 text-sm opacity-90">{result.note}</p>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5" aria-label="Détails de la facture vérifiée">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-lg font-bold">{result.number}</p>
                  <Badge variant="outline" className="font-bold">
                    {STATUS_LABELS[result.status] ?? result.status}
                  </Badge>
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Émetteur</dt>
                    <dd className="font-semibold">
                      {result.store.logoEmoji} {result.store.name}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Montant</dt>
                    <dd className="font-semibold">
                      {formatFC(result.totalFC)} <span className="text-xs font-normal text-muted-foreground">({formatUSD(result.totalUSD)})</span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Émise le</dt>
                    <dd className="font-semibold">{new Date(result.issuedAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <dt className="text-muted-foreground">Origine</dt>
                    <dd className="font-semibold">{result.source === "order" ? "Facture de commande" : "KinFacture (facture libre)"}</dd>
                  </div>
                </dl>
                {result.valid && (
                  <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">
                    <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    Le contenu intégral de ce document a été vérifié par la plateforme (empreinte cryptographique).
                  </p>
                )}
                {result.legacy && !result.cancelled && (
                  <p className="mt-4 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
                    Document hérité : émis avant le système d&apos;intégrité renforcée — l&apos;authenticité de la source est confirmée,
                    sans vérification cryptographique du contenu.
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {!checked && !loading && (
            <div className="mt-8 rounded-2xl border bg-muted/40 p-5 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Comment ça marche ?</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Chaque facture émise par KinShop porte une empreinte cryptographique de son contenu intégral.</li>
                <li>Cette page recalcule l&apos;empreinte côté plateforme : tout document altéré (montant, lignes, client) est détecté.</li>
                <li>Aucune donnée personnelle du client n&apos;est exposée par cette vérification.</li>
              </ul>
            </div>
          )}
        </motion.div>
      </main>

      <footer className="mt-auto border-t bg-emerald-950 py-4 text-center text-sm text-emerald-100">
        <span className="font-semibold">Propulsé par KinShop</span> — créez votre boutique et vos factures en 5 minutes 🇨🇩
      </footer>
    </div>
  )
}
