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

export const metadata: Metadata = {
  title: "KinShop — Ta boutique en ligne en 5 minutes 🇨🇩",
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
  openGraph: {
    title: "KinShop — Ta boutique en ligne en 5 minutes",
    description:
      "Transforme ton statut WhatsApp en boutique pro. Gratuit, simple, pensé pour la RDC.",
    siteName: "KinShop",
    type: "website",
    locale: "fr_CD",
  },
};

export const viewport: Viewport = {
  themeColor: "#059669",
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
      </body>
    </html>
  );
}
