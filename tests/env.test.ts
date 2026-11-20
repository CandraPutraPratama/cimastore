import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeDatabaseUrl, loadEnvFiles, requireDatabaseUrl } from "../scripts/lib/env";

const KEYS = ["JASDOR_TEST_A", "JASDOR_TEST_B", "JASDOR_TEST_C", "DATABASE_URL"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("loadEnvFiles", () => {
  it("membaca file berakhiran baris Windows, tanda kutip, dan komentar", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "env-"));
    writeFileSync(path.join(dir, ".env.local"), '# komentar\r\nJASDOR_TEST_A=nilai-a\r\n\r\nJASDOR_TEST_B="dengan spasi"\r\n');
    for (const k of KEYS) delete process.env[k];
    loadEnvFiles(dir);
    expect(process.env.JASDOR_TEST_A).toBe("nilai-a");
    expect(process.env.JASDOR_TEST_B).toBe("dengan spasi");
  });

  it("tidak menimpa variabel yang sudah ada", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "env-"));
    writeFileSync(path.join(dir, ".env.local"), "JASDOR_TEST_C=dari-file\n");
    process.env.JASDOR_TEST_C = "dari-environment";
    loadEnvFiles(dir);
    expect(process.env.JASDOR_TEST_C).toBe("dari-environment");
  });
});

describe("requireDatabaseUrl", () => {
  it("memberi pesan jelas bila kosong atau masih placeholder", () => {
    delete process.env.DATABASE_URL;
    expect(() => requireDatabaseUrl()).toThrow(/Session pooler/);
    process.env.DATABASE_URL = "postgresql://postgres.abc:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
    expect(() => requireDatabaseUrl()).toThrow(/YOUR-PASSWORD/);
    process.env.DATABASE_URL = "https://abc.supabase.co";
    expect(() => requireDatabaseUrl()).toThrow(/postgresql/);
  });

  it("menampilkan host tanpa password", () => {
    const url = "postgresql://postgres.abc:rahasia@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";
    expect(describeDatabaseUrl(url)).toBe("aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres");
    expect(describeDatabaseUrl(url)).not.toContain("rahasia");
  });
});
