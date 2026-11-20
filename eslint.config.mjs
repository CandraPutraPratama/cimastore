import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // src/core berisi logika bisnis murni: harus bisa dites tanpa Next.js, React,
    // database, atau kode brand tertentu. Lihat docs/ARCHITECTURE.md bagian 7.
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@/server/*", "@/brands/*", "@/components/*"],
              message: "src/core tidak boleh bergantung pada app, server, brands, atau components.",
            },
            {
              group: ["next", "next/*", "react", "react-dom", "@supabase/*"],
              message: "src/core harus bebas framework dan database.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    // Data mentah milik pemilik, bukan kode.
    "Chagee/**",
    "Chatime/**",
    "Fore/**",
    "Kopi Kenangan/**",
    "Mixue/**",
    "McD/**",
  ]),
]);

export default eslintConfig;
