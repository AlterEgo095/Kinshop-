// KinShop — Registre de configuration dynamique (SERVEUR UNIQUEMENT)
// ⚠️ Server-only : à importer uniquement dans les routes API et libs serveur.
//
// PRINCIPE (centre de contrôle dynamique) :
// - Chaque paramètre administrable est décrit par une ConfigSpec (clé, section,
//   type, bornes, visibilité publique, libellé…).
// - Le store est la table PlatformSetting (key/value) — AUCUNE migration DB
//   nécessaire pour ajouter un paramètre : ajouter une spec suffit.
// - La console ADMIN lit GET /api/admin/config (specs + valeurs) et écrit
//   PATCH /api/admin/config : chaque écriture est VALIDÉE contre sa spec et
//   JOURNALISÉE (ancien → nouveau) dans AdminAction.
// - L'enforcement est TOUJOURS côté serveur : feature flags et quotas sont
//   lus dans les routes API (les flags désactivés renvoient 403, les quotas
//   dépassés 402). Masquer l'UI ne constitue jamais une mesure de sécurité.
// - Cache mémoire TTL court + invalidation immédiate à chaque écriture
//   (mono-instance PM2 : suffisant, zéro middleware externe).

import { db } from "@/lib/db"
import { CONFIG_DEFAULTS, configDefault, type ConfigValue } from "@/lib/config-defaults"
import type { PaymentMethod } from "@/lib/kinshop"

/* ─────────── Specs ─────────── */

export type ConfigSpecType = "boolean" | "number" | "string" | "list"

export interface ConfigSpec {
  key: string
  section: string
  type: ConfigSpecType
  /** Défaut (doit correspondre à CONFIG_DEFAULTS) — source de vérité : config-defaults.ts */
  default: ConfigValue
  /** Exposé via /api/platform (public) ou réservé serveur/console admin */
  public: boolean
  label: string
  description?: string
  /** Bornes numériques */
  min?: number
  max?: number
  /** Longueur max d'une chaîne */
  maxLength?: number
  /** Nombre max d'éléments d'une liste */
  maxItems?: number
  /** Hook métier serveur exécuté après écriture (ex : cascade du taux FC). */
  onSet?: (oldValue: ConfigValue, newValue: ConfigValue) => Promise<string>
}

/** Ordre canonique des moyens de paiement (l'ordre d'affichage suit cette liste). */
const PAYMENT_ORDER: PaymentMethod[] = ["mpesa", "airtel", "orange", "cash"]

