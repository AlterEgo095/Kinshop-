"use client"

// V3 — KinFacture : vue publique d'une facture partagée au client (#/facture/KF-XXX)

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, MessageCircle, ScanLine, ShieldCheck, Smartphone, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { InvoiceCanvas, invoiceFileName, downloadInvoicePNG, exportInvoicePDF } from "@/components/kinshop/invoice-canvas"
import { INVOICE_STATUS_LABELS, type InvoiceData, type InvoiceStatus } from "@/lib/kinfacture"
import { buildWhatsAppLink, formatPhoneDisplay, formatFC, type StoreData } from "@/lib/kinshop"

interface InvoiceWithStore extends InvoiceData {
  store: Pick<StoreData, "name" | "logoEmoji" | "whatsapp" | "city">
}

type VerifyState =
  | { kind: "ok" }
  | { kind: "legacy" }
  | { kind: "cancelled" }
  | { kind: "bad" }
  | null

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: "bg-stone-100 text-stone-700 border-stone-200",
  sent: "bg-amber-50 text-amber-800 border-amber-200",
  paid: "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelled: "bg-red-50 text-red-800 border-red-200",
  credited: "bg-purple-50 text-purple-800 border-purple-200",
}

export function InvoicePublicView({ number, onHome }: { number: string; onHome?: () => void }) {
  const [invoice, setInvoice] = useState<InvoiceWithStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null)
  const [verify, setVerify] = useState<VerifyState>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/invoices?number=${encodeURIComponent(number)}`)
        const data = await res.json()
        if (!cancelled && res.ok && data.invoice) setInvoice(data.invoice as InvoiceWithStore)
        else if (!cancelled && res.status === 404) setInvoice(null)
      } catch {
        if (!cancelled) setInvoice(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    // P4 — verdict d'authenticité (empreinte recalculée par la plateforme)
    ;(async () => {
      try {
        const res = await fetch(`/api/invoices/verify?number=${encodeURIComponent(number)}`, { cache: "no-store" })
        if (cancelled) return
        if (res.ok) {
          const v = await res.json()
          setVerify(
            v.cancelled
              ? { kind: "cancelled" }
              : v.legacy
                ? { kind: "legacy" }
                : v.valid
                  ? { kind: "ok" }
                  : { kind: "bad" },
          )
        }
      } catch {
        // verdict indisponible : bandeau omis
      }
    })()
    return () => {
      cancelled = true
    }
  }, [number])

  const handleMessageVendor = useCallback(() => {
    if (!invoice) return
    const msg = `Bonjour ${invoice.store.name}, je vous contacte au sujet de la facture ${invoice.number} (${formatFC(invoice.totalFC)}).`
    window.open(buildWhatsAppLink(invoice.store.whatsapp, msg), "_blank")
  }, [invoice])

  const handleDownload = useCallback(async (kind: "png" | "pdf") => {
    if (!canvas || !invoice) return
    const ok = kind === "png" ? await downloadInvoicePNG(canvas, invoice) : await exportInvoicePDF(canvas, invoice)
    if (ok) toast.success(kind === "png" ? "Facture téléchargée (PNG) !" : "Facture PDF téléchargée !")
    else toast.error("Le téléchargement a échoué. Réessayez.")
  }, [canvas, invoice])

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-emerald-950 text-white">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {onHome && (
              <Button variant="ghost" size="icon" className="size-9 shrink-0 text-white hover:bg-white/10" onClick={onHome} aria-label="Retour à l'accueil">
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <span className="truncate text-sm font-semibold">
              {invoice ? `${invoice.store.logoEmoji} ${invoice.store.name}` : "KinFacture"}
            </span>
          </div>
          <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-bold text-amber-300">⚡ KinShop</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {loading && (
          <div className="space-y-4">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="aspect-[210/297] w-full rounded-xl" />
          </div>
        )}

        {!loading && !invoice && (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center">
            <div className="text-4xl">🔍</div>
            <h1 className="mt-3 text-lg font-bold">Facture introuvable</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              La facture <span className="font-mono font-semibold">{number}</span> n&apos;existe pas ou a été supprimée.
              Vérifiez le lien reçu par WhatsApp.
            </p>
            {onHome && (
              <Button className="mt-6 bg-emerald-600 hover:bg-emerald-700" onClick={onHome}>
                Découvrir KinShop
              </Button>
            )}
          </div>
        )}

        {!loading && invoice && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold sm:text-2xl">
                  Facture <span className="font-mono">{invoice.number}</span>
                </h1>
                <p className="text-sm text-muted-foreground">
                  Émise par {invoice.store.name} · {invoice.store.city}
                </p>
              </div>
              <Badge variant="outline" className={`text-xs font-bold ${STATUS_STYLE[invoice.status as InvoiceStatus] ?? STATUS_STYLE.draft}`}>
                {INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status}
              </Badge>
            </div>

            <InvoiceCanvas
              invoice={{ ...invoice, createdAt: invoice.createdAt, paidAt: invoice.paidAt }}
              store={invoice.store}
              onRendered={setCanvas}
            />

            {/* P4 — Bandeau d'authenticité (empreinte recalculée par la plateforme) */}
            {verify && (
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  verify.kind === "ok"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : verify.kind === "cancelled"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : verify.kind === "legacy"
                        ? "border-stone-300 bg-stone-50 text-stone-700"
                        : "border-red-300 bg-red-50 text-red-900"
                }`}
                role="status"
              >
                <span className="flex min-w-0 items-center gap-2 font-semibold">
                  {verify.kind === "ok" ? (
                    <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="size-5 shrink-0" aria-hidden="true" />
                  )}
                  {verify.kind === "ok" && "Facture authentique — contenu intégral vérifié par KinShop"}
                  {verify.kind === "legacy" && "Facture héritée : source authentique, émise avant la vérification renforcée"}
                  {verify.kind === "cancelled" && "Cette facture a été annulée ou remplacée par un avoir"}
                  {verify.kind === "bad" && "Alerte : empreinte invalide — cette facture a pu être falsifiée"}
                </span>
                <a
                  href={`#/verifier/${encodeURIComponent(invoice.number)}`}
                  className="inline-flex items-center gap-1.5 font-semibold underline decoration-1 underline-offset-2"
                >
                  <ScanLine className="size-4" aria-hidden="true" />
                  Vérifier l&apos;authenticité
                </a>
              </div>
            )}

            {/* Instructions de paiement mobile money */}
            <section className="rounded-2xl border bg-amber-50/60 p-4 sm:p-6" aria-label="Instructions de paiement">
              <h2 className="flex items-center gap-2 text-base font-bold">
                <Smartphone className="size-5 text-amber-600" aria-hidden="true" />
                Comment payer cette facture
              </h2>
              <ol className="mt-3 space-y-2 text-sm text-foreground/90">
                <li>
                  <strong>1.</strong> Ouvrez M-Pesa, Airtel Money ou Orange Money sur votre téléphone.
                </li>
                <li>
                  <strong>2.</strong> Envoyez <strong className="text-emerald-700">{formatFC(invoice.totalFC)}</strong> au{" "}
                  <strong>{formatPhoneDisplay(invoice.store.whatsapp)}</strong>.
                </li>
                <li>
                  <strong>3.</strong> Indiquez la référence <strong className="font-mono">{invoice.number}</strong> dans le motif.
                </li>
                <li>
                  <strong>4.</strong> Ou scannez simplement le QR de paiement présent sur la facture.
                </li>
              </ol>
              {invoice.status === "paid" && (
                <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Cette facture est déjà marquée payée. Merci !
                </p>
              )}
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                size="lg"
                className="h-12 flex-1 bg-emerald-600 text-base hover:bg-emerald-700"
                onClick={handleMessageVendor}
              >
                <MessageCircle className="size-5" aria-hidden="true" />
                Contacter le vendeur sur WhatsApp
              </Button>
              <Button size="lg" variant="outline" className="h-12 flex-1 text-base" onClick={() => handleDownload("pdf")}>
                📄 Télécharger en PDF
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 flex-1 text-base sm:flex-none"
                onClick={() => handleDownload("png")}
                aria-label={`Télécharger la facture ${invoice.number} en image`}
              >
                🖼️ PNG
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Fichier : {invoiceFileName(invoice)}.pdf
            </p>
          </motion.div>
        )}
      </main>

      <footer className="mt-auto border-t bg-emerald-950 py-4 text-center text-sm text-emerald-100">
        <span className="font-semibold">Propulsé par KinShop</span> — créez votre boutique et vos factures en 5 minutes 🇨🇩
      </footer>
    </div>
  )
}
