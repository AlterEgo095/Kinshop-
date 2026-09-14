import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_PLATFORM_DOMAIN}`
  : process.env.APP_URL || "https://kinshop.aenews.digital";

const SITE_TITLE = "KinShop — Ta boutique en ligne en 5 minutes";
const SITE_PITCH =
  "Transforme ton statut WhatsApp en boutique pro. Gratuit, simple, pensé pour la RDC.";

// SEO international : graph JSON-LD (WebSite + Organization) lu par les moteurs.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "KinShop",
      description: SITE_PITCH,
      inLanguage: "fr",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "KinShop",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icons/icon-192.png`,
      areaServed: ["CD"],
      knowsLanguage: ["fr"],
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_TITLE} 🇨🇩`,
    template: "%s | KinShop",
  },
  description:
    "KinShop transforme ton statut WhatsApp en vraie boutique en ligne. Crée ton catalogue, reçois tes commandes et encaisse par M-Pesa, Airtel Money ou Orange Money. Conçu pour les vendeurs de Kinshasa et de toute la RDC.",
  keywords: [
    "KinShop",
    "boutique en ligne RDC",
    "vendre WhatsApp Congo",
    "mobile money",
    "M-Pesa",
    "Airtel Money",
    "Orange Money",
    "e-commerce Kinshasa",
  ],
  authors: [{ name: "KinShop" }],
  manifest: "/manifest.webmanifest",
  applicationName: "KinShop",
  category: "ecommerce",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_PITCH,
    siteName: "KinShop",
    url: "/",
    type: "website",
    locale: "fr_CD",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_PITCH,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "KinShop",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-center" richColors />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