export const CONFIG_SPECS: ConfigSpec[] = [
  /* ─────────── Général ─────────── */
  {
    key: "general.platformName",
    section: "general",
    type: "string",
    default: "KinShop",
    public: true,
    maxLength: 24,
    label: "Nom de la plateforme",
    description: "Affiché dans la console admin et les écrans plateforme.",
  },
  {
    // Clé de stockage legacy "defaultRateFC" (identique à /api/admin/settings depuis la V3)
    key: "defaultRateFC",
    section: "general",
    type: "number",
    default: 2850,
    public: true,
    min: 100,
    max: 100_000,
    label: "Taux FC par 1 $ (défaut)",
    description:
      "Appliqué aux boutiques alignées sur le défaut (cascade immédiate). Les taux personnalisés des vendeurs sont préservés.",
    onSet: async (_old, nv) => {
      if (typeof nv !== "number") return ""
      // Cascade temps réel : les boutiques qui suivaient l'ancien taux par défaut
      // passent immédiatement au nouveau (les taux custom vendeurs ne bougent pas).
      const oldNum = Number(_old)
      const res = await db.store.updateMany({
        where: { rateFC: oldNum > 0 ? oldNum : -1 },
        data: { rateFC: nv },
      })
      return res.count > 0 ? `${res.count} boutique(s) synchronisée(s)` : ""
    },
  },
  {
    key: "general.supportWhatsapp",
    section: "general",
    type: "string",
    default: "",
    public: true,
    maxLength: 16,
    label: "WhatsApp support (optionnel)",
    description: "Numéro affiché en pied de page pour le support. Vide = masqué.",
  },

  /* ─────────── Fonctionnalités (feature flags) ─────────── */
  {
    key: "feature.reviews",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Avis clients",
    description: "Avis vérifiés sur les vitrines. Désactivé : la section disparaît et POST /api/reviews renvoie 403.",
  },
  {
    key: "feature.coupons",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Codes promo",
    description: "Création de codes promo par les vendeurs et validation au checkout.",
  },
  {
    key: "feature.deliveryZones",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Zones de livraison",
    description: "Zones de livraison tarifées configurées par les vendeurs.",
  },
  {
    key: "feature.invoices",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "KinFacture (factures)",
    description: "Factures professionnelles avec QR de paiement.",
  },
  {
    key: "feature.cvExpress",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "CV Express RDC",
    description: "Générateur de CV (outil gratuit annexe).",
  },
  {
    key: "feature.statusStudio",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Studio de statuts",
    description: "Générateur d'images de statut WhatsApp 9:16.",
  },
  {
    key: "feature.customDomains",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Domaines personnalisés",
    description: "Réservation de domaine propre par les boutiques Premium.",
  },
  {
    key: "feature.premiumProgram",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Programme Premium",
    description: "Checkout Premium (Chariow). Désactivé : les API premium renvoient 403.",
  },
  {
    key: "feature.demoStore",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Boutique de démonstration",
    description: "Bouton « Voir la démo » sur l'accueil.",
  },
  {
    key: "feature.orderAccounts",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Compte obligatoire pour commander (V10)",
    description:
      "Actif : toute commande exige un compte client authentifié (serveur). Désactivé : commandes invités legacy tolérées.",
  },
  {
    key: "feature.refunds",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Remboursements (V10)",
    description: "Demandes de remboursement client/vendeur, validation et exécution admin.",
  },
  {
    key: "feature.reports",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Signalements (V10)",
    description: "Signalement de boutiques, produits, commandes ou comportements — modération admin.",
  },
  {
    key: "feature.boost",
    section: "features",
    type: "boolean",
    default: true,
    public: true,
    label: "Promotion payante — Boost (V10)",
    description: "Campagnes de mise en avant sponsorisée sur l'accueil. Indépendant de Premium.",
  },

  /* ─────────── Plans & quotas ─────────── */
  ...planSpecs("free", "Plan Free", {
    maxProducts: [20, 1, 100_000],
    maxProductImages: [1, 1, 10],
    maxCoupons: [3, 0, 1_000],
    maxDeliveryZones: [5, 0, 1_000],
    maxInvoicesPerMonth: [15, 0, 100_000],
    statsDays: [7, 1, 365],
    maxStoreCategories: [10, 0, 500],
  }),
  ...planSpecs("premium", "Plan Premium", {
    maxProducts: [500, 1, 100_000],
    maxProductImages: [5, 1, 10],
    maxCoupons: [30, 0, 1_000],
    maxDeliveryZones: [25, 0, 1_000],
    maxInvoicesPerMonth: [500, 0, 100_000],
    statsDays: [60, 1, 730],
    maxStoreCategories: [60, 0, 1_000],
  }),
  {
    key: "plan.premium.priceUSD",
    section: "plans",
    type: "number",
    default: 3,
    public: true,
    min: 0,
    max: 10_000,
    label: "Prix Premium ($/mois)",
    description: "Prix affiché sur l'accueil et les écrans d'upsell.",
  },

  /* ─────────── Catalogue ─────────── */
  {
    key: "catalog.categories",
    section: "catalog",
    type: "list",
    default: CONFIG_DEFAULTS["catalog.categories"] as string[],
    public: true,
    maxItems: 30,
    maxLength: 40,
    label: "Catégories de produits",
    description: "Proposées à la création/édition des produits et au filtre vitrine. Une par ligne.",
  },
  {
    key: "catalog.cities",
    section: "catalog",
    type: "list",
    default: CONFIG_DEFAULTS["catalog.cities"] as string[],
    public: true,
    maxItems: 30,
    maxLength: 40,
    label: "Villes",
    description: "Villes proposées à la création de boutique. Une par ligne.",
  },
  {
    key: "catalog.storeEmojis",
    section: "catalog",
    type: "list",
    default: CONFIG_DEFAULTS["catalog.storeEmojis"] as string[],
    public: true,
    maxItems: 40,
    maxLength: 8,
    label: "Emojis de boutique",
    description: "Emojis proposés comme logo rapide à la création. Un par ligne.",
  },

  /* ─────────── Paiements ─────────── */
  ...PAYMENT_ORDER.flatMap((m) => [
    {
      key: `payment.${m}.enabled`,
      section: "payments",
      type: "boolean" as const,
      default: true,
      public: true,
      label: `${m.toUpperCase()} — actif`,
      description:
        m === "cash"
          ? "Paiement espèces à la livraison."
          : "Moyen de paiement mobile money proposé au checkout. Désactivé : refusé côté serveur à la commande.",
    },
    {
      key: `payment.${m}.label`,
      section: "payments",
      type: "string" as const,
      default: CONFIG_DEFAULTS[`payment.${m}.label`] as string,
      public: true,
      maxLength: 40,
      label: `${m.toUpperCase()} — libellé affiché`,
    },
  ]),

  /* ─────────── Règles métier ─────────── */
  {
    key: "business.maxStoresPerUser",
    section: "business",
    type: "number",
    default: 1,
    public: true,
    min: 1,
    max: 10,
    label: "Boutiques max par compte",
    description: "Nombre de boutiques qu'un même compte peut posséder (appliqué côté serveur).",
  },
  {
    key: "business.premiumGrantMaxDays",
    section: "business",
    type: "number",
    default: 365,
    public: false,
    min: 1,
    max: 3650,
    label: "Durée max d'un cadeau Premium (jours)",
    description: "Clamp appliqué à la console admin lors d'un octroi manuel de Premium.",
  },
  {
    key: "business.premiumMinDays",
    section: "business",
    type: "number",
    default: 1,
    public: false,
    min: 1,
    max: 365,
    label: "Durée min d'un cadeau Premium (jours)",
  },
  {
    key: "business.orderMaxQtyPerItem",
    section: "business",
    type: "number",
    default: 99,
    public: false,
    min: 1,
    max: 999,
    label: "Quantité max par article (commande)",
    description: "Clamp serveur de la quantité commandée pour chaque ligne de panier.",
  },
  {
    key: "business.maxOpenRefundsPerStore",
    section: "business",
    type: "number",
    default: 5,
    public: false,
    min: 1,
    max: 100,
    label: "Remboursements ouverts max par boutique",
    description: "Anti-abus : limite de demandes de remboursement simultanées (statut demandé/approuvé).",
  },

  /* ─────────── Promotion (Boost) ─────────── */
  {
    key: "boost.price7USD",
    section: "boost",
    type: "number",
    default: 2,
    public: true,
    min: 0,
    max: 10_000,
    label: "Prix campagne 7 jours ($)",
    description: "Coût d'une mise en avant de 7 jours sur la page d'accueil (sponsorisé).",
  },
  {
    key: "boost.price30USD",
    section: "boost",
    type: "number",
    default: 5,
    public: true,
    min: 0,
    max: 10_000,
    label: "Prix campagne 30 jours ($)",
    description: "Coût d'une mise en avant de 30 jours sur la page d'accueil (sponsorisé).",
  },
  {
    key: "boost.maxActivePerStore",
    section: "boost",
    type: "number",
    default: 1,
    public: false,
    min: 1,
    max: 10,
    label: "Campagnes actives max par boutique",
    description: "Appliqué côté serveur à la création d'une campagne.",
  },

  /* ─────────── Contenus ─────────── */
  {
    key: "content.maintenanceTitle",
    section: "content",
    type: "string",
    default: "KinShop en maintenance",
    public: true,
    maxLength: 80,
    label: "Titre de l'écran de maintenance",
  },
  {
    key: "content.maintenanceMessage",
    section: "content",
    type: "string",
    default: CONFIG_DEFAULTS["content.maintenanceMessage"] as string,
    public: true,
    maxLength: 300,
    label: "Message de maintenance",
  },
  {
    key: "content.footerTagline",
    section: "content",
    type: "string",
    default: "Propulsé par KinShop — créez votre boutique en 5 minutes 🇨🇩",
    public: true,
    maxLength: 120,
    label: "Tagline pied de page",
  },
  {
    key: "content.demoSlug",
    section: "content",
    type: "string",
    default: "maman-ngo",
    public: true,
    maxLength: 30,
    label: "Boutique de démonstration (slug)",
    description: "Boutique ouverte par le bouton « Voir la démo » de l'accueil.",
  },
]

