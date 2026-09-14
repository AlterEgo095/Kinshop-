import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // E3 vague 1 : les erreurs de typage redeviennent bloquantes à la construction
  // (les 2 erreurs résiduelles vivaient dans examples/, exclu du tsconfig).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  // Premium : ne pas divulguer la pile technique via en-tête x-powered-by.
  poweredByHeader: false,
};

export default nextConfig;
