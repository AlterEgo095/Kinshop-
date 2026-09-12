"use client"

// V10 — « Mes commandes » : historique complet du compte client
// (commandes, statuts, remboursements, factures — accès à SES données uniquement)

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ArrowLeft, Package, Search, Loader2, Ban, ReceiptText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { formatFC, formatUSD, timeAgo } from "@/lib/kinshop"
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  type PaymentStatus,
} from "@/lib/order-workflow"

interface MyOrder {
  id: string
  ref: string
  status: string
  paymentStatus: PaymentStatus | string
  deliveryStatus: string
  totalUSD: number
  totalFC: number
  createdAt: string
  itemsCount: number
  itemsPreview: string[]
  store: { name: string; logoEmoji: string; slug: string }
  refunds: { id: string; status: string; amountUSD: number }[]
  invoices: { number: string; status: string; totalFC: number }[]
}

const STATUS_BADGE: Record<string, string> = {
  new: "bg-amber-100 text-amber-800 border-amber-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  confirmed: "bg-teal-100 text-teal-800 border-teal-200",
  processing: "bg-sky-100 text-sky-800 border-sky-200",
  ready: "bg-violet-100 text-violet-800 border-violet-200",
  out_for_delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered: "bg-emerald-600 text-white border-emerald-600",
  cancelled: "bg-rose-100 text-rose-700 border-rose-200",
  returned: "bg-orange-100 text-orange-800 border-orange-200",
  refunded: "bg-zinc-200 text-zinc-700 border-zinc-300",
  disputed: "bg-red-100 text-red-800 border-red-200",
}

export function MyOrdersView({ onHome }: { onHome: () => void }) {
  const [orders, setOrders] = useState<MyOrder[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [refundFor, setRefundFor] = useState<MyOrder | null>(null)
  const [refundReason, setRefundReason] = useState("")
  const [refundBusy, setRefundBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/mine", { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Chargement impossible.")
      setOrders(data.orders)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (!cancelled) await load()
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const requestRefund = async () => {
    if (!refundFor) return
    if (refundReason.trim().length < 10) {
      toast.error("Décris le problème en quelques mots (10 caractères min).")
      return
    }
    setRefundBusy(true)
    try {
      const res = await fetch("/api/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: refundFor.id, reason: refundReason.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur lors de la demande.")
      toast.success("Demande envoyée — l'équipe va l'examiner 🛡️")
      setRefundFor(null)
      setRefundReason("")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setRefundBusy(false)
    }
  }

  const filtered = (orders ?? []).filter(
    (o) =>
      !q ||
      o.ref.toLowerCase().includes(q.toLowerCase()) ||
      o.store.name.toLowerCase().includes(q.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/50 to-background">
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur border-b">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onHome} aria-label="Retour à l'accueil">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-extrabold text-lg">Mes commandes</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher par référence ou boutique…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            aria-label="Rechercher une commande"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Package className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <p className="font-semibold">Aucune commande pour l&apos;instant</p>
            <p className="text-sm text-muted-foreground">Passe ta première commande dans une boutique — elle apparaîtra ici.</p>
            <Button onClick={onHome} className="mt-2">Découvrir les boutiques</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((o, i) => (
              <motion.div
                key={o.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
              >
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm">{o.ref}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {o.store.logoEmoji} {o.store.name} · {o.itemsCount} article(s)
                        </p>
                        {o.itemsPreview.length > 0 && (
                          <p className="text-xs text-muted-foreground/80 truncate">{o.itemsPreview.join(", ")}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold text-primary">{formatFC(o.totalFC)}</p>
                        <p className="text-xs text-muted-foreground">({formatUSD(o.totalUSD)})</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Badge className={STATUS_BADGE[o.status] || "bg-muted"}>{ORDER_STATUS_LABELS[o.status] || o.status}</Badge>
                      <Badge variant="outline" className="text-[11px]">
                        💳 {PAYMENT_STATUS_LABELS[o.paymentStatus as PaymentStatus] || o.paymentStatus}
                      </Badge>
                      {o.deliveryStatus !== "not_assigned" && (
                        <Badge variant="outline" className="text-[11px]">
                          🚚 {DELIVERY_STATUS_LABELS[o.deliveryStatus] || o.deliveryStatus}
                        </Badge>
                      )}
                      {o.refunds.some((r) => r.status === "requested" || r.status === "approved") && (
                        <Badge variant="outline" className="text-[11px] text-amber-700 border-amber-300">
                          Remboursement en cours
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground mr-auto">{timeAgo(o.createdAt)}</span>
                      {o.invoices.length > 0 && (
                        <Badge variant="outline" className="text-[11px] gap-1">
                          <ReceiptText className="w-3 h-3" /> {o.invoices[0].number}
                        </Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          window.location.hash = `#/suivi/${o.ref}`
                        }}
                      >
                        <Search className="w-3.5 h-3.5 mr-1" /> Suivre
                      </Button>
                      {["paid", "delivered", "returned", "disputed"].includes(o.status) &&
                        !o.refunds.some((r) => ["requested", "approved", "executed"].includes(r.status)) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-amber-700"
                            onClick={() => setRefundFor(o)}
                          >
                            <Ban className="w-3.5 h-3.5 mr-1" /> Demander un remboursement
                          </Button>
                        )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Demande de remboursement */}
      <Dialog open={!!refundFor} onOpenChange={(open) => !open && setRefundFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Demander un remboursement</DialogTitle>
            <DialogDescription>
              Commande <strong className="font-mono">{refundFor?.ref}</strong> — l&apos;équipe examinera ta demande
              (décision sous quelques jours). Le motif est conservé dans l&apos;historique.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="refundReason">Motif détaillé *</Label>
              <Textarea
                id="refundReason"
                placeholder="Ex : produit jamais reçu, article différent de la description…"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                maxLength={300}
              />
            </div>
            <Button className="w-full" onClick={requestRefund} disabled={refundBusy}>
              {refundBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Envoyer la demande
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
