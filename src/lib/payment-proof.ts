// KinShop — Preuve photographique du paiement direct (Phase D)
// Normalisation serveur d'une capture de transfert Mobile Money envoyée en
// data URL par l'acheteur. Même pipeline éprouvé que les photos produit
// (POST /api/products/image) : validation stricte, décodage sharp réel
// (rejette les payloads déguisés), orientation EXIF, redimensionnement
// proportionnel 1280, ré-encodage JPEG mozjpeg avec dégradation de qualité
// (80 → 70 → 60) pour tenir sous le plafond de stockage.
//
// Sécurité : aucun fetch sortant (pas de SSRF), format revalidé par décodage
// sharp (pas seulement l'en-tête data URL), plafond strict de taille.

import sharp, { type Metadata } from "sharp"

const MAX_BASE64_CHARS = 1_500_000 // ~1,1 Mo décodés — la capture est compressée côté client avant envoi
const TARGET_MAX_B64 = 380_000 // plafond de stockage par preuve (pattern photos produit)
const QUALITY_LADDER = [80, 70, 60]
const SIZE_LIMIT = 1280

export class ProofImageError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/**
 * Valide et normalise une data URL d'image de preuve.
 * Renvoie une data URL JPEG canonique (data:image/jpeg;base64,…).
 * Lève ProofImageError (status 400/413) si l'image est invalide ou trop lourde.
 */
export async function normalizeProofImage(dataUrl: string): Promise<string> {
  const m = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!m) {
    throw new ProofImageError("Image invalide — fournis une capture encodée (JPEG, PNG ou WebP).", 400)
  }
  const base64 = m[2]
  if (base64.length > MAX_BASE64_CHARS) {
    throw new ProofImageError("Capture trop lourde — réduis-la ou choisis une image plus simple.", 413)
  }

  let input: Buffer
  try {
    input = Buffer.from(base64, "base64")
    if (input.length === 0) throw new Error("vide")
  } catch {
    throw new ProofImageError("Capture illisible.", 400)
  }

  // Validation réelle : sharp décode le flux (rejette les payloads déguisés)
  let meta: Metadata
  try {
    meta = await sharp(input, { failOn: "none" }).metadata()
  } catch {
    throw new ProofImageError("Fichier image corrompu ou non supporté.", 400)
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new ProofImageError("Format d'image non supporté (JPEG, PNG ou WebP).", 400)
  }
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (w < 8 || h < 8 || w > 8000 || h > 8000) {
    throw new ProofImageError("Dimensions d'image invalides (8×8 minimum, 8000×8000 maximum).", 400)
  }

  // Pipeline commun : orientation EXIF + resize proportionnel inside
  const pipeline = sharp(input, { failOn: "none" })
    .rotate() // auto-orient selon EXIF (les métadonnées sont supprimées ensuite)
    .resize({ width: SIZE_LIMIT, height: SIZE_LIMIT, fit: "inside", withoutEnlargement: true })

  for (const quality of QUALITY_LADDER) {
    const buf = await pipeline
      .clone()
      .jpeg({ quality, progressive: true, mozjpeg: true, force: true })
      .toBuffer()
    const b64 = buf.toString("base64")
    if (b64.length <= TARGET_MAX_B64) {
      return `data:image/jpeg;base64,${b64}`
    }
  }
  throw new ProofImageError("Capture trop lourde même après compression — essaie une image plus simple.", 413)
}
