"use client"

// Onglet « Finances » de la console admin (Phase E — ledger mode ombre).
// Lecture pure de GET /api/admin/finance : revenus KinShop (Chariow), volume
// marketplace encaissé par les vendeurs, dernières écritures du ledger et
// état de la réconciliation. AUCUNE action monétaire ici.

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface WithdrawalRow {
  id: string
  storeId: string
  amount: number
  fee: number
  netAmount: number
  currency: string
  status: string
  method: string
  accountName: string
  accountNumber: string
  reference: string
  proofNote: string
  failReason: string
  createdAt: string
}
interface WithdrawalsData {
  withdrawals: WithdrawalRow[]
  stores: { id: string; name: string; slug: string }[]
}
const WD_STATUS: Record<string, { label: string; cls: string }> = {
  requested: { label: "Demandé", cls: "bg-amber-500 hover:bg-amber-500" },
  approved: { label: "Approuvé", cls: "bg-blue-500 hover:bg-blue-500" },
  paid: { label: "Payé", cls: "bg-emerald-600 hover:bg-emerald-600" },
  rejected: { label: "Refusé", cls: "bg-zinc-500 hover:bg-zinc-500" },
  failed: { label: "Échec — débloqué", cls: "bg-rose-500 hover:bg-rose-500" },
}

interface FinanceData {
  platform: {
    revenueTotalUSD: number
    revenueCount: number
    byKind: { kind: string; amountUSD: number; count: number }[]
  }
  marketplace: {
    collectedTotalFC: number
    collectedCount: number
    commissionPercent?: number
    commissionTotalFC?: number
    commissionReversedFC?: number
    netVendorTotalFC?: number
    bySource: { source: string; amountFC: number; count: number }[]
  }
  ledger: {
    entryCount: number
    walletCount: number
    recentEntries: {
      id: string
      scope: string
      kind: string
      type: string
      status: string
      amount: number
      currency: string
      psPSource: string
      reference: string
      note: string
      createdAt: string
    }[]
  }
  reconciliation: {
    paidOrdersWithoutEntryCount: number
    paidOrdersWithoutEntry: { ref: string; method: string; totalFC: number }[]
    vendorEntriesCount: number
    pulsesSuccessfulCount: number
    platformSaleCount: number
  }
}

const SCOPE_LABEL: Record<string, string> = {
  vendor: "Vendeur",
  platform: "KinShop",
}
const TYPE_LABEL: Record<string, string> = {
  SALE: "Vente",
  DELIVERY_CASH: "Espèces",
  REFUND: "Remboursement",
  COMMISSION_REVERSAL: "Commission reversée",
  ADJUSTMENT: "Ajustement",
}
const SOURCE_LABEL: Record<string, string> = {
  direct: "MM direct",
  cash: "Espèces",
  chariow: "Chariow",
  refund: "Remboursement",
}
const KIND_LABEL: Record<string, string> = {
  premium: "Premium",
  boost: "Boost",
  order: "Commande",
  collection: "Encaissement",
  refund: "Remboursement",
}

