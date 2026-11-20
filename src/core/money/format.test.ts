import { describe, expect, it } from "vitest";
import { formatRupiah } from "./format";

describe("formatRupiah", () => {
  it("memakai titik sebagai pemisah ribuan", () => {
    expect(formatRupiah(22500)).toBe("Rp22.500");
    expect(formatRupiah(1250000)).toBe("Rp1.250.000");
  });

  it("menangani nol dan nilai negatif", () => {
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(-5000)).toBe("-Rp5.000");
  });

  it("membulatkan pecahan ke rupiah terdekat", () => {
    expect(formatRupiah(6136.36)).toBe("Rp6.136");
  });

  it("menolak nilai yang bukan angka", () => {
    expect(() => formatRupiah(Number.NaN)).toThrow(RangeError);
  });
});