/** Génère les specs des quotas d'un plan. */
function planSpecs(
  plan: "free" | "premium",
  prefix: string,
  limits: Record<string, [def: number, min: number, max: number]>,
): ConfigSpec[] {
  const labels: Record<string, string> = {
    maxProducts: "Produits max",
    maxProductImages: "Photos max par produit",
    maxCoupons: "Codes promo max",
    maxDeliveryZones: "Zones de livraison max",
    maxInvoicesPerMonth: "Factures max par mois",
    statsDays: "Historique statistiques (jours)",
    maxStoreCategories: "Catégories boutique max (V10)",
  }
  return Object.entries(limits).map(([name, [def, min, max]]) => ({
    key: `plan.${plan}.${name}`,
    section: "plans",
    type: "number" as const,
    default: def,
    public: true,
    min,
    max,
    label: `${prefix} — ${labels[name] ?? name}`,
  }))
}

/* ─────────── Lecture (SANS cache — V10) ───────────
   Anciennement : cache mémoire TTL 10 s avec invalidation à l'écriture.
   Problème découvert par les tests de non-régression : sous Turbopack/dev,
   les modules serveur sont dupliqués par route → l'invalidation croisée
   n'atteint pas toutes les instances (fenêtres de stalence). La table
   PlatformSetting est minuscule (SQLite, < 1 ms par lecture complète) :
   on lit TOUJOURS frais — la cohérence prime sur la micro-optimisation. */

