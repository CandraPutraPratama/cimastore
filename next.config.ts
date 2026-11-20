import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents sengaja tidak diaktifkan: belum didukung penuh oleh
  // @opennextjs/cloudflare (lihat opennextjs-cloudflare PR #1318).
  poweredByHeader: false,
  // Halaman pesanan & checkout membawa token rahasia di URL: jangan disimpan cache,
  // jangan diindeks, dan jangan bocorkan URL ke situs lain lewat Referer.
  async headers() {
    const privatePage = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];
    return [
      { source: "/pesanan/:path*", headers: privatePage },
      { source: "/:brand/:outlet/checkout", headers: privatePage },
      { source: "/admin/:path*", headers: privatePage },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
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

// Mengaktifkan binding Cloudflare (env, R2, KV) saat `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
