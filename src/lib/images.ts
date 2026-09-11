// KinShop — Utilitaires images côté client (compression avant stockage en base)
// Les photos sont compressées en data URL JPEG (quota SQLite + réseau 3G RDC).

export interface CompressOptions {
  /** Côté max (largeur ou hauteur) en px. Défaut : 900 */
  maxSize?: number
  /** Qualité JPEG 0–1. Défaut : 0.72 */
  quality?: number
}

function loadBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Image illisible"))
    }
    img.src = url
  })
}

/**
 * Compresse un fichier image en data URL JPEG :
 * redimensionnée pour tenir dans maxSize × maxSize (proportions gardées).
 * Lève une erreur si le fichier n'est pas une image.
 */
export async function compressImageFile(file: File, opts?: CompressOptions): Promise<string> {
  const maxSize = opts?.maxSize ?? 900
  const quality = opts?.quality ?? 0.72

  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier choisi n'est pas une image.")
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("Image trop lourde (15 Mo max).")
  }

  const img = await loadBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Compression impossible sur cet appareil.")
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL("image/jpeg", quality)
}

/** Taille approximative d'une data URL en octets. */
export function dataUrlSize(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] || ""
  return Math.round((base64.length * 3) / 4)
}