export function invalidateConfigCache(): void {
  // Conservé pour compat d'appel (anciennement : purge du cache mémoire).
}

/** Raws bruts de la table PlatformSetting (toujours frais). */
async function getRawMap(): Promise<Map<string, string>> {
  const rows = await db.platformSetting.findMany()
  return new Map(rows.map((r) => [r.key, r.value]))
}

/* ─────────── Lecture ─────────── */

function parseValue(spec: ConfigSpec, stored: string | undefined): ConfigValue {
  if (stored === undefined || stored === null) return spec.default
  try {
    switch (spec.type) {
      case "boolean":
        return stored === "on"
      case "number": {
        const n = Number(stored)
        return Number.isFinite(n) ? n : spec.default
      }
      case "string":
        return stored
      case "list": {
        const parsed = JSON.parse(stored)
        return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : spec.default
      }
    }
  } catch {
    return spec.default
  }
}

/** Configuration complète (toutes clés, défauts fusionnés). */
export async function getConfig(): Promise<Record<string, ConfigValue>> {
  const raw = await getRawMap()
  const out: Record<string, ConfigValue> = {}
  for (const spec of CONFIG_SPECS) {
    out[spec.key] = parseValue(spec, raw.get(spec.key))
  }
  return out
}

/** Configuration publique (frontend) — uniquement les clés spec.public. */
export async function getPublicConfig(): Promise<Record<string, ConfigValue>> {
  const all = await getConfig()
  const out: Record<string, ConfigValue> = {}
  for (const spec of CONFIG_SPECS) {
    if (spec.public) out[spec.key] = all[spec.key]
  }
  return out
}

