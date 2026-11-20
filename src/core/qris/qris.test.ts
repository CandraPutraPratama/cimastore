import { describe, expect, it } from "vitest";
import { crc16, inspectQris, parseTlv, qrisWithAmount, QrisError } from "./qris";

// QRIS statis pemilik (dibaca dari gambar QRIS v1).
const STATIC =
  "00020101021126610014COM.GO-JEK.WWW01189360091435771140150210G5771140150303UMI27570011ID.DANA.WWW011893600915083380671102098338067110303UMI51440014ID.CO.QRIS.WWW0215ID10253747967000303UMI5204573253033605802ID5910Cimatix_id6008SIDOARJO61056125262070703A016304F702";

describe("QRIS", () => {
  it("CRC payload asli cocok dan info merchant terbaca", () => {
    expect(crc16(STATIC.slice(0, -4))).toBe("F702");
    expect(inspectQris(STATIC)).toEqual({ merchantName: "Cimatix_id", city: "SIDOARJO", nmid: "ID1025374796700", isDynamic: false });
  });

  it("nominal disisipkan sebagai tag 54, merchant dan akun penerima tidak berubah", () => {
    const dynamic = qrisWithAmount(STATIC, 36600);
    const info = inspectQris(dynamic);
    expect(info).toMatchObject({ merchantName: "Cimatix_id", nmid: "ID1025374796700", isDynamic: true, amount: 36600 });

    const tags = parseTlv(dynamic).map((f) => f.tag);
    expect(tags).toEqual(["00", "01", "26", "27", "51", "52", "53", "54", "58", "59", "60", "61", "62", "63"]);
    const before = parseTlv(STATIC).filter((f) => !["01", "63"].includes(f.tag));
    const after = parseTlv(dynamic).filter((f) => !["01", "54", "63"].includes(f.tag));
    expect(after).toEqual(before);
  });

  it("membuat ulang dari QRIS yang sudah bernominal mengganti nominalnya", () => {
    const twice = qrisWithAmount(qrisWithAmount(STATIC, 10000), 25500);
    expect(inspectQris(twice).amount).toBe(25500);
    expect(parseTlv(twice).filter((f) => f.tag === "54")).toHaveLength(1);
  });

  it("menolak payload rusak dan nominal tidak wajar", () => {
    expect(() => inspectQris(STATIC.slice(0, -1) + "0")).toThrow(QrisError);
    expect(() => inspectQris(STATIC.replace("Cimatix_id", "Penipu_xyz"))).toThrow(/CRC/);
    expect(() => qrisWithAmount(STATIC, 0)).toThrow(QrisError);
    expect(() => qrisWithAmount(STATIC, 1500.5)).toThrow(QrisError);
  });
});
