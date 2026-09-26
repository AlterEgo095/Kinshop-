"use client"

// Onglet « Solde » du tableau de bord vendeur (Cycle 3 / LOT 2 — retraits).
// Lecture GET /api/wallet?slug= : solde agrégé depuis le ledger (jamais stocké),
// demandes de retrait existantes, coordonnées Mobile Money actives.
// Demande POST /api/wallet : montant en FC vers une coordonnée active — le
// bénéficiaire est figé à la demande, l'administration approuve/règle ensuite.

import { useCallback, useEffect, useState } from "react"
import { Banknote, Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface WalletSummary {
  collectedFC: number
  commissionFC: number
  reversedFC: number
  refundsFC: number
  adjustmentsFC: number
  withdrawnFC: number
  availableFC: number
}
interface WithdrawalRow {
  id: string
  amount: number
  fee: number
  netAmount: number
  status: string
  method: string
  accountName: string
  accountNumber: string
  reference: string
  failReason: string
  createdAt: string
}
interface ActiveSetting {
  provider: string
  accountName: string
  accountNumber: string
  network: string
}
interface WalletData {
  summary: WalletSummary
  minWithdrawFC: number
  hasActive: boolean
  withdrawals: WithdrawalRow[]
  activeSettings: ActiveSetting[]
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: "En attente d'approbation", cls: "bg-amber-500 hover:bg-amber-500" },
  approved: { label: "Approuvé — en cours de règlement", cls: "bg-blue-500 hover:bg-blue-500" },
  paid: { label: "Payé", cls: "bg-emerald-600 hover:bg-emerald-600" },
  rejected: { label: "Refusé", cls: "bg-zinc-500 hover:bg-zinc-500" },
  failed: { label: "Échec — débloqué", cls: "bg-rose-500 hover:bg-rose-500" },
}
const PROVIDER_LABEL: Record<string, string> = {
  mpesa: "M-Pesa",
  airtel: "Airtel Money",
  orange: "Orange Money",
}

function fmtFC(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FC`
}

export function DashboardWallet({ slug }: { slug: string }) {
  const [data, setData] = useState<WalletData | null>(null)
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/wallet?slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Chargement impossible")
      setData(json as WalletData)
      if (!method && json.activeSettings?.length) setMethod(json.activeSettings[0].provider)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    const value = Number(amount)
    if (!value || value <= 0) {
      toast.error("Indique un montant en FC.")
      return
    }
    if (!method) {
      toast.error("Choisis un moyen d'encaissement.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, amountFC: value, method, note }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Demande refusée")
      toast.success("Demande de retrait envoyée — l'administration va l'examiner.")
      setAmount("")
      setNote("")
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setSubmitting(false)
    }
  }

  const s = data?.summary
  const settings = data?.activeSettings ?? []

  return (
    <div className="space-y-4">
      {/* Soldes */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4 text-muted-foreground" /> Solde disponible
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{fmtFC(s?.availableFC ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              encaissements − commission + remboursements − retraits
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total encaissé</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{fmtFC(s?.collectedFC ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground">
              commission plateforme : {fmtFC(s?.commissionFC ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Déjà retiré</CardTitle>
          </CardHeader>
          <CardContent>
            {loading && !data ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <div className="text-2xl font-bold">{fmtFC(-(s?.withdrawnFC ?? 0))}</div>
            )}
            <p className="text-xs text-muted-foreground">net réglé vers tes coordonnées</p>
          </CardContent>
        </Card>
      </div>

      {/* Demande de retrait */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Demander un retrait</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.hasActive ? (
            <p className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <Clock className="h-4 w-4 shrink-0" />
              Un retrait est déjà en cours (demande ou approuvé). Attends son traitement avant d'en
              demander un nouveau.
            </p>
          ) : settings.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md border p-3 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Configure d'abord tes coordonnées d'encaissement Mobile Money dans l'onglet Réglages.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="w-amount">Montant (FC)</Label>
                <Input
                  id="w-amount"
                  type="number"
                  min={data?.minWithdrawFC ?? 0}
                  placeholder={`Minimum : ${fmtFC(data?.minWithdrawFC ?? 0)}`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-method">Vers (coordonnées actives)</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="w-method">
                    <SelectValue placeholder="Choisir un moyen" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.map((st) => (
                      <SelectItem key={st.provider} value={st.provider}>
                        {PROVIDER_LABEL[st.provider] ?? st.provider} — {st.accountName} (
                        {st.accountNumber})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="w-note">Note (optionnel)</Label>
                <Textarea
                  id="w-note"
                  rows={2}
                  placeholder="Précisions éventuelles pour l'administration"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Button onClick={submit} disabled={submitting}>
                  <Send className="w-4 h-4 mr-1.5" />
                  Envoyer la demande
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            Mes retraits
            <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Actualiser
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.withdrawals ?? []).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Aucun retrait pour le moment — ton solde s'accumule à chaque encaissement confirmé.
            </p>
          )}
          {(data?.withdrawals ?? []).map((w) => {
            const badge = STATUS_BADGE[w.status] ?? { label: w.status, cls: "" }
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border p-3 text-sm"
              >
                <div className="font-mono font-semibold">{fmtFC(w.netAmount)}</div>
                <Badge className={badge.cls}>{badge.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {PROVIDER_LABEL[w.method] ?? w.method} · {w.accountName} ({w.accountNumber})
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(w.createdAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
                {w.reference && (
                  <span className="text-xs text-muted-foreground">réf : {w.reference}</span>
                )}
                {w.failReason && (
                  <span className="text-xs text-rose-600">échec : {w.failReason}</span>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