/** Valeur typée d'une clé (fallback défaut). */
export async function getConfigValue<T extends ConfigValue>(key: string): Promise<T> {
  const spec = CONFIG_SPECS.find((s) => s.key === key)
  const all = await getConfig()
  const v = all[key]
  if (v !== undefined) return v as T
  return (spec ? spec.default : configDefault(key)) as T
}

/** Feature flag : true sauf si explicitement désactivé. */
export async function isFeatureOn(name: string): Promise<boolean> {
  const v = await getConfigValue<boolean>(`feature.${name}`)
  return v !== false
}

/** Quotas effectifs d'un plan (fusibles : défauts min 1 pour éviter 0 produits). */
export interface PlanQuotaValues {
  maxProducts: number
  maxProductImages: number
  maxCoupons: number
  maxDeliveryZones: number
  maxInvoicesPerMonth: number
  statsDays: number
  maxStoreCategories: number
}

export async function getPlanQuotas(planId: "free" | "premium"): Promise<PlanQuotaValues> {
  const all = await getConfig()
  const num = (k: string, def: number) => {
    const v = all[k]
    const n = typeof v === "number" ? v : def
    return Number.isFinite(n) && n >= 0 ? n : def
  }
  return {
    maxProducts: Math.max(1, num(`plan.${planId}.maxProducts`, 20)),
    maxProductImages: Math.max(1, num(`plan.${planId}.maxProductImages`, 1)),
    maxCoupons: Math.max(0, num(`plan.${planId}.maxCoupons`, 3)),
    maxDeliveryZones: Math.max(0, num(`plan.${planId}.maxDeliveryZones`, 5)),
    maxInvoicesPerMonth: Math.max(0, num(`plan.${planId}.maxInvoicesPerMonth`, 15)),
    statsDays: Math.max(1, num(`plan.${planId}.statsDays`, 7)),
    maxStoreCategories: Math.max(0, num(`plan.${planId}.maxStoreCategories`, 10)),
  }
}

/** Moyens de paiement actifs, dans l'ordre canonique. */
export async function getEnabledPayments(): Promise<PaymentMethod[]> {
  const all = await getConfig()
  const out: PaymentMethod[] = []
  for (const m of PAYMENT_ORDER) {
    const v = all[`payment.${m}.enabled`]
    if (v !== false) out.push(m)
  }
  return out
}

/** Libellé affiché d'un moyen de paiement (fallback libellé par défaut). */
export function paymentLabelSync(all: Record<string, ConfigValue>, m: PaymentMethod): string {
  const v = all[`payment.${m}.label`]
  return typeof v === "string" && v.trim() ? v.trim() : String(CONFIG_DEFAULTS[`payment.${m}.label`])
}

/* ─────────── Écriture (validée + journalisable) ─────────── */

export class ConfigValidationError extends Error {}

/**
 * Valide et sérialise une valeur brute contre sa spec.
 * Lève ConfigValidationError si invalide (le frontend reçoit 400 avec le détail).
 */
