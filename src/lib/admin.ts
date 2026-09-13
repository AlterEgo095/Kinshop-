// KinShop Admin — Authentification EMAIL + MOT DE PASSE (console d'administration)
// ⚠️ Server-only : à importer uniquement dans les routes API.
//
// Fini le code PIN : l'administrateur se connecte avec une adresse email et un
// mot de passe fort. Le compte vit dans la table User (role = "admin") et
// réutilise EXACTEMENT le système d'authentification éprouvé de src/lib/auth.ts :
//   - mot de passe hashé scrypt (format s1$salt$hash, jamais en clair)
//   - session opaque : cookie HttpOnly contenant un jeton aléatoire,
//     la base ne stockant que son SHA-256
//   - compte SUSPENDU → traité comme non authentifié (fail-closed, F5-3)
//
// Migration des anciennes défenses (audit Task 19 conservées) :
//   - F-05 : anti brute-force — 5 échecs / 15 min / IP → 429 (login + routes admin)

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getConfig, invalidateConfigCache } from "@/lib/config-registry"
import { getUserFromRequest, type AuthUser } from "@/lib/auth"
import { rateLimit, clientIp } from "@/lib/ratelimit"

/* ─────────── Identité administrateur ─────────── */

/**
 * Renvoie l'utilisateur authentifié UNIQUEMENT s'il possède le rôle admin.
 * La vérification du statut (suspension, expiration de session) est déjà
 * assurée par getUserFromRequest (fail-closed).
 */
export async function getAdminUser(req: NextRequest): Promise<AuthUser | null> {
  const user = await getUserFromRequest(req)
  if (user && user.role === "admin") return user
  return null
}

/**
 * Test informatif « requête émise par un admin ? » — SANS effet de bord ni
 * comptage (utilisé dans les routes mixtes admin/utilisateur : factures,
 * événements de commande, remboursements, simulation de paiement). Ne JAMAIS
 * y compter un échec : des utilisateurs légitimes déclencheraient le rate-limit.
 */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  return (await getAdminUser(req)) !== null
}

/* ─────────── Garde-fou des routes /api/admin/* ─────────── */

/** Réponse 401 standardisée. */
export function adminUnauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Accès refusé : connexion administrateur requise." },
    { status: 401 },
  )
}

/** Réponse 429 standardisée (limite de tentatives atteinte). */
export function adminRateLimitedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Trop de tentatives. Réessaie dans 15 minutes." },
    { status: 429 },
  )
}

/**
 * Enregistre une tentative d'accès admin ÉCHOUÉE. Renvoie false si la limite
 * est atteinte (→ répondre 429). À n'utiliser QUE sur les routes réservées
 * /api/admin/* — chaque requête non-admin y est suspecte par définition.
 */
export function noteAdminFailure(req: NextRequest): boolean {
  return rateLimit(`admin-access:${clientIp(req)}`, ADMIN_MAX_ATTEMPTS, ADMIN_WINDOW_MS)
}

const ADMIN_MAX_ATTEMPTS = 5
const ADMIN_WINDOW_MS = 15 * 60 * 1000

/**
 * Garde-fou : renvoie la réponse 401 si la session n'est pas admin, sinon null.
 * F-05 (audit Task 19, conservé) : chaque accès refusé est comptabilisé par IP
 * — 5 échecs en 15 minutes → 429. Couvre TOUTES les routes /api/admin/*.
 */
export async function guardAdmin(req: NextRequest): Promise<NextResponse | null> {
  if (await isAdminRequest(req)) return null
  // F-05 : anti brute-force des routes admin (échec = IP suspecte)
  if (!noteAdminFailure(req)) return adminRateLimitedResponse()
  return adminUnauthorized()
}

/**
 * Enregistre une action admin dans le journal d'audit (jamais bloquant).
 * P5 (F5-4) : délègue à logAudit pour entrer dans la CHAÎNE D'INTÉGRITÉ
 * (chaque entrée scelle la précédente — altération détectable).
 */
export async function logAdminAction(action: string, target: string, detail = "") {
  const { logAudit } = await import("@/lib/audit")
  await logAudit({ action, target, detail, actorType: "admin" })
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
