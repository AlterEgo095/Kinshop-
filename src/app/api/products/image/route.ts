import { NextRequest, NextResponse } from "next/server"
import sharp, { type Metadata } from "sharp"
import { requireStoreOwner } from "@/lib/auth"
import { rateLimit } from "@/lib/ratelimit"

// Mission Premium — POST /api/products/image
// Optimisation serveur d'une image produit (data URL) via sharp :
//   - orientation automatique (EXIF) → jamais de photo « couchée » ;
//   - redimensionnement proportionnel max 1280×1280 (sans agrandissement) —
//     les emplacements de la boutique (carte carrée, fiche, miniatures)
//     recadrent visuellement via object-cover, la source reste nette ;
//   - ré-encodage JPEG progressif mozjpeg (qualité uniforme, poids maîtrisé) ;
//   - dégradation automatique de qualité si la data URL dépasse le plafond
//     de stockage (80 → 70 → 60) au lieu d'échouer brutalement ;
//   - métadonnées/EXIF/nettété de chaîne supprimées (rendu professionnel).
// Sécurité : session propriétaire OBLIGATOIRE (storeId validé côté serveur),
// rate limit par utilisateur, aucun fetch sortant (pas de SSRF), format
// revalidé par décodage sharp réel (pas seulement l'en-tête data URL).

const MAX_BASE64_CHARS = 8_000_000 // ~6 Mo décodés — au-delà : refus immédiat
const TARGET_MAX_B64 = 380_000 // plafond de stockage par photo (cohérent normalizeImages)
const QUALITY_LADDER = [80, 70, 60]
const SIZE_LIMIT = 1280

interface OptimResult {
  dataUrl: string
  width: number
  height: number
  bytes: number
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 })
    }

    const storeId = String((body as Record<string, unknown>).storeId || "")
    const dataUrl = String((body as Record<string, unknown>).dataUrl || "")
    if (!storeId) return NextResponse.json({ error: "storeId requis." }, { status: 400 })

    const guard = await requireStoreOwner(req, { id: storeId })
    if (!guard.ok) return guard.response
    const { user } = guard

    // Anti-abus : 40 optimisations / 5 min / utilisateur (montée en masse bloquée,
    // usage normal largement couvert : 5 photos × quelques produits)
    if (!rateLimit(`img-opt:${user.id}`, 40, 5 * 60 * 1000)) {
      return NextResponse.json({ error: "Trop de requêtes — réessaie dans quelques minutes." }, { status: 429 })
    }

    const m = dataUrl.match(/^data:image\/(png|jpe?g|webp|gif|avif|bmp|tiff?);base64,([A-Za-z0-9+/=]+)$/)
    if (!m) {
      return NextResponse.json(
        { error: "Image invalide — fournis une photo encodée (PNG, JPEG, WebP…)." },
        { status: 400 },
      )
    }
    const base64 = m[2]
    if (base64.length > MAX_BASE64_CHARS) {
      return NextResponse.json({ error: "Image trop lourde (15 Mo max côté appareil)." }, { status: 413 })
    }

    let input: Buffer
    try {
      input = Buffer.from(base64, "base64")
      if (input.length === 0) throw new Error("vide")
    } catch {
      return NextResponse.json({ error: "Image illisible." }, { status: 400 })
    }

    // Validation réelle : sharp décode le flux (rejette payloads déguisés)
    let meta: Metadata
    try {
      meta = await sharp(input, { failOn: "none" }).metadata()
    } catch {
      return NextResponse.json({ error: "Fichier image corrompu ou non supporté." }, { status: 400 })
    }
    if (!meta.format || !["jpeg", "png", "webp", "gif", "avif", "tiff"].includes(meta.format)) {
      return NextResponse.json({ error: "Format d'image non supporté." }, { status: 400 })
    }
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w < 8 || h < 8 || w > 8000 || h > 8000) {
      return NextResponse.json(
        { error: "Dimensions d'image invalides (8×8 minimum, 8000×8000 maximum)." },
        { status: 400 },
      )
    }

    // Pipeline commun : orientation EXIF + resize proportionnel inside
    const pipeline = sharp(input, { failOn: "none" })
      .rotate() // auto-orient selon EXIF (strip les métadonnées ensuite)
      .resize({ width: SIZE_LIMIT, height: SIZE_LIMIT, fit: "inside", withoutEnlargement: true })

    let result: OptimResult | null = null
    for (const quality of QUALITY_LADDER) {
      const buf = await pipeline
        .clone()
        .jpeg({ quality, progressive: true, mozjpeg: true, force: true })
        .toBuffer()
      const b64 = buf.toString("base64")
      // Marge pour le préfixe data URL (le plafond de stockage total reste 400k chars)
      if (b64.length <= TARGET_MAX_B64) {
        const outMeta = await sharp(buf).metadata()
        result = {
          dataUrl: `data:image/jpeg;base64,${b64}`,
          width: outMeta.width ?? 0,
          height: outMeta.height ?? 0,
          bytes: buf.length,
        }
        break
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: "Photo trop lourde même après compression — essaie une image plus simple." },
        { status: 413 },
      )
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error("POST /api/products/image", e)
    return NextResponse.json({ error: "Optimisation d'image impossible pour le moment." }, { status: 500 })
  }
}
// GET /api/products/image → 405 automatique (méthode non exportée)
