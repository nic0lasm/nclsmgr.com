import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Les pages Markdown sont lues à la requête : on les embarque dans le serveur autonome.
  outputFileTracingIncludes: {
    "/[lang]/**": ["./src/content/*/pages/*.md"],
  },
};

export default nextConfig;
