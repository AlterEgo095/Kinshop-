"use client"

// Console Admin — Onglet « Configuration » (V9 — centre de contrôle dynamique)
//
// L'UI est GÉNÉRÉE à partir des specs renvoyées par GET /api/admin/config :
// ajouter un paramètre administrable côté serveur (une spec dans
// config-registry.ts) le fait apparaître ici automatiquement, avec son
// libellé, sa description, son type et ses bornes. Aucun écran à coder.
//
// Sécurité : toutes les valeurs sont revalidées par le serveur (PATCH /api/admin/config)
// et chaque modification est journalisée dans le journal d'audit (ancien → nouveau).

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Gauge,
  LayoutGrid,
  Loader2,
  Megaphone,
  RotateCcw,
  Scale,
  Save,
  Settings2,
  ShieldCheck,
  ToggleRight,
  Type as TypeIcon,
  Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CONFIG_SECTIONS,
  type ConfigSectionId,
  type ConfigValue,
} from "@/lib/config-defaults"

/** Même clé que admin-console.tsx (constante locale pour éviter un import circulaire). */
const PIN_KEY = "kinshop_admin_pin"

/* ─────────── Types (miroir de la réponse API) ─────────── */

interface ConfigSpecRow {
  key: string
  section: string
  type: "boolean" | "number" | "string" | "list"
  default: ConfigValue
  public: boolean
  label: string
  description: string
  min: number | null
  max: number | null
  maxLength: number | null
  maxItems: number | null
}

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  general: Settings2,
  features: ToggleRight,
  plans: Gauge,
  catalog: LayoutGrid,
  payments: Wallet,
  business: Scale,
  boost: Megaphone,
  governance: ShieldCheck,
  content: TypeIcon,
}

function listToText(v: string[]): string {
  return v.join("\n")
}

