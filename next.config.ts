import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Next.js adds 308 trailing-slash redirects by default which can interfere
  // with some API routes that match query strings — disable that behavior.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
