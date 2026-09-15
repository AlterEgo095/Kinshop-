import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // E3 vague 1 : les erreurs de typage redeviennent bloquantes à la construction.
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Premium : ne pas divulguer la pile technique via en-tête x-powered-by.
  poweredByHeader: false,
  // Vague 2 performance : formats d'images modernes via l'optimiseur Next
  // (nécessite next >= 16.3.3 : RCE AVIF GHSA-2xp9-vwfh-vxw4 corrigée).
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
