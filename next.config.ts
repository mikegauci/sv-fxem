import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Keep the WordPress URL style (/about-us/, /ar/about-us/) for SEO parity.
  trailingSlash: true,
  images: {
    remotePatterns: [
      new URL(
        "https://ugzcbnjgftthksxeglqc.supabase.co/storage/v1/object/public/**",
      ),
    ],
  },
  // Theme CSS is read from disk at request time (SEO heading styles).
  outputFileTracingIncludes: {
    "/**": ["./public/assets/*.css"],
  },
  // Safety cap for admin uploads through Server Actions.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
