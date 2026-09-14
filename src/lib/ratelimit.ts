// KinShop — Limitation de débit en mémoire (V8)
// Protection simple contre le spam d'inscriptions, le brute-force de mots de passe
// et les écritures massives. Mono-instance : suffisante pour le déploiement PM2 actuel.

import type { NextRequest } from "next/server"

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

/** Renvoie true si l'action est autorisée, false si la limite est atteinte. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()

  // Nettoyage opportuniste (évite une croissance mémoire infinie)
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k)
    }
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (bucket.count >= max) return false
  bucket.count += 1
  return true
}

/** IP cliente — ordre de confiance décroissant (C2 vague 1) :
 *  1. cf-connecting-ip : posé par Cloudflare, non falsifiable derrière CF ;
 *  2. x-real-ip : écrasé par nginx avec $remote_addr (real_ip plages CF) ;
 *  3. DERNIER élément de x-forwarded-for : ajouté par nginx (XFF écrasé côté nginx).
 *  Le premier élément de XFF n'est plus utilisé : il était falsifiable par l'appelant. */
export function clientIp(req: NextRequest): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  const real = req.headers.get("x-real-ip")?.trim()
  if (real) return real
  const xff = req.headers.get("x-forwarded-for")?.trim()
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    if (parts.length > 0) return parts[parts.length - 1]
  }
  return "local"
}