function fmtFC(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FC`
}
function fmtUSD(n: number): string {
  return `$${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function AdminFinanceTab() {
  const [data, setData] = useState<FinanceData | null>(null)
  const [wd, setWd] = useState<WithdrawalsData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/finance", { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Chargement impossible")
      setData(json as FinanceData)
      // Cycle 3 — retraits : liste + décisions (le dashboard vendeur demande,
      // la console admin approuve / règle / trace — double contrôle ch. 16).
      const wres = await fetch("/api/admin/withdrawals", { cache: "no-store" })
      const wjson = await wres.json().catch(() => null)
      if (wres.ok && wjson) setWd(wjson as WithdrawalsData)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
  }, [])

  const wdAction = async (id: string, action: string, extra?: Record<string, string>) => {
    try {
      const res = await fetch("/api/admin/withdrawals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, ...extra }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Action refusée")
      toast.success("Retrait mis à jour.")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    }
  }

  useEffect(() => {
    load()
  }, [load])

  const rec = data?.reconciliation
  const recOk =
    rec &&
    rec.paidOrdersWithoutEntryCount === 0 &&
    rec.pulsesSuccessfulCount === rec.platformSaleCount

  return (
    <div className="space-y-4">
      {/* Bandeau d'avertissement du mode ombre */}
      <Card>
        <CardContent className="py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Ledger en mode ombre (Phase E)</span> —
            double écriture d&apos;observation des faits d&apos;argent déjà vérifiés par les flux
            métier. Les vendeurs encaissent toujours en direct (KinShop ne détient aucun fonds) ; la
            commission plateforme est paramétrable (console → Finances, 0 = aucun prélèvement) et
            figée par écriture ; aucune exposition vendeur directe n&apos;existe encore (retraits : lot
            suivant). Revenus KinShop = Chariow + commission marketplace.
          </p>
        </CardContent>
      </Card>

      {/* Cartes principales */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenus KinShop (Chariow)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{fmtUSD(data?.platform.revenueTotalUSD ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {data?.platform.revenueCount ?? 0} vente(s) reconnue(s)
              {(data?.platform.byKind ?? []).map((k) => ` · ${KIND_LABEL[k.kind] ?? k.kind} ${fmtUSD(k.amountUSD)}`).join("")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Volume marketplace encaissé</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{fmtFC(data?.marketplace.collectedTotalFC ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              {data?.marketplace.collectedCount ?? 0} encaissement(s) vendeur
              {(data?.marketplace.bySource ?? [])
                .map((s) => ` · ${SOURCE_LABEL[s.source] ?? s.source} ${fmtFC(s.amountFC)}`)
                .join("")}
            </p>
            {(data?.marketplace.commissionTotalFC ?? 0) > 0 ||
            (data?.marketplace.commissionPercent ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Commission ({data?.marketplace.commissionPercent ?? 0} %) :{" "}
                {fmtFC(data?.marketplace.commissionTotalFC ?? 0)} — reversée :{" "}
                {fmtFC(data?.marketplace.commissionReversedFC ?? 0)} ·{" "}
                <span className="font-medium text-foreground">
                  Net vendeur : {fmtFC(data?.marketplace.netVendorTotalFC ?? 0)}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Commission : 0 % (aucun prélèvement)
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Journal financier</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              {loading && !data ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <div className="text-2xl font-bold">{data?.ledger.entryCount ?? 0}</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              écriture(s) · {data?.ledger.walletCount ?? 0} wallet(s) boutique (aucun solde stocké)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Réconciliation */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            {recOk ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            Réconciliation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={rec && rec.paidOrdersWithoutEntryCount === 0 ? "outline" : "destructive"}>
              {rec?.paidOrdersWithoutEntryCount ?? "—"} commande(s) payée(s) sans écriture
            </Badge>
            <Badge variant="outline">
              {rec?.vendorEntriesCount ?? "—"} écriture(s) vendeur
            </Badge>
            <Badge
              variant={
                rec && rec.pulsesSuccessfulCount === rec.platformSaleCount ? "outline" : "secondary"
              }
            >
              Chariow : {rec?.platformSaleCount ?? "—"} revenu(s) reconnu(s) /{" "}
              {rec?.pulsesSuccessfulCount ?? "—"} vente(s) livrée(s)
            </Badge>
            <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="ml-auto">
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </div>
          {(rec?.paidOrdersWithoutEntry.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              À vérifier :{" "}
              {rec!.paidOrdersWithoutEntry
                .map((o) => `${o.ref} (${SOURCE_LABEL[o.method] ?? o.method}, ${fmtFC(o.totalFC)})`)
                .join(" · ")}
              — confirmations antérieures au déploiement du ledger ou écriture échouée (voir logs).
            </p>
          )}
          {rec && rec.pulsesSuccessfulCount !== rec.platformSaleCount && (
            <p className="text-xs text-muted-foreground">
              Écart Chariow attendu si le Pulse écoute « tous produits » : les ventes de produits non
              configurés sont rejetées et journalisées (product_mismatch) sans revenu reconnu.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Retraits vendeurs (cycle 3) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Retraits vendeurs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(wd?.withdrawals ?? []).length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              Aucune demande de retrait — les vendeurs demandent depuis l&apos;onglet Solde de leur
              tableau de bord.
            </p>
          )}
          {(wd?.withdrawals ?? []).map((w) => {
            const store = (wd?.stores ?? []).find((s) => s.id === w.storeId)
            const badge = WD_STATUS[w.status] ?? { label: w.status, cls: "" }
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-3 text-sm"
              >
                <div className="font-mono font-semibold">{fmtFC(w.netAmount)}</div>
                <Badge className={badge.cls}>{badge.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {store ? `${store.name} (${store.slug})` : w.storeId}
                </span>
                <span className="text-xs text-muted-foreground">
                  → {w.accountName} ({w.method} {w.accountNumber})
                </span>
                {w.reference && (
                  <span className="text-xs text-muted-foreground">réf : {w.reference}</span>
                )}
                {w.failReason && (
                  <span className="text-xs text-rose-600">échec : {w.failReason}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(w.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                {w.status === "requested" && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => wdAction(w.id, "approve")}
                      disabled={loading}
                    >
                      Approuver
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => wdAction(w.id, "reject")}
                      disabled={loading}
                    >
                      Refuser
                    </Button>
                  </span>
                )}
                {w.status === "approved" && (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const reference = window.prompt("Référence de la preuve de paiement :")
                        if (reference) wdAction(w.id, "mark_paid", { reference })
                      }}
                      disabled={loading}
                    >
                      Marquer payé
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const failReason = window.prompt("Motif de l'échec (déblocage automatique) :")
                        if (failReason) wdAction(w.id, "mark_failed", { failReason })
                      }}
                      disabled={loading}
                    >
                      Échec
                    </Button>
                  </span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Dernières écritures */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Dernières écritures du ledger</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Portée</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Référence</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.ledger.recentEntries ?? []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(e.createdAt).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={e.scope === "platform" ? "default" : "secondary"}>
                      {SCOPE_LABEL[e.scope] ?? e.scope}
                      {e.kind && e.scope === "platform" ? ` · ${KIND_LABEL[e.kind] ?? e.kind}` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{TYPE_LABEL[e.type] ?? e.type}</TableCell>
                  <TableCell className="text-xs">{SOURCE_LABEL[e.psPSource] ?? e.psPSource}</TableCell>
                  <TableCell
                    className={`text-right font-mono text-xs ${e.amount < 0 ? "text-red-600" : ""}`}
                  >
                    {e.currency === "USD" ? fmtUSD(e.amount) : fmtFC(e.amount)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{e.reference}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={e.note}>
                    {e.note}
                  </TableCell>
                </TableRow>
              ))}
              {(data?.ledger.recentEntries?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Aucune écriture — le ledger se remplit aux prochains encaissements confirmés et
                    ventes Chariow reconnues.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
