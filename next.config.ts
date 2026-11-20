import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents sengaja tidak diaktifkan: belum didukung penuh oleh
  // @opennextjs/cloudflare (lihat opennextjs-cloudflare PR #1318).
  poweredByHeader: false,
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