export function validateConfigValue(spec: ConfigSpec, raw: unknown): ConfigValue {
  switch (spec.type) {
    case "boolean": {
      if (typeof raw === "boolean") return raw
      if (raw === "on") return true
      if (raw === "off") return false
      throw new ConfigValidationError(`${spec.key} : valeur booléenne attendue (true/false).`)
    }
    case "number": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw
      if (typeof n !== "number" || !Number.isFinite(n)) {
        throw new ConfigValidationError(`${spec.key} : nombre attendu.`)
      }
      if (spec.min !== undefined && n < spec.min) {
        throw new ConfigValidationError(`${spec.key} : minimum ${spec.min}.`)
      }
      if (spec.max !== undefined && n > spec.max) {
        throw new ConfigValidationError(`${spec.key} : maximum ${spec.max}.`)
      }
      return spec.min !== undefined && spec.min >= 1 ? Math.round(n) : n
    }
    case "string": {
      if (typeof raw !== "string") throw new ConfigValidationError(`${spec.key} : texte attendu.`)
      const v = raw.trim()
      if (spec.maxLength && v.length > spec.maxLength) {
        throw new ConfigValidationError(`${spec.key} : ${spec.maxLength} caractères maximum.`)
      }
      return v
    }
    case "list": {
      // Accepte un tableau JSON ou un texte multi-lignes (une entrée par ligne).
      let items: unknown[] = []
      if (Array.isArray(raw)) items = raw
      else if (typeof raw === "string") items = raw.split("\n")
      else throw new ConfigValidationError(`${spec.key} : liste attendue (une entrée par ligne).`)
      const clean: string[] = []
      for (const it of items) {
        if (typeof it !== "string") continue
        const v = it.trim()
        if (!v) continue
        if (spec.maxLength && v.length > spec.maxLength) {
          throw new ConfigValidationError(`${spec.key} : chaque entrée est limitée à ${spec.maxLength} caractères (« ${v.slice(0, 20)}… »).`)
        }
        if (!clean.includes(v)) clean.push(v)
        if (spec.maxItems && clean.length > spec.maxItems) {
          throw new ConfigValidationError(`${spec.key} : maximum ${spec.maxItems} entrées.`)
        }
      }
      if (spec.key === "catalog.categories" && !clean.includes("Divers")) {
        // « Divers » est la catégorie de repli de l'API produits — toujours présente.
        clean.push("Divers")
      }
      return clean
    }
  }
}

function serializeValue(spec: ConfigSpec, value: ConfigValue): string {
  switch (spec.type) {
    case "boolean":
      return value ? "on" : "off"
    case "number":
      return String(value)
    case "string":
      return String(value)
    case "list":
      return JSON.stringify(value)
  }
}

export interface ConfigWriteResult {
  key: string
  oldValue: ConfigValue
  newValue: ConfigValue
  hookDetail: string
}

/**
 * Écrit une liste de paramètres validés. Chaque clé est journalisée séparément
 * (ancien → nouveau) et les hooks métier (cascades) sont exécutés.
 * Invalide le cache AVANT les hooks pour que les cascades relisent des valeurs fraîches.
 */
export async function setConfigValues(
  values: Record<string, unknown>,
): Promise<{ applied: ConfigWriteResult[] }> {
  const all = await getConfig()
  const applied: ConfigWriteResult[] = []

  for (const [key, raw] of Object.entries(values)) {
    const spec = CONFIG_SPECS.find((s) => s.key === key)
    if (!spec) throw new ConfigValidationError(`Paramètre inconnu : ${key}`)
    const newValue = validateConfigValue(spec, raw)
    const oldValue = all[key]
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue // inchangé

    // Serialisation + upsert
    await db.platformSetting.upsert({
      where: { key },
      update: { value: serializeValue(spec, newValue) },
      create: { key, value: serializeValue(spec, newValue) },
    })

    let hookDetail = ""
    if (spec.onSet) {
      // Invalider le cache d'abord : les cascades doivent voir la nouvelle valeur.
      invalidateConfigCache()
      try {
        hookDetail = await spec.onSet(oldValue, newValue)
      } catch (e) {
        console.error(`config onSet hook ${key}`, e)
        hookDetail = "hook: erreur (voir logs serveur)"
      }
    }

    applied.push({ key, oldValue, newValue, hookDetail })
  }

  invalidateConfigCache()
  return { applied }
}

/** Description lisible d'une valeur pour le journal d'audit. */
export function describeConfigValue(spec: ConfigSpec, v: ConfigValue): string {
  if (spec.type === "boolean") return v ? "activé" : "désactivé"
  if (spec.type === "list") return `[${(v as string[]).join(", ")}]`
  if (spec.type === "string") return `"${v === "" ? "(vide)" : v}"`
  return String(v)
}
