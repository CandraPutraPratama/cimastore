import { describe, expect, it } from "vitest";
import { detectLogoType, logoKey } from "@/core/catalog/logo";
import { PHOTO_KEY_PATTERN } from "@/core/catalog/photos";

describe("logo brand", () => {
  it("mengenali png, jpg, webp dari isi file", () => {
    expect(detectLogoType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectLogoType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(detectLogoType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  });
  it("menolak file lain", () => {
    expect(detectLogoType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
    expect(detectLogoType(new Uint8Array())).toBeNull();
  });
  it("kunci logo lolos pola rute /foto", () => {
    expect(PHOTO_KEY_PATTERN.test(logoKey("kopi-kenangan", "ab12cd34ef", "png"))).toBe(true);
  });
});
