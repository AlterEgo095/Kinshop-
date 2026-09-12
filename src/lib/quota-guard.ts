// KinShop — Anti-TOCTOU des quotas (P1/F-07, audit abonnement)
//
// Problème : les routes à quota faisaient « count() puis create() » en deux
// opérations indépendantes. Deux requêtes concurrentes pouvaient passer la
// même vérification et créer chacune leur ressource → dépassement du quota
// du plan (race TOCTOU — détectée par l'audit, non exploitée en pratique).
//
// Correctif à deux verrous :
//   1. Mutex asynchrone EN PROCESSUS, par boutique — sérialise les sections
//     critiques (déploiement actuel = un seul process Node via PM2) ;
//   2. Transaction Prisma INTERACTIVE — le count et le create deviennent une
//     seule unité atomique côté base (défense si un jour multi-processus).
// Toute contention finit fail-closed : jamais de création au-delà du quota.

import { db } from "@/lib/db"
import type { Prisma } from "@prisma/client"

type TxClient = Prisma.TransactionClient

const locks = new Map<string, Promise<unknown>>()

/** Sérialise les appels concurrents partageant la même clé (mutex en processus). */
export function withQuotaLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve()
  // `fn` s'exécute à la fin de la chaîne, quel que soit le résultat du précédent.
  const run = prev.then(fn, fn)
  // La queue stockée ne rejette jamais (la chaîne survit aux erreurs des appelants).
  const tail = run.catch(() => undefined)
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return run
}

/**
 * Exécute la section critique « vérification de quota + création » d'une
 * boutique de façon atomique : mutex par boutique + transaction Prisma.
 *
 * La callback reçoit le client de transaction `tx` et DOIT faire le count et
 * le create via `tx` (jamais via `db`) pour bénéficier de l'atomicité. Si la
 * callback lève (ex. violation d'unicité), la transaction est annulée et
 * l'erreur est propageée à l'appelant (rien n'est créé).
 */
export function withStoreQuotaWrite<T>(
  storeId: string,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return withQuotaLock(`quota:store:${storeId}`, () => db.$transaction(fn))
}
