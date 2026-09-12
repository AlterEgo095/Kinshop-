// KinShop Admin — Authentification PIN & helpers serveur (console d'administration)
// ⚠️ Server-only : à importer uniquement dans les routes API.

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getConfig, invalidateConfigCache } from "@/lib/config-registry"

export const DEFAULT_ADMIN_PIN = "243243"

export function getAdminPin(): string {
  const pin = process.env.ADMIN_PIN?.trim()
  return pin && pin.length >= 4 ? pin : DEFAULT_ADMIN_PIN
}

export function isUsingDefaultPin(): boolean {
  return getAdminPin() === DEFAULT_ADMIN_PIN
}

/** Vérifie l'en-tête x-admin-pin de la requête. */
export function isAdminRequest(req: NextRequest): boolean {
  const pin = (req.headers.get("x-admin-pin") || "").trim()
  return pin.length > 0 && pin === getAdminPin()
}

/** Réponse 401 standardisée. */
export function adminUnauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Accès refusé : PIN administrateur invalide ou expiré." },
    { status: 401 },
  )
}

/** Garde-fou : renvoie la réponse 401 si le PIN ne correspond pas, sinon null. */
export function guardAdmin(req: NextRequest): NextResponse | null {
  return isAdminRequest(req) ? null : adminUnauthorized()
}

/** Enregistre une action dans le journal d'audit (jamais bloquant). */
export async function logAdminAction(action: string, target: string, detail = "") {
  try {
    await db.adminAction.create({ data: { action, target, detail: detail.slice(0, 500) } })
  } catch (e) {
    console.error("logAdminAction", e)
  }
}

/* ─────────── Paramètres plateforme ─────────── */

export const SETTING_KEYS = {
  maintenance: "maintenance", // "on" | "off"
  announcement: "announcement", // texte libre (vide = aucune annonce)
  defaultRateFC: "defaultRateFC", // taux FC par USD par défaut
} as const

export interface PlatformSettings {
  maintenance: boolean
  announcement: string
  defaultRateFC: number
}

/**
 * Paramètres globaux — délègue au registre de configuration dynamique
 * (config-registry.ts) qui fusionne les valeurs DB avec les défauts validés.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  const all = await getConfig()
  const rate = all["defaultRateFC"] // clé legacy (même stockage que /api/admin/settings)
  const maintenance = await db.platformSetting.findUnique({ where: { key: SETTING_KEYS.maintenance } })
  const announcement = await db.platformSetting.findUnique({ where: { key: SETTING_KEYS.announcement } })
  return {
    maintenance: maintenance?.value === "on",
    announcement: announcement?.value ?? "",
    defaultRateFC: typeof rate === "number" && rate > 0 ? rate : 2850,
  }
}

/**
 * Écriture bas niveau d'un paramètre (legacy : /api/admin/settings).
 * Invalide le cache du registre pour que la lecture suivante soit fraîche.
 */
export async function setPlatformSetting(key: string, value: string): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  invalidateConfigCache()
}
