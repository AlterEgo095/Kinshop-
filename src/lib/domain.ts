// V7 — Domaines personnalisés : constantes plateforme + vérification DNS-over-HTTPS
// La plateforme KinShop est servie sur PLATFORM_DOMAIN ; chaque boutique Premium
// peut revendiquer son propre domaine (ex. maboutique.cd) vérifié par enregistrement TXT.

export const PLATFORM_DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "kinshop.aenews.digital"
// IPv4 du serveur de production où pointent les enregistrements A des domaines vendeurs
export const PLATFORM_IPV4 = process.env.PLATFORM_IPV4 || "95.111.226.63"

// Préfixe du sous-domaine de vérification : _kinshop-verify.<domaine> TXT kinshop-verify=<token>
export const VERIFY_PREFIX = "_kinshop-verify"
export const VERIFY_TAG = "kinshop-verify"

export interface DohAnswer {
  type: number // 1 = A, 16 = TXT
  data: string
}

/**
 * Normalise une saisie de domaine : minuscules, sans protocole/port/chemin/point final.
 * Retourne null si invalide (format RFC simplifié, longueur ≤ 253).
 */
export function normalizeDomain(raw: string): string | null {
  const d = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
  if (!d || d.length > 253) return null
  const label = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
  const parts = d.split(".")
  if (parts.length < 2) return null
  if (!parts.every((p) => label.test(p))) return null
  const tld = parts[parts.length - 1]
  if (!/^[a-z]{2,}$/.test(tld)) return null // TLD alphabétique (pas d'IP ni de domaine interne)
  return d
}

/** Le domaine est-il réservé à la plateforme (domaine principal ou sous-domaine) ? */
export function isPlatformDomain(domain: string): boolean {
  return domain === PLATFORM_DOMAIN || domain.endsWith(`.${PLATFORM_DOMAIN}`)
}

/** Requête DNS-over-HTTPS (Cloudflare, repli Google). Retourne null si les deux échouent. */
export async function dohQuery(name: string, type: "A" | "TXT"): Promise<DohAnswer[] | null> {
  const endpoints = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
  ]
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: { accept: "application/dns-json" },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) continue
      const json = (await res.json()) as { Answer?: DohAnswer[]; Status?: number }
      // Status 3 = NXDOMAIN (domaine inexistant) → réponse valide, aucune réponse DNS
      if (json.Status === 3) return []
      if (Array.isArray(json.Answer)) return json.Answer
      return []
    } catch {
      continue // essai du fournisseur suivant
    }
  }
  return null
}

/** La propriété du domaine est-elle prouvée (TXT _kinshop-verify.<domaine> = kinshop-verify=<token>) ? */
export async function verifyDomainOwnership(domain: string, token: string): Promise<boolean> {
  const answers = await dohQuery(`${VERIFY_PREFIX}.${domain}`, "TXT")
  if (!answers) return false // DNS indisponible : ne jamais valider par défaut
  const expected = `${VERIFY_TAG}=${token}`
  return answers.some((a) => {
    if (a.type !== 16) return false
    const data = String(a.data).replace(/^"|"$/g, "").replace(/^"|"$/g, "").trim()
    return data === expected
  })
}

/** Le domaine pointe-t-il vers le serveur de la plateforme ? (conseil, non bloquant) */
export async function checkDomainRouting(domain: string): Promise<{ ok: boolean; addresses: string[] }> {
  const answers = await dohQuery(domain, "A")
  const addresses = answers ? answers.filter((a) => a.type === 1).map((a) => String(a.data)) : []
  return { ok: addresses.includes(PLATFORM_IPV4), addresses }
}
