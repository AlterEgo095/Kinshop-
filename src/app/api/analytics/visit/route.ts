import { createHash } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit, clientIp } from "@/lib/ratelimit"
import { getUserFromRequest } from "@/lib/auth"

// POST /api/analytics/visit — Comptabilise une visite de boutique (V2 stats)
//
// Durcissements P7 (audit analytics) :
//  F7-1 — rate limit par IP (60 visites / 5 min) : la route était spammable,
//         chaque POST avec (ip|ua) différent créait +1 vue ET +1 visiteur
//         unique → classement « populaires » et stats vendeur falsifiables.
//  F7-2 — auto-visites exclues : si la session appartient au PROPRIÉTAIRE de
//         la boutique, la visite n'est pas comptée (honnêteté des stats).
//  F7-4 — rétention VisitDedup : purge opportuniste (~2 % des appels) des
//         clés de plus de 40 jours (le jour est dans le hash → jamais
//         re-matchées ; la table ne croît plus à l'infini).
//  F7-5 — incrément atomique : updateMany d'abord (renvoie le nombre de
//         lignes modifiées), create en repli avec reprise sur course —
//         plus aucune visite perdue silencieusement sur course de 1re visite.
//
// Dédup visiteur unique : hash(slug|ip|ua|jour), respectueux (aucune adresse
// IP stockée en clair, aucune donnée personnelle).
const VISIT_RATE_MAX = 60
const VISIT_RATE_WINDOW_MS = 5 * 60 * 1000
const DEDUP_RETENTION_DAYS = 40

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const slug = String(body?.slug || "")
    if (!slug) return NextResponse.json({ error: "slug requis." }, { status: 400 })

    const store = await db.store.findUnique({
      where: { slug },
      select: { id: true, status: true, ownerId: true },
    })
    if (!store || store.status !== "active") {
      // Pas d'erreur côté client : une visite d'une boutique suspendue ne compte simplement pas
      return NextResponse.json({ ok: true, counted: false })
    }

    // F7-2 — le propriétaire ne gonfle pas les stats de sa propre boutique
    const viewer = await getUserFromRequest(req)
    if (viewer && store.ownerId && viewer.id === store.ownerId) {
      return NextResponse.json({ ok: true, counted: false })
    }

    const ip = clientIp(req)
    // F7-1 — anti-spam : 60 visites / 5 min / IP (navigation réelle : quelques
    // visites par jour ; au-delà = bot). Réponse 429 explicite.
    if (!rateLimit(`visit:${ip}`, VISIT_RATE_MAX, VISIT_RATE_WINDOW_MS)) {
      return NextResponse.json({ ok: true, counted: false }, { status: 429 })
    }

    const day = new Date()
    day.setUTCHours(0, 0, 0, 0)

    // F7-4 — purge opportuniste de la table de dédup (~2 % des appels)
    if (Math.random() < 0.02) {
      void db.visitDedup
        .deleteMany({
          where: {
            createdAt: { lt: new Date(Date.now() - DEDUP_RETENTION_DAYS * 24 * 60 * 60 * 1000) },
          },
        })
        .catch(() => {})
    }

    // Déduplication visiteur unique
    const ua = (req.headers.get("user-agent") || "").slice(0, 120)
    const dedupKey = createHash("sha256").update(`${slug}|${ip}|${ua}|${day.toISOString().slice(0, 10)}`).digest("hex")
    let isNewVisitor = false
    try {
      await db.visitDedup.create({ data: { key: dedupKey } })
      isNewVisitor = true
    } catch {
      isNewVisitor = false // clé déjà présente : visiteur récurrent
    }

    // F7-5 — incrément atomique : updateMany d'abord, create en repli.
    const updated = await db.storeVisit.updateMany({
      where: { storeId: store.id, day },
      data: { count: { increment: 1 }, ...(isNewVisitor ? { unique: { increment: 1 } } : {}) },
    })
    if (updated.count === 0) {
      try {
        await db.storeVisit.create({
          data: { storeId: store.id, day, count: 1, unique: isNewVisitor ? 1 : 0 },
        })
      } catch {
        // course sur la 1re visite du jour : la ligne existe désormais → ré-incrément
        await db.storeVisit
          .updateMany({
            where: { storeId: store.id, day },
            data: { count: { increment: 1 }, ...(isNewVisitor ? { unique: { increment: 1 } } : {}) },
          })
          .catch(() => {})
      }
    }

    return NextResponse.json({ ok: true, counted: true })
  } catch (e) {
    console.error("POST /api/analytics/visit", e)
    return NextResponse.json({ ok: true, counted: false })
  }
}
