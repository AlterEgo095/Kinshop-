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

/** IP cliente (derrière nginx : premier élément de x-forwarded-for). */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "local"
  )
}
