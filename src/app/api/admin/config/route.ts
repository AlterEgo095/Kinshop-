import { NextRequest, NextResponse } from "next/server"
import { guardAdmin, logAdminAction } from "@/lib/admin"
import {
  CONFIG_SPECS,
  ConfigValidationError,
  describeConfigValue,
  getConfig,
  setConfigValues,
} from "@/lib/config-registry"

// GET /api/admin/config — Centre de contrôle dynamique
// Renvoie les specs (méta-données des paramètres administrables) + les valeurs
// actuelles. La console ADMIN génère son UI à partir de cette réponse :
// ajouter un paramètre administrable = ajouter une spec côté serveur.
export async function GET(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const values = await getConfig()
    const specs = CONFIG_SPECS.map((s) => ({
      key: s.key,
      section: s.section,
      type: s.type,
      default: s.default,
      public: s.public,
      label: s.label,
      description: s.description ?? "",
      min: s.min ?? null,
      max: s.max ?? null,
      maxLength: s.maxLength ?? null,
      maxItems: s.maxItems ?? null,
    }))
    return NextResponse.json({ specs, values })
  } catch (e) {
    console.error("GET /api/admin/config", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}

// PATCH /api/admin/config — Modifier un ou plusieurs paramètres
// Body : { values: { "feature.reviews": false, "plan.free.maxProducts": 30 } }
// Chaque valeur est VALIDÉE contre sa spec (type, bornes, longueur) puis
// JOURNALISÉE (ancien → nouveau) dans le journal d'audit AdminAction.
export async function PATCH(req: NextRequest) {
  const denied = await guardAdmin(req)
  if (denied) return denied

  try {
    const body = await req.json()
    const values = body?.values
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return NextResponse.json({ error: "Corps attendu : { values: { clé: valeur } }." }, { status: 400 })
    }
    if (Object.keys(values).length === 0) {
      return NextResponse.json({ error: "Aucun paramètre fourni." }, { status: 400 })
    }

    let applied
    try {
      applied = (await setConfigValues(values)).applied
    } catch (e) {
      if (e instanceof ConfigValidationError) {
        return NextResponse.json({ error: e.message }, { status: 400 })
      }
      throw e
    }

    // Journal d'audit : une entrée par paramètre réellement modifié
    for (const change of applied) {
      const spec = CONFIG_SPECS.find((s) => s.key === change.key)
      const detail =
        `${describeConfigValue(spec!, change.oldValue)} → ${describeConfigValue(spec!, change.newValue)}` +
        (change.hookDetail ? ` (${change.hookDetail})` : "")
      await logAdminAction("config.update", change.key, detail)
    }

    const valuesOut = await getConfig()
    return NextResponse.json({ applied: applied.length, values: valuesOut })
  } catch (e) {
    console.error("PATCH /api/admin/config", e)
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 })
  }
}
