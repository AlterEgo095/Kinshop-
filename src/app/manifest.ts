import type { MetadataRoute } from "next"

// PWA V4 — Manifest KinShop (installable, mode standalone)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KinShop — Ta boutique en ligne en 5 minutes",
    short_name: "KinShop",
    description:
      "Transforme ton statut WhatsApp en boutique en ligne. Catalogue, commandes et paiement M-Pesa, Airtel Money, Orange Money. Conçu pour la RDC.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#059669",
    lang: "fr",
    categories: ["shopping", "business"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-180.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  }
}
