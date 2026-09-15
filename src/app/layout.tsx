import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { LANG_COOKIE, langFromCookieValue, type Lang } from "@/lib/i18n";

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

// Vague 2 i18n : contenus SEO bilingues (fr par défaut, en via cookie kinshop_lang).
const COPY = {
  fr: {
    title: "KinShop — Ta boutique en ligne en 5 minutes",
    pitch: "Transforme ton statut WhatsApp en boutique pro. Gratuit, simple, pensé pour la RDC.",
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
    locale: "fr_CD",
    ogAlt: "KinShop — Ta boutique en ligne en 5 minutes",
  },
  en: {
    title: "KinShop — Your online shop in 5 minutes",
    pitch: "Turn your WhatsApp status into a pro shop. Free, simple, built for the DRC.",
    description:
      "KinShop turns your WhatsApp status into a real online shop. Build your catalog, receive orders and get paid with M-Pesa, Airtel Money or Orange Money. Designed for sellers in Kinshasa and across the DRC.",
    keywords: [
      "KinShop",
      "online shop DRC",
      "sell on WhatsApp Congo",
      "mobile money",
      "M-Pesa",
      "Airtel Money",
      "Orange Money",
      "e-commerce Kinshasa",
    ],
    locale: "en_US",
    ogAlt: "KinShop — Your online shop in 5 minutes",
  },
} as const;

async function getLang(): Promise<Lang> {
  const store = await cookies();
  return langFromCookieValue(store.get(LANG_COOKIE)?.value);
}

// SEO international : graph JSON-LD (WebSite + Organization) lu par les moteurs.
// knowsLanguage annonce le bilinguisme de la plateforme.
function buildJsonLd(lang: Lang) {
  const copy = COPY[lang];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: "KinShop",
        description: copy.pitch,
        inLanguage: lang,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "KinShop",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/icons/icon-192.png`,
        areaServed: ["CD"],
        knowsLanguage: ["fr", "en"],
      },
    ],
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const copy = COPY[lang];
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: `${copy.title} 🇨🇩`,
      template: "%s | KinShop",
    },
    description: copy.description,
    keywords: [...copy.keywords],
    authors: [{ name: "KinShop" }],
    manifest: "/manifest.webmanifest",
    applicationName: "KinShop",
    category: "ecommerce",
    alternates: {
      canonical: "/",
    },
    openGraph: {
      title: copy.title,
      description: copy.pitch,
      siteName: "KinShop",
      url: "/",
      type: "website",
      locale: copy.locale,
      // Vague 3 — partage social premium : visuel de marque 1200x630 (JPEG réel,
      // dérivé du hero) pour WhatsApp, Facebook, X et LinkedIn.
      images: [
        {
          url: "/og/og-cover.jpg",
          width: 1200,
          height: 630,
          alt: copy.ogAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: copy.title,
      description: copy.pitch,
      images: ["/og/og-cover.jpg"],
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
}

export const viewport: Viewport = {
  themeColor: "#059669",
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html lang={lang} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster position="top-center" richColors />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(buildJsonLd(lang)) }}
        />
      </body>
    </html>
  );
}