function textToList(t: string): string[] {
  return t
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Valeur saisie → payload API (les listes partent en tableau, les nombres en number). */
function draftToPayload(spec: ConfigSpecRow, raw: unknown): unknown {
  if (spec.type === "list") return textToList(String(raw ?? ""))
  if (spec.type === "number") return Number(raw)
  return raw
}

export function AdminConfigTab() {
  const [specs, setSpecs] = useState<ConfigSpecRow[] | null>(null)
  const [saved, setSaved] = useState<Record<string, ConfigValue>>({})
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [savingSections, setSavingSections] = useState<Record<string, boolean>>({})
  const mountedRef = useRef(true)

  const load = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/config", {
        headers: { "x-admin-pin": localStorage.getItem(PIN_KEY) || "" },
        cache: "no-store",
      })
      if (res.status === 401) {
        toast.error("Session admin expirée — reconnecte-toi.")
        return false
      }
      const data = (await res.json()) as { specs: ConfigSpecRow[]; values: Record<string, ConfigValue> }
      if (!mountedRef.current) return false
      setSpecs(data.specs)
      setSaved(data.values)
      // Les listes sont éditées en texte multi-lignes : conversion au chargement
      const initialDraft: Record<string, unknown> = {}
      for (const s of data.specs) {
        const v = data.values[s.key]
        initialDraft[s.key] = s.type === "list" ? listToText(Array.isArray(v) ? v : []) : v
      }
      setDraft(initialDraft)
      return true
    } catch {
      toast.error("Impossible de charger la configuration.")
      return false
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    ;(async () => {
      // Différé d'un tick : évite un setState synchrone dans l'effet (react-hooks)
      await Promise.resolve()
      await load()
    })()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  /** Une section est « sale » si au moins un champ diffère des valeurs enregistrées. */
  const dirtyBySection = useMemo(() => {
    const map = new Map<string, string[]>()
    if (!specs) return map
    for (const spec of specs) {
      const cur = draft[spec.key]
      const ref = saved[spec.key]
      let dirty: boolean
      if (spec.type === "list") {
        dirty = JSON.stringify(textToList(String(cur ?? ""))) !== JSON.stringify(ref)
      } else if (spec.type === "number") {
        dirty = Number(cur) !== Number(ref)
      } else if (spec.type === "boolean") {
        dirty = Boolean(cur) !== Boolean(ref)
      } else {
        dirty = String(cur ?? "") !== String(ref ?? "")
      }
      if (dirty) {
        const list = map.get(spec.section) ?? []
        list.push(spec.key)
        map.set(spec.section, list)
      }
    }
    return map
  }, [specs, draft, saved])

  const saveSection = useCallback(
    async (sectionId: ConfigSectionId, sectionSpecs: ConfigSpecRow[]) => {
      const dirtyKeys = dirtyBySection.get(sectionId) ?? []
      if (dirtyKeys.length === 0) return
      const values: Record<string, unknown> = {}
      for (const key of dirtyKeys) {
        const spec = sectionSpecs.find((s) => s.key === key)
        if (spec) values[key] = draftToPayload(spec, draft[key])
      }
      setSavingSections((m) => ({ ...m, [sectionId]: true }))
      try {
        const res = await fetch("/api/admin/config", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-admin-pin": localStorage.getItem(PIN_KEY) || "",
          },
          body: JSON.stringify({ values }),
        })
        const data = (await res.json()) as { error?: string; applied?: number; values?: Record<string, ConfigValue> }
        if (res.status === 400 && data.error) {
          toast.error(data.error) // validation serveur (type, bornes, longueur…)
          return
        }
        if (!res.ok) {
          toast.error(data.error || "Échec de l'enregistrement.")
          return
        }
        if (data.values) {
          setSaved(data.values)
          // Merge en conservant les listes sous forme texte (cohérent avec le brouillon)
          setDraft((d) => {
            const next = { ...d }
            for (const s of specs ?? []) {
              if (!(s.key in data.values!)) continue
              const v = data.values![s.key]
              next[s.key] = s.type === "list" ? listToText(Array.isArray(v) ? v : []) : v
            }
            return next
          })
        }
        toast.success(
          `${data.applied ?? 0} paramètre${(data.applied ?? 0) > 1 ? "s" : ""} enregistré${(data.applied ?? 0) > 1 ? "s" : ""} — effectif côté utilisateur en ≤ 30 s.`,
        )
      } catch {
        toast.error("Réseau indisponible — modification non enregistrée.")
      } finally {
        setSavingSections((m) => ({ ...m, [sectionId]: false }))
      }
    },
    [dirtyBySection, draft, specs],
  )

  const resetSection = useCallback(
    (sectionSpecs: ConfigSpecRow[]) => {
      setDraft((d) => {
        const next = { ...d }
        for (const spec of sectionSpecs) {
          next[spec.key] = spec.type === "list" ? listToText(spec.default as string[]) : spec.default
        }
        return next
      })
      toast.info("Valeurs par défaut préparées — clique Enregistrer pour appliquer.")
    },
    [],
  )

  if (!specs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <div className="flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Chargement de la configuration…
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" /> Centre de contrôle dynamique
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tout ce qui est modifié ici est appliqué <strong> côté serveur </strong> (les API
            refusent les écritures non conformes), journalisé dans le journal d&apos;audit
            (ancien → nouveau) et visible côté utilisateur en ≤ 30 s — sans toucher au code.
          </p>
        </CardHeader>
      </Card>

      {CONFIG_SECTIONS.map((section) => {
        const sectionSpecs = specs.filter((s) => s.section === section.id)
        if (sectionSpecs.length === 0) return null
        const Icon = SECTION_ICONS[section.id] ?? Settings2
        const dirtyKeys = dirtyBySection.get(section.id) ?? []
        const saving = savingSections[section.id] ?? false

        return (
          <Card key={section.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" /> {section.title}
                    {dirtyKeys.length > 0 && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                        {dirtyKeys.length} modifié{dirtyKeys.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => resetSection(sectionSpecs)}
                    aria-label={`Réinitialiser ${section.title} aux valeurs par défaut`}
                  >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Défauts
                  </Button>
                  <Button
                    size="sm"
                    disabled={dirtyKeys.length === 0 || saving}
                    onClick={() => saveSection(section.id, sectionSpecs)}
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-1.5" />
                    )}
                    Enregistrer
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 md:grid-cols-2">
              {sectionSpecs.map((spec) => {
                const raw = draft[spec.key]
                const isDirty = dirtyKeys.includes(spec.key)
                return (
                  <div
                    key={spec.key}
                    className={`rounded-lg border p-4 transition-colors ${
                      isDirty ? "border-amber-300 bg-amber-50/50" : "bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Label htmlFor={`cfg-${spec.key}`} className="font-medium text-sm">
                          {spec.label}
                        </Label>
                        {spec.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                            {spec.description}
                          </p>
                        )}
                      </div>
                      {spec.type === "boolean" && (
                        <Switch
                          id={`cfg-${spec.key}`}
                          checked={Boolean(raw)}
                          onCheckedChange={(v) => setDraft((d) => ({ ...d, [spec.key]: v }))}
                          aria-label={spec.label}
                        />
                      )}
                    </div>

                    {spec.type === "number" && (
                      <div className="mt-3">
                        <Input
                          id={`cfg-${spec.key}`}
                          type="number"
                          value={String(raw ?? "")}
                          min={spec.min ?? undefined}
                          max={spec.max ?? undefined}
                          onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                          className="max-w-40"
                        />
                        {(spec.min !== null || spec.max !== null) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {spec.min !== null && spec.max !== null
                              ? `Entre ${spec.min} et ${spec.max}`
                              : spec.min !== null
                                ? `Minimum ${spec.min}`
                                : `Maximum ${spec.max}`}
                          </p>
                        )}
                      </div>
                    )}

                    {spec.type === "string" && (
                      <div className="mt-3">
                        {(spec.maxLength ?? 0) > 60 ? (
                          <Textarea
                            id={`cfg-${spec.key}`}
                            value={String(raw ?? "")}
                            maxLength={spec.maxLength ?? undefined}
                            onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                            rows={3}
                          />
                        ) : (
                          <Input
                            id={`cfg-${spec.key}`}
                            value={String(raw ?? "")}
                            maxLength={spec.maxLength ?? undefined}
                            onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                          />
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {String(raw ?? "").length}/{spec.maxLength ?? "∞"} caractères
                        </p>
                      </div>
                    )}

                    {spec.type === "list" && (
                      <div className="mt-3">
                        <Textarea
                          id={`cfg-${spec.key}`}
                          value={String(raw ?? "")}
                          onChange={(e) => setDraft((d) => ({ ...d, [spec.key]: e.target.value }))}
                          rows={Math.min(8, Math.max(3, textToList(String(raw ?? "")).length + 1))}
                          placeholder="Une entrée par ligne"
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {textToList(String(raw ?? "")).length}/{spec.maxItems ?? "∞"} entrées
                          {(spec.maxLength ?? 0) > 0 ? ` · ${spec.maxLength} caractères max par entrée` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
