// KinShop — Authentification serveur (V8)
// ⚠️ Server-only : à importer UNIQUEMENT dans les routes API.
//
// Principe : le serveur est l'autorité finale. Le frontend ne masque que l'UI ;
// toute écriture sur une boutique exige une session valide + la propriété de la
// ressource (anti-IDOR). Les sessions sont opaques : cookie HttpOnly ne contenant
// qu'un jeton aléatoire, la base ne stocke que son SHA-256.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { Store } from "@prisma/client"

/* ─────────── Mots de passe (scrypt, format s1$salt$hash) ─────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = scryptSync(password, salt, 64).toString("hex")
  return `s1$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [version, salt, hash] = stored.split("$")
    if (version !== "s1" || !salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, "hex")
    return candidate.length === expected.length && timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/* ─────────── Sessions opaques ─────────── */

export const SESSION_COOKIE = "kinshop_session"
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 jours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashToken(token) } }).catch(() => {})
}

/* ─────────── Utilisateur courant ─────────── */

export interface AuthUser {
  id: string
  email: string
  name: string
  whatsapp: string
  role: string
}

/** Récupère l'utilisateur authentifié via le cookie de session (null si visiteur). */
export async function getUserFromRequest(req: NextRequest): Promise<AuthUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null

  // Session expirée : nettoyage immédiat
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    whatsapp: session.user.whatsapp,
    role: session.user.role,
  }
}

/* ─────────── Cookies ─────────── */

export function setSessionCookie(res: NextResponse, token: string, expiresAt: Date): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  })
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
}

/* ─────────── Réponses d'erreur standardisées ─────────── */

export function unauthorized(detail = "Connexion requise : crée un compte ou connecte-toi."): NextResponse {
  return NextResponse.json({ error: detail }, { status: 401 })
}

export function forbidden(detail = "Cette boutique ne t'appartient pas."): NextResponse {
  return NextResponse.json({ error: detail }, { status: 403 })
}

export function notFound(detail = "Ressource introuvable."): NextResponse {
  return NextResponse.json({ error: detail }, { status: 404 })
}

export function quotaExceeded(detail: string): NextResponse {
  // 402 = limite du plan atteinte → passer Premium (cohérent avec le garde domaine V7)
  return NextResponse.json({ error: detail, quota: true }, { status: 402 })
}

export function conflict(detail: string): NextResponse {
  // 409 = l'état actuel de la ressource interdit l'opération (intégrité documentaire)
  return NextResponse.json({ error: detail }, { status: 409 })
}

/* ─────────── Garde-fous boutique (anti-IDOR) ─────────── */

export type OwnerGuard =
  | { ok: true; user: AuthUser; store: Store }
  | { ok: false; response: NextResponse }

/**
 * Authentifie l'utilisateur ET vérifie qu'il possède bien la boutique ciblée.
 * L'identifiant vient du serveur (slug ou id), jamais d'un champ arbitraire du client.
 * Les boutiques orphelines (ownerId null, créées avant les comptes) ne sont éditables
 * par personne côté vendeur : lecture publique seule.
 *
 * F-04 (audit Task 19) : une boutique SUSPENDUE par l'administration n'accepte
 * AUCUNE opération propriétaire (lecture dashboard incluse) — 403 explicite,
 * sauf opt-in allowSuspended pour un besoin futur documenté.
 */
export async function requireStoreOwner(
  req: NextRequest,
  identifier: { slug?: string | null; id?: string | null },
  opts?: { allowSuspended?: boolean },
): Promise<OwnerGuard> {
  const user = await getUserFromRequest(req)
  if (!user) return { ok: false, response: unauthorized() }

  const store = identifier.slug
    ? await db.store.findUnique({ where: { slug: identifier.slug } })
    : identifier.id
      ? await db.store.findUnique({ where: { id: identifier.id } })
      : null

  if (!store) return { ok: false, response: notFound("Boutique introuvable.") }

  if (!store.ownerId || store.ownerId !== user.id) {
    return { ok: false, response: forbidden() }
  }

  if (store.status === "suspended" && !opts?.allowSuspended) {
    return {
      ok: false,
      response: forbidden(
        "Boutique suspendue par l'administration : contacte le support KinShop.",
      ),
    }
  }

  return { ok: true, user, store }
}
