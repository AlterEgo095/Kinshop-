"use client"

// V10 — Modules MARKETPLACE du dashboard vendeur :
// 1. OrderWorkflowControls : transitions de statut validées par le graphe serveur,
//    pilotage de la livraison (dimension indépendante), encaissement espèces,
//    historique immuable de la commande.
// 2. StoreCategoriesManager : catégories propres à la boutique (quota plan serveur).
// 3. BoostPanel : campagnes de promotion payante (≠ Premium).

import { useCallback, useEffect, useState } from "react"
import { Loader2, Plus, Trash2, Megaphone, History, Truck, Banknote, Layers, ReceiptText, Camera } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { formatFC, formatUSD, type DeliveryZoneData } from "@/lib/kinshop"
import {
  ORDER_TRANSITIONS,
  ORDER_STATUS_LABELS,
  DELIVERY_TRANSITIONS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_FAILURE_REASONS,
  DELIVERY_FAILURE_LABELS,
  EVENT_TYPE_LABELS,
  type OrderEventType,
} from "@/lib/order-workflow"

/* ═══════════ 1. WORKFLOW COMMANDE ═══════════ */

export function OrderWorkflowControls({
  orderId,
  ref: orderRef,
  status,
  paymentMethod,
  paymentStatus,
  paymentRef: declaredRef,
  deliveryStatus,
  deliveryAttempts,
  onChanged,
}: {
  orderId: string
  ref: string
  status: string
  paymentMethod: string
  paymentStatus: string
  paymentRef?: string
  deliveryStatus: string
  deliveryAttempts: number
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failOpen, setFailOpen] = useState(false)
  const [failReason, setFailReason] = useState("")
  const [failNote, setFailNote] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  // P1 (Phase C) — confirmation d'encaissement Mobile Money direct
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmNote, setConfirmNote] = useState("")
  // Phase D — preuve photographique du paiement (visible vendeur/admin, jamais publique)
  const [proofLoading, setProofLoading] = useState(false)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [proofNote, setProofNote] = useState("")
  const [proofAt, setProofAt] = useState<string | null>(null)
  const [proofLoaded, setProofLoaded] = useState(false)
  const [proofViewOpen, setProofViewOpen] = useState(false)
  const [events, setEvents] = useState<{ id: string; type: string; actorLabel: string; oldValue: string; newValue: string; reason: string; createdAt: string }[]>([])
  // P4 — facture de commande (émission + statut) : la règle serveur est la référence
  const [invoiceNumber, setInvoiceNumber] = useState<string | null>(null)
  const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)

  const nextStatuses = ORDER_TRANSITIONS[status as keyof typeof ORDER_TRANSITIONS] ?? []
  const nextDelivery = DELIVERY_TRANSITIONS[deliveryStatus as keyof typeof DELIVERY_TRANSITIONS] ?? []
  const cashConfirmable = paymentMethod === "cash" && !["paid", "refunded"].includes(paymentStatus) &&
    !["new", "cancelled", "returned", "refunded", "disputed"].includes(status)
  // P1 (Phase C) — encaissement Mobile Money direct confirmable : mêmes gardes
  // que l'espèces (serveur = autorité, le vendeur confirme après vérification).
  const directConfirmable = ["mpesa", "airtel", "orange"].includes(paymentMethod) &&
    !["paid", "refunded"].includes(paymentStatus) &&
    !["new", "cancelled", "returned", "refunded", "disputed"].includes(status)
  // Facturable dès confirmation (garde serveur identique à POST /api/orders/invoice)
  const invoiceEligible = !["new", "paid", "cancelled", "returned", "refunded", "disputed"].includes(status)

  const callOrders = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  const callDelivery = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const res = await fetch("/api/orders/delivery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      toast.success("Livraison mise à jour ✅")
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  const loadHistory = async () => {
    setHistoryOpen(true)
    try {
      const res = await fetch(`/api/orders/events?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
      const data = await res.json()
      if (res.ok) setEvents(data.events ?? [])
    } catch {
      // silencieux
    }
  }

  // Phase D — charge la preuve photographique (acheteur/vendeur/admin uniquement).
  // Sans preuve jointe, la route répond hasProof:false — affichage neutre.
  const loadProof = async () => {
    setProofLoading(true)
    try {
      const res = await fetch(`/api/orders/payment-proof?ref=${encodeURIComponent(orderRef)}`, { cache: "no-store" })
      const data = await res.json()
      if (res.ok && data.hasProof) {
        setProofUrl(data.image || null)
        setProofNote(data.note || "")
        setProofAt(data.createdAt || null)
      } else {
        setProofUrl(null)
        setProofNote("")
        setProofAt(null)
      }
    } catch {
      // silencieux
    } finally {
      setProofLoaded(true)
      setProofLoading(false)
    }
  }

  // P4 — charge le statut facture de la commande (une seule active sinon annulée/avoir)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/orders/invoice?orderId=${encodeURIComponent(orderId)}`, { cache: "no-store" })
        if (cancelled || !res.ok) return
        const data = await res.json()
        if (cancelled) return
        const list: { number: string; status: string }[] = Array.isArray(data.invoices) ? data.invoices : []
        const active = list.find((i) => !["cancelled", "credited"].includes(i.status))
        setInvoiceNumber(active?.number ?? null)
        setInvoiceStatus(active?.status ?? null)
      } catch {
        // silencieux — le bouton d'émission reste disponible
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, status])

  const generateInvoice = async () => {
    setInvoiceLoading(true)
    try {
      const res = await fetch("/api/orders/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Émission impossible.")
      setInvoiceNumber(data.invoice.number)
      setInvoiceStatus(data.invoice.status)
      toast.success(`Facture ${data.invoice.number} émise 🧾 (empreinte intégrale vérifiable)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setInvoiceLoading(false)
    }
  }

  const markFailed = async () => {
    if (!failReason) return toast.error("Choisis un motif d'échec (obligatoire).")
    await callDelivery({ deliveryStatus: "failed", reason: failReason, reasonNote: failNote })
    setFailOpen(false)
    setFailReason("")
    setFailNote("")
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Transitions de statut (graphe serveur) */}
      {nextStatuses.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "cancelled" || s === "returned" ? "outline" : "default"}
          className={`h-7 px-2 text-xs ${s === "delivered" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          disabled={busy}
          onClick={() => callOrders({ status: s })}
        >
          {s === "delivered" ? "✅ " : s === "cancelled" ? "✖ " : ""}
          {ORDER_STATUS_LABELS[s] ?? s}
        </Button>
      ))}

      {/* Encaissement espèces (owner only, serveur) */}
      {cashConfirmable && (
        <Button
          size="sm"
          className="h-7 px-2 text-xs bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold"
          disabled={busy}
          onClick={() => callOrders({ confirmCash: true })}
          title="Confirmer que les espèces ont été encaissées"
        >
          <Banknote className="w-3.5 h-3.5 mr-1" /> Encaissé
        </Button>
      )}

      {/* P1 (Phase C) — Encaissement Mobile Money direct (owner only, serveur) :
          l'acheteur déclare son transfert, le vendeur vérifie dans son compte
          opérateur puis confirme. La déclaration seule n'a JAMAIS confirmé. */}
      {directConfirmable && (
        <Button
          size="sm"
          className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          disabled={busy}
          onClick={() => setConfirmOpen(true)}
          title="Vérifie dans ton compte opérateur que le montant est arrivé, puis confirme l'encaissement"
        >
          <Banknote className="w-3.5 h-3.5 mr-1" />
          {paymentStatus === "declared" ? "Confirmer l'encaissement" : "Encaissé (MM direct)"}
        </Button>
      )}

      {/* Phase D — Preuve photographique du transfert (vendeur/admin, lecture) */}
      {["mpesa", "airtel", "orange"].includes(paymentMethod) && ["declared", "paid"].includes(paymentStatus) && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => {
            setProofViewOpen(true)
            if (!proofLoaded) loadProof()
          }}
          title="Voir la capture du transfert jointe par le client"
        >
          <Camera className="w-3.5 h-3.5 mr-1" /> Preuve
        </Button>
      )}

      {/* Pilotage livraison (dimension indépendante) */}
      {nextDelivery.map((d) =>
        d === "failed" ? (
          <Button
            key={d}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs text-rose-700 border-rose-300"
            disabled={busy}
            onClick={() => setFailOpen(true)}
          >
            ⚠ Échec…
          </Button>
        ) : (
          <Button
            key={d}
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={() => callDelivery({ deliveryStatus: d })}
          >
            <Truck className="w-3.5 h-3.5 mr-1" />
            {DELIVERY_STATUS_LABELS[d] ?? d}
          </Button>
        ),
      )}

      {/* Historique immuable */}
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={loadHistory}>
        <History className="w-3.5 h-3.5 mr-1" /> Historique
      </Button>

      {/* P4 — Facture de commande (INV- séquentielle, empreinte d'intégrité, QR de vérification) */}
      {invoiceNumber ? (
        <a
          href={`#/facture/${encodeURIComponent(invoiceNumber)}`}
          className="inline-flex h-7 items-center gap-1 rounded-md border bg-emerald-50 px-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          title="Ouvrir la facture de cette commande"
          onClick={(e) => e.stopPropagation()}
        >
          <ReceiptText className="w-3.5 h-3.5" />
          Facture {invoiceNumber}
          {invoiceStatus === "paid" ? " (payée)" : ""}
        </a>
      ) : (
        invoiceEligible && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-emerald-800 hover:text-emerald-900"
            disabled={busy || invoiceLoading}
            onClick={generateInvoice}
            title="Émettre la facture de cette commande (document authentifiable par le client)"
          >
            {invoiceLoading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <ReceiptText className="w-3.5 h-3.5 mr-1" />}
            Émettre la facture
          </Button>
        )
      )}
      {deliveryAttempts > 0 && (
        <Badge variant="outline" className="text-[10px]">
          {deliveryAttempts} relance(s)
        </Badge>
      )}

      {/* Motif d'échec OBLIGATOIRE */}
      <Dialog open={failOpen} onOpenChange={setFailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Déclarer un échec de livraison</DialogTitle>
            <DialogDescription>
              Commande <strong className="font-mono">{orderRef}</strong> — le motif est OBLIGATOIRE et conservé
              dans l&apos;historique (aucune trace ne peut être supprimée).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Motif structuré *</Label>
              <Select value={failReason} onValueChange={setFailReason}>
                <SelectTrigger aria-label="Motif d'échec">
                  <SelectValue placeholder="Choisir le motif…" />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_FAILURE_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {DELIVERY_FAILURE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="failNote">Précisions (optionnel)</Label>
              <Input
                id="failNote"
                placeholder="Ex : pas de réponse après 2 appels, nouveau rendez-vous demain 10h"
                value={failNote}
                onChange={(e) => setFailNote(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={markFailed} disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Enregistrer l&apos;échec
              </Button>
              <Button variant="outline" onClick={() => setFailOpen(false)}>
                Annuler
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Après un échec : relance la livraison (nouvelle tentative tracée) ou programme un retour.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* P1 (Phase C) — Confirmation d'encaissement Mobile Money direct */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (open) loadProof()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer l&apos;encaissement Mobile Money</DialogTitle>
            <DialogDescription>
              Commande <strong className="font-mono">{orderRef}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
              <p className="font-semibold text-amber-900">⚠ Vérifie avant de confirmer</p>
              <p className="text-amber-800">
                Ouvre ton compte {paymentMethod === "mpesa" ? "M-Pesa" : paymentMethod === "airtel" ? "Airtel Money" : "Orange Money"} et
                vérifie que le montant de la commande est bien arrivé. La confirmation est définitive et tracée.
              </p>
            </div>
            {/* Phase D — capture jointe par le client (chargée à l'ouverture du dialogue) */}
            {proofLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Chargement de la preuve…
              </div>
            )}
            {!proofLoading && proofUrl && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
                <p className="font-semibold text-primary">📎 Capture jointe par le client</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proofUrl}
                  alt="Preuve du transfert"
                  className="w-full max-h-56 rounded-lg border object-contain cursor-zoom-in"
                  onClick={() => setProofViewOpen(true)}
                />
                {proofNote && <p className="text-xs text-muted-foreground">Note du client : {proofNote}</p>}
                <p className="text-[11px] text-muted-foreground">
                  Compare-la à ta réception dans ton compte opérateur avant de confirmer.
                </p>
              </div>
            )}
            {paymentStatus === "declared" && declaredRef ? (
              <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
                <p className="text-muted-foreground">Référence déclarée par le client :</p>
                <p className="font-mono font-bold text-base select-all">{declaredRef}</p>
                <p className="text-xs text-muted-foreground">
                  Compare-la à la référence de réception dans ton compte opérateur.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Le client n&apos;a pas encore déclaré de paiement sur la plateforme — confirme uniquement si le
                montant est réellement arrivé (transfert direct, référence notée dans l&apos;historique).
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="confirmNote">Note de vérification (optionnel)</Label>
              <Input
                id="confirmNote"
                placeholder="Ex : réf de réception 9xxxxxxx vérifiée, montant exact"
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                disabled={busy}
                onClick={async () => {
                  await callOrders({ confirmDirect: true, reason: confirmNote })
                  setConfirmOpen(false)
                  setConfirmNote("")
                }}
              >
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Confirmer l&apos;encaissement
              </Button>
              <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                Annuler
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historique immuable (timeline) */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto scrollbar-thin">
          <DialogHeader>
            <DialogTitle>Historique de {orderRef}</DialogTitle>
            <DialogDescription>Journal immuable — chaque événement est tracé (qui, quand, avant → après).</DialogDescription>
          </DialogHeader>
          <ol className="relative border-l-2 border-primary/20 ml-2 space-y-4">
            {events.length === 0 && <li className="text-sm text-muted-foreground">Aucun événement enregistré.</li>}
            {events.map((ev) => (
              <li key={ev.id} className="ml-4">
                <span className="absolute -left-[7px] w-3 h-3 rounded-full bg-primary/70" aria-hidden="true" />
                <p className="text-sm font-semibold">
                  {EVENT_TYPE_LABELS[ev.type as OrderEventType] ?? ev.type}
                  {ev.newValue && ["status_changed", "delivery_updated", "delivery_failed", "delivery_retry", "delivery_returned"].includes(ev.type) && (
                    <span className="font-normal text-muted-foreground">
                      {" "}· {ev.oldValue && `${ORDER_STATUS_LABELS[ev.oldValue] ?? DELIVERY_STATUS_LABELS[ev.oldValue] ?? ev.oldValue} → `}
                      {ORDER_STATUS_LABELS[ev.newValue] ?? DELIVERY_STATUS_LABELS[ev.newValue] ?? ev.newValue}
                    </span>
                  )}
                </p>
                {ev.reason && <p className="text-xs text-muted-foreground">{ev.reason}</p>}
                <p className="text-[11px] text-muted-foreground/70">
                  {new Date(ev.createdAt).toLocaleString("fr-FR")} · {ev.actorLabel || "Système"}
                </p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
      {/* Phase D — Preuve photographique (vue agrandie, jamais publique) */}
      <Dialog open={proofViewOpen} onOpenChange={setProofViewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preuve du paiement — {orderRef}</DialogTitle>
            <DialogDescription>
              Capture jointe par le client — visible du vendeur et de l&apos;administration uniquement.
            </DialogDescription>
          </DialogHeader>
          {proofLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
            </div>
          ) : proofUrl ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={proofUrl}
                alt="Preuve du transfert Mobile Money"
                className="w-full max-h-[55vh] rounded-xl border object-contain"
              />
              {proofNote && <p className="text-xs text-muted-foreground">Note du client : {proofNote}</p>}
              {proofAt && (
                <p className="text-[11px] text-muted-foreground/70">Jointe le {new Date(proofAt).toLocaleString("fr-FR")}</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Aucune capture jointe pour l&apos;instant — le client peut en joindre une depuis ses commandes.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ═══════════ 2. CATÉGORIES DE LA BOUTIQUE ═══════════ */

interface StoreCategory {
  id: string
  name: string
  slug: string
  globalCategoryId: string | null
  active: boolean
  _count?: { products: number }
}

export function StoreCategoriesManager({ slug, onChanged }: { slug: string; onChanged?: () => void }) {
  const [cats, setCats] = useState<StoreCategory[] | null>(null)
  const [name, setName] = useState("")
  const [globalCat, setGlobalCat] = useState("")
  const [globalOptions, setGlobalOptions] = useState<{ id: string; name: string; icon: string }[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/store-categories?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      const data = await res.json()
      if (res.ok) setCats(data.categories)
    } catch {
      // silencieux
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      await load()
      try {
        const res = await fetch("/api/categories", { cache: "no-store" })
        const data = await res.json()
        if (!cancelled && res.ok) setGlobalOptions(data.global ?? [])
      } catch {
        // silencieux
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const create = async () => {
    if (name.trim().length < 2) return toast.error("Nom de catégorie trop court.")
    setBusy(true)
    try {
      const res = await fetch("/api/store-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: name.trim(), globalCategoryId: globalCat || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      toast.success(`Catégorie « ${name.trim()} » créée ✅`)
      setName("")
      setGlobalCat("")
      await load()
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string, catName: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/store-categories?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      toast.success(`« ${catName} » supprimée (${data.reassignedProducts} produit(s) conservés)`)
      await load()
      onChanged?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="font-bold text-sm flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Catégories de ma boutique
        </p>
        <p className="text-xs text-muted-foreground">
          Organise tes produits (ex : iPhone, Chargeurs…). Rattachables aux catégories globales du marketplace.
          Les produits liés conservent leur libellé si tu supprimes une catégorie.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            placeholder="Ex : Chargeurs"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="flex-1"
            aria-label="Nouvelle catégorie"
          />
          <Select value={globalCat} onValueChange={setGlobalCat}>
            <SelectTrigger className="sm:w-52" aria-label="Catégorie globale de rattachement">
              <SelectValue placeholder="Rattacher à (optionnel)" />
            </SelectTrigger>
            <SelectContent>
              {globalOptions.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.icon} {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={create} disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />} Ajouter
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
          {(cats ?? []).map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1.5 py-1 pr-1">
              {c.name}
              {c._count && c._count.products > 0 && (
                <span className="text-[10px] opacity-60">×{c._count.products}</span>
              )}
              <button
                onClick={() => remove(c.id, c.name)}
                disabled={busy}
                aria-label={`Supprimer la catégorie ${c.name}`}
                className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {cats && cats.length === 0 && (
            <p className="text-xs text-muted-foreground">Aucune catégorie — tes produits restent filtrables par libellé libre.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ═══════════ 3. BOOST — Promotion payante (≠ Premium) ═══════════ */

interface BoostCampaign {
  id: string
  status: string
  costUSD: number
  startAt: string
  endAt: string
  impressions: number
  clicks: number
  paymentRef: string
}

export function BoostPanel({ slug }: { slug: string }) {
  const [campaigns, setCampaigns] = useState<BoostCampaign[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [prices, setPrices] = useState<{ p7: number; p30: number } | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/boost?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      const data = await res.json()
      if (res.ok) setCampaigns(data.campaigns)
    } catch {
      // silencieux
    }
  }, [slug])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.resolve()
      if (cancelled) return
      await load()
      try {
        const res = await fetch("/api/platform", { cache: "no-store" })
        const data = await res.json()
        if (!cancelled && res.ok) {
          setPrices({
            p7: typeof data.config?.["boost.price7USD"] === "number" ? data.config["boost.price7USD"] : 2,
            p30: typeof data.config?.["boost.price30USD"] === "number" ? data.config["boost.price30USD"] : 5,
          })
        }
      } catch {
        // silencieux
      }
    })()
    return () => {
      cancelled = true
    }
  }, [load])

  const create = async (days: 7 | 30) => {
    setBusy(true)
    try {
      const res = await fetch("/api/boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, days }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erreur.")
      // Phase F — paiement en ligne Chariow (produit À PRIX FIXE configuré) :
      // redirection vers la page hébergée ; au retour, l'app reboote sur le
      // dashboard et la webhook passe la campagne « active » (temps réel).
      if (data.payment?.mode === "chariow" && data.payment.url) {
        toast.success("Redirection vers le paiement sécurisé…")
        window.location.href = data.payment.url
        return
      }
      if (data.payment?.mode === "chariow_error") {
        await load() // la campagne créée reste visible « en attente de paiement »
        throw new Error(data.payment.error || "Paiement impossible.")
      }
      // Repli manual (produit du palier non configuré) : la campagne reste en
      // attente d'activation par l'administration. En mode démo explicite
      // (PAYMENT_SIMULATION), la confirmation simulée fonctionne ; en
      // production la requête est refusée (403 kill-switch) — même UX honnête.
      const res2 = await fetch("/api/boost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.campaign.id }),
      })
      const data2 = await res2.json().catch(() => null)
      if (res2.ok) {
        toast.success("Campagne active — ta boutique apparaît en « Sponsorisé » sur l'accueil 🚀")
      } else {
        toast.info("Campagne créée — paiement en attente.")
      }
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  // Phase F — re-initie le paiement Chariow d'une campagne en attente
  // (session abandonnée / paiement plus tard). Aucune écriture de statut :
  // l'activation reste le fait d'un paiement vérifié (webhook) ou de l'admin.
  const payPending = async (id: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/boost", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "checkout" }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Paiement impossible.")
      toast.success("Redirection vers le paiement sécurisé…")
      window.location.href = data.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inconnue")
    } finally {
      setBusy(false)
    }
  }

  const active = (campaigns ?? []).find((c) => c.status === "active")

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <p className="font-bold text-sm flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> Promotion payante (Boost)
        </p>
        <p className="text-xs text-muted-foreground">
          Met ta boutique en tête de l&apos;accueil, étiquetée « Sponsorisé ».{" "}
          <strong>Indépendant de l&apos;abonnement Premium</strong> (qui donne des fonctionnalités).{" "}
          La boutique doit avoir <strong>au moins 1 produit</strong> pour apparaître en Sponsorisé.
        </p>

        {active ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm">
            <p className="font-bold text-emerald-800">🚀 Campagne active</p>
            <p className="text-xs text-emerald-700">
              Jusqu&apos;au {new Date(active.endAt).toLocaleDateString("fr-FR")} · {active.impressions} impressions ·{" "}
              {active.clicks} clics · {formatUSD(active.costUSD)}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-auto py-2 flex-col gap-0.5" disabled={busy} onClick={() => create(7)}>
              <span className="font-bold">7 jours</span>
              <span className="text-xs text-muted-foreground">{prices ? formatUSD(prices.p7) : "$2"}</span>
            </Button>
            <Button className="h-auto py-2 flex-col gap-0.5" disabled={busy} onClick={() => create(30)}>
              <span className="font-bold">30 jours</span>
              <span className="text-xs opacity-80">{prices ? formatUSD(prices.p30) : "$5"}</span>
            </Button>
          </div>
        )}

        {(campaigns ?? []).filter((c) => c.status !== "active").length > 0 && (
          <div className="space-y-1">
            {(campaigns ?? [])
              .filter((c) => c.status !== "active")
              .slice(0, 4)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs text-muted-foreground border-b py-1">
                  <span>
                    {new Date(c.startAt).toLocaleDateString("fr-FR")} → {new Date(c.endAt).toLocaleDateString("fr-FR")}
                  </span>
                  {c.status === "pending_payment" ? (
                    <span className="flex items-center gap-2">
                      <span>Paiement en attente</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        disabled={busy}
                        onClick={() => payPending(c.id)}
                        title="Payer maintenant via le paiement en ligne sécurisé (si configuré)"
                      >
                        Payer
                      </Button>
                    </span>
                  ) : (
                    <span>
                      {c.status === "ended"
                        ? "Terminée"
                        : c.status === "expired"
                          ? "Expirée"
                          : "Rejetée"}{" "}
                      · {c.impressions} vues
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** Ré-export du type zone pour le dashboard (options enrichies). */
export type { DeliveryZoneData }
