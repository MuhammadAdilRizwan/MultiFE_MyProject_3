import type { NextConfig } from "next";
import { securityHeaders } from "./lib/security-headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  transpilePackages: ["@multife/backend"],
  // Hide the floating Next.js "N" dev-tools button (it only ever shows in `npm run dev`).
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders({ supabaseUrl, isDev: process.env.NODE_ENV !== "production", sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN }),
      },
    ];
  },
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
