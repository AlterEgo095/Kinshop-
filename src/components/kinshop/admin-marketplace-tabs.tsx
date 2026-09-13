"use client"

// V10 — Onglets marketplace de la console ADMIN :
// Utilisateurs · Signalements · Promotions (Boost) · Journal d'audit global

import { useCallback, useEffect, useState } from "react"
import { Loader2, Search, ShieldCheck, ShieldAlert, Megaphone, ScrollText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { timeAgo, formatUSD } from "@/lib/kinshop"
import {
  REPORT_REASON_LABELS,
  REPORT_STATUS_LABELS,
  REFUND_STATUS_LABELS,
} from "@/lib/order-workflow"

const PIN_HEADERS = (): Record<string, string> => {
  // Le PIN est saisi une fois par session admin (voir AdminConsole, clé localStorage)
  const pin = typeof window !== "undefined" ? localStorage.getItem("kinshop_admin_pin") || "" : ""
  return { "x-admin-pin": pin, "Content-Type": "application/json" }
}

/* ═══════════ UTILISATEURS ═══════════ */

interface AdminUser {
  id: string
  email: string
  name: string
  whatsapp: string
  role: string
  status: string
  suspendedAt: string | null
  suspendedReason: string
  createdAt: string
  premiumActive: boolean
  stores: { name: string; slug: string; status: string; verificationStatus: string }[]
  _count: { orders: number; reports: number }
}

export function AdminUsersTab() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [stats, setStats] = useState<{ total: number; owners: number; customers: number; suspended: number } | null>(null)
  const [q, setQ] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setUsers(data.users)
      setStats(data.stats)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
      setUsers([])
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

  const filtered = (users ?? []).filter(
    (u) => !q || u.email.toLowerCase().includes(q.toLowerCase()) || u.name.toLowerCase().includes(q.toLowerCase()),
  )

  // P5 (F5-3) — suspension de compte (motif obligatoire, sessions révoquées)
  const accountAction = async (id: string, action: "suspend" | "unsuspend") => {
    let reason = ""
    if (action === "suspend") {
      reason = window.prompt("Motif de suspension (obligatoire, 4 caractères min) :") || ""
      if (reason.trim().length < 4) return
    }
    setBusyId(id)
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: PIN_HEADERS(),
        body: JSON.stringify({ id, action, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(action === "suspend" ? "Compte suspendu — sessions révoquées ✅" : "Suspension levée ✅")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold">{stats?.total ?? "…"}</p><p className="text-xs text-muted-foreground">Comptes</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold">{stats?.owners ?? "…"}</p><p className="text-xs text-muted-foreground">Propriétaires</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold">{stats?.customers ?? "…"}</p><p className="text-xs text-muted-foreground">Clients</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold text-rose-600">{stats?.suspended ?? "…"}</p><p className="text-xs text-muted-foreground">Suspendus</p></CardContent></Card>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Rechercher par nom ou email…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>

      {users === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
          {filtered.map((u) => (
            <Card key={u.id}>
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {u.name} <span className="text-muted-foreground font-normal">· {u.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {u.stores.length > 0
                      ? u.stores.map((s) => `${s.name} (${s.verificationStatus === "verified" ? "vérifiée" : s.verificationStatus})`).join(", ")
                      : "Client — aucune boutique"}
                    {" · "}
                    {u._count.orders} commande(s)
                  </p>
                  <p className="text-[11px] text-muted-foreground/70">Inscrit {timeAgo(u.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {u.role === "admin" && <Badge className="bg-slate-800 text-white">Admin</Badge>}
                  {u.premiumActive && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Premium</Badge>}
                  {u.status === "suspended" && (
                    <Badge className="bg-rose-100 text-rose-700 border-rose-200" title={u.suspendedReason || undefined}>
                      Suspendu
                    </Badge>
                  )}
                  {u.role !== "admin" && (
                    u.status === "suspended" ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === u.id} onClick={() => accountAction(u.id, "unsuspend")}>
                        Réactiver
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600 hover:text-rose-700" disabled={busyId === u.id} onClick={() => accountAction(u.id, "suspend")}>
                        Suspendre
                      </Button>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Aucun compte trouvé.</p>}
        </div>
      )}
    </div>
  )
}

/* ═══════════ SIGNALEMENTS ═══════════ */

interface AdminReport {
  id: string
  targetType: string
  targetId: string
  targetLabel: string
  reporterLabel: string
  reason: string
  details: string
  status: string
  resolutionNote: string
  createdAt: string
}

const REPORT_NEXT_ACTIONS: Record<string, { status: string; label: string; tone: string }[]> = {
  open: [
    { status: "under_review", label: "Analyser", tone: "default" },
    { status: "dismissed", label: "Rejeter (non fondé)", tone: "outline" },
  ],
  under_review: [
    { status: "action_required", label: "Action requise", tone: "default" },
    { status: "resolved", label: "Résoudre", tone: "default" },
    { status: "dismissed", label: "Rejeter", tone: "outline" },
  ],
  action_required: [
    { status: "resolved", label: "Résoudre", tone: "default" },
    { status: "dismissed", label: "Rejeter", tone: "outline" },
  ],
}

export function AdminReportsTab() {
  const [reports, setReports] = useState<AdminReport[] | null>(null)
  const [counts, setCounts] = useState<{ open: number; under_review: number; action_required: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports", { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReports(data.reports)
      setCounts(data.counts)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
      setReports([])
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

  const transition = async (id: string, status: string, resolutionNote?: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: PIN_HEADERS(),
        body: JSON.stringify({ id, status, resolutionNote }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Signalement mis à jour ✅")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  // P5 (F5-6) — clôture avec décision écrite OBLIGATOIRE + passerelle modération
  const closeWithNote = async (id: string, status: "resolved" | "dismissed") => {
    const note = window.prompt(status === "resolved" ? "Décision / résolution (obligatoire, 4 caractères min) :" : "Motif du rejet (obligatoire, 4 caractères min) :") || ""
    if (note.trim().length < 4) {
      if (note.trim().length > 0) toast.error("Note trop courte (4 caractères min).")
      return
    }
    await transition(id, status, note)
  }

  // P5 (F5-6) — suspendre directement la boutique ciblée par le signalement
  const suspendStore = async (id: string) => {
    const note = window.prompt("Motif de suspension de la boutique (optionnel) :") || ""
    setBusy(true)
    try {
      const res = await fetch("/api/admin/reports", {
        method: "PATCH",
        headers: PIN_HEADERS(),
        body: JSON.stringify({ id, action: "suspend_store", resolutionNote: note }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Boutique suspendue et signalement marqué « Action requise » ✅")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold text-rose-600">{counts?.open ?? "…"}</p><p className="text-xs text-muted-foreground">Ouverts</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold text-amber-600">{counts?.under_review ?? "…"}</p><p className="text-xs text-muted-foreground">En analyse</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-2xl font-extrabold text-red-700">{counts?.action_required ?? "…"}</p><p className="text-xs text-muted-foreground">Action requise</p></CardContent></Card>
      </div>

      {reports === null ? (
        <Skeleton className="h-40 w-full" />
      ) : reports.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
          <p className="text-sm text-muted-foreground">Aucun signalement — la communauté est sereine.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
          {reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="truncate">
                        {r.targetType} : {r.targetLabel}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Motif : {REPORT_REASON_LABELS[r.reason] || r.reason} · signalé par {r.reporterLabel || "?"} · {timeAgo(r.createdAt)}
                    </p>
                  </div>
                  <Badge
                    className={
                      r.status === "open"
                        ? "bg-rose-100 text-rose-700 border-rose-200"
                        : r.status === "resolved"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : r.status === "dismissed"
                            ? "bg-muted"
                            : "bg-amber-100 text-amber-800 border-amber-200"
                    }
                  >
                    {REPORT_STATUS_LABELS[r.status] || r.status}
                  </Badge>
                </div>
                <p className="text-sm bg-muted/50 rounded-lg p-2">{r.details}</p>
                {r.resolutionNote && (
                  <p className="text-xs text-muted-foreground italic">Décision : {r.resolutionNote}</p>
                )}
                {r.targetType === "store" && r.status !== "resolved" && r.status !== "dismissed" && (
                  <Button size="sm" variant="outline" className="h-7 text-xs text-rose-600 hover:text-rose-700" disabled={busy} onClick={() => suspendStore(r.id)}>
                    <ShieldAlert className="w-3 h-3 mr-1" />
                    Suspendre cette boutique
                  </Button>
                )}
                {(REPORT_NEXT_ACTIONS[r.status] ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(REPORT_NEXT_ACTIONS[r.status] ?? []).map((a) =>
                      a.status === "resolved" || a.status === "dismissed" ? (
                        <Button key={a.status} size="sm" variant={a.tone as "default" | "outline"} className="h-7 text-xs" disabled={busy} onClick={() => closeWithNote(r.id, a.status as "resolved" | "dismissed")}>
                          {a.label}
                        </Button>
                      ) : (
                        <Button key={a.status} size="sm" variant={a.tone as "default" | "outline"} className="h-7 text-xs" disabled={busy} onClick={() => transition(r.id, a.status)}>
                          {a.label}
                        </Button>
                      ),
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════ PROMOTIONS (BOOST) ═══════════ */

interface AdminBoost {
  id: string
  status: string
  costUSD: number
  startAt: string
  endAt: string
  impressions: number
  clicks: number
  store: { name: string; slug: string; logoEmoji: string }
}

export function AdminBoostTab() {
  const [campaigns, setCampaigns] = useState<AdminBoost[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/boost", { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCampaigns(data.campaigns)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
      setCampaigns([])
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

  const act = async (id: string, action: string) => {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/boost", {
        method: "PATCH",
        headers: PIN_HEADERS(),
        body: JSON.stringify({ id, action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success("Campagne mise à jour ✅")
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-primary" />
        Campagnes sponsorisées — indépendantes de l&apos;abonnement Premium. La fin d&apos;une campagne retire la boutique de l&apos;accueil automatiquement.
      </p>
      {campaigns === null ? (
        <Skeleton className="h-40 w-full" />
      ) : campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Aucune campagne de promotion.</p>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
          {campaigns.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">
                    {c.store.logoEmoji} {c.store.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.startAt).toLocaleDateString("fr-FR")} → {new Date(c.endAt).toLocaleDateString("fr-FR")} ·{" "}
                    {c.impressions} impressions · {c.clicks} clics · {formatUSD(c.costUSD)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    className={
                      c.status === "active"
                        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                        : c.status === "pending_payment"
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-muted"
                    }
                  >
                    {c.status === "active"
                      ? "Active"
                      : c.status === "pending_payment"
                        ? "En attente"
                        : c.status === "ended"
                          ? "Terminée"
                          : c.status === "expired"
                            ? "Expirée"
                            : "Rejetée"}
                  </Badge>
                  {c.status !== "ended" && c.status !== "rejected" && c.status !== "expired" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act(c.id, "end")}>
                      Clore
                    </Button>
                  )}
                  {c.status === "pending_payment" && (
                    <>
                      <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => act(c.id, "activate")}>
                        Activer
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 hover:text-red-700" disabled={busy} onClick={() => act(c.id, "reject")}>
                        Rejeter
                      </Button>
                    </>
                  )}
                  {c.status === "ended" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act(c.id, "activate")}>
                      Relancer
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════ JOURNAL D'AUDIT GLOBAL ═══════════ */

interface AuditRow {
  id: string
  action: string
  target: string
  detail: string
  actorType: string
  actorLabel?: string
  entityType: string
  createdAt: string
}

const REFUND_ACTION_FOR_LOGS = "refund." // préfixe

export function AdminAuditTab() {
  const [logs, setLogs] = useState<AuditRow[] | null>(null)
  const [q, setQ] = useState("")
  const [actorType, setActorType] = useState("all")
  const [entityType, setEntityType] = useState("all")
  // P5 (F5-4) — verdict d'intégrité de la chaîne d'audit
  const [verdict, setVerdict] = useState<{ intact: boolean; checked: number; legacy: number; brokenAt: { id: string; seq: number; reason: string } | null } | null>(null)
  const [verifying, setVerifying] = useState(false)

  const load = useCallback(async () => {
    const params = new URLSearchParams({ type: "audit", limit: "120" })
    if (q) params.set("q", q)
    if (actorType !== "all") params.set("actorType", actorType)
    if (entityType !== "all") params.set("entityType", entityType)
    try {
      const res = await fetch(`/api/admin/logs?${params}`, { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (res.ok) setLogs(data.logs)
    } catch {
      // silencieux
    }
  }, [q, actorType, entityType])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    t = setTimeout(() => {
      void load()
    }, 250)
    return () => {
      if (t) clearTimeout(t)
    }
  }, [load])

  // P5 (F5-4) — vérification de la chaîne d'intégrité (recalcul côté serveur)
  const checkIntegrity = async () => {
    setVerifying(true)
    try {
      const res = await fetch("/api/admin/logs?verify=1", { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setVerdict(data.verdict)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Chaque entrée scelle la précédente (empreinte SHA-256) — toute altération ou suppression est détectable.
        </p>
        <Button size="sm" variant="outline" onClick={checkIntegrity} disabled={verifying}>
          {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          Vérifier l&apos;intégrité
        </Button>
      </div>
      {verdict && (
        <div
          role="status"
          className={`rounded-xl border p-3 text-sm flex items-start gap-2 ${
            verdict.intact ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-rose-300 bg-rose-50 text-rose-900"
          }`}
        >
          {verdict.intact ? <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" /> : <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />}
          <div>
            <p className="font-bold">
              {verdict.intact
                ? `Chaîne intacte — ${verdict.checked} entrée(s) vérifiée(s)`
                : `CHAÎNE COMPROMISE à l'entrée #${verdict.brokenAt?.seq}`}
            </p>
            <p className="text-xs">
              {verdict.intact
                ? verdict.legacy > 0
                  ? `${verdict.legacy} entrée(s) héritée(s) antérieure(s) à la mise en place de la chaîne (non scellées).`
                  : "Toutes les empreintes et l'enchaînement ont été recalculés avec succès."
                : verdict.brokenAt?.reason}
            </p>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <Input placeholder="Rechercher dans le journal…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Recherche journal" />
        <Select value={actorType} onValueChange={setActorType}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrer par acteur">
            <SelectValue placeholder="Acteur" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les acteurs</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="owner">Vendeurs</SelectItem>
            <SelectItem value="customer">Clients</SelectItem>
            <SelectItem value="user">Utilisateurs</SelectItem>
            <SelectItem value="system">Système</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="sm:w-40" aria-label="Filtrer par entité">
            <SelectValue placeholder="Entité" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes entités</SelectItem>
            <SelectItem value="order">Commandes</SelectItem>
            <SelectItem value="store">Boutiques</SelectItem>
            <SelectItem value="invoice">Factures</SelectItem>
            <SelectItem value="report">Signalements</SelectItem>
            <SelectItem value="boost">Promotions</SelectItem>
            <SelectItem value="config">Configuration</SelectItem>
            <SelectItem value="auth">Authentification</SelectItem>
            <SelectItem value="user">Comptes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logs === null ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="rounded-xl border max-h-[60vh] overflow-y-auto scrollbar-thin">
          {logs.map((l) => (
            <div key={l.id} className="p-2.5 border-b last:border-0 text-sm flex items-start gap-2">
              <ScrollText className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs font-semibold text-primary">{l.action}</p>
                <p className="text-xs truncate">
                  <span className="font-medium">{l.target}</span>
                  {l.detail && <span className="text-muted-foreground"> — {l.detail}</span>}
                </p>
              </div>
              <div className="text-right shrink-0">
                <Badge variant="outline" className="text-[10px] mb-0.5">
                  {l.actorType}
                </Badge>
                <p className="text-[10px] text-muted-foreground">{timeAgo(l.createdAt)}</p>
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">Aucune entrée pour ce filtre.</p>}
        </div>
      )}
    </div>
  )
}

/* ═══════════ REMBOURSEMENTS (section intégrable) ═══════════ */

interface AdminRefund {
  id: string
  amountUSD: number
  status: string
  reason: string
  reference: string
  method: string
  requestedByType: string
  createdAt: string
  order: { ref: string; totalUSD: number; store: { name: string } }
}

export function AdminRefundsSection() {
  const [refunds, setRefunds] = useState<AdminRefund[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/refunds", { headers: { "x-admin-pin": localStorage.getItem("kinshop_admin_pin") || "" }, cache: "no-store" })
      const data = await res.json()
      if (res.ok) setRefunds(data.refunds)
    } catch {
      // silencieux
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

  const act = async (id: string, action: "approve" | "reject" | "execute") => {
    setBusy(true)
    try {
      const body: Record<string, unknown> = { id, action }
      if (action === "execute") {
        const reference = window.prompt("Référence du remboursement (opérateur / reçu) :")
        if (reference === null) return
        body.reference = reference
      }
      const res = await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: PIN_HEADERS(),
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Remboursement ${REFUND_STATUS_LABELS[data.refund.status] ?? data.refund.status} ✅`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur")
    } finally {
      setBusy(false)
    }
  }

  if (refunds === null) return <Skeleton className="h-32 w-full" />
  if (refunds.length === 0) return <p className="text-sm text-muted-foreground text-center py-6">Aucune demande de remboursement.</p>

  return (
    <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
      {refunds.map((r) => (
        <Card key={r.id}>
          <CardContent className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-sm">
                  {r.order.ref} · {r.order.store.name} · {formatUSD(r.amountUSD)}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.reason} — demandé par {r.requestedByType === "customer" ? "le client" : "le vendeur"} · {timeAgo(r.createdAt)}
                  {r.reference ? ` · réf ${r.reference}` : ""}
                </p>
              </div>
              <Badge
                className={
                  r.status === "executed"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : r.status === "rejected"
                      ? "bg-rose-100 text-rose-700 border-rose-200"
                      : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {REFUND_STATUS_LABELS[r.status] || r.status}
              </Badge>
            </div>
            {r.status === "requested" && (
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs" disabled={busy} onClick={() => act(r.id, "approve")}>
                  Approuver
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => act(r.id, "reject")}>
                  Refuser
                </Button>
              </div>
            )}
            {r.status === "approved" && (
              <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={busy} onClick={() => act(r.id, "execute")}>
                <Loader2 className={`w-3 h-3 mr-1 ${busy ? "animate-spin" : "hidden"}`} />
                Marquer exécuté (réf. obligatoire)
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
