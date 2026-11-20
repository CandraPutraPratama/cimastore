import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso } from "./datetime";
import { parseBrandForm, parsePromoForm, parseSettingsForm, type FormValues } from "./forms";
import { constantTimeEqual, createSessionToken, passwordMatches, verifySessionToken } from "./session";
import { brandWarnings, promoMarginWarnings } from "./warnings";

const SECRET = "rahasia-tes-rahasia-tes-rahasia-tes-1234";
const NOW = new Date("2026-11-21T10:00:00+07:00");
const QRIS =
  "00020101021126610014COM.GO-JEK.WWW01189360091435771140150210G5771140150303UMI27570011ID.DANA.WWW011893600915083380671102098338067110303UMI51440014ID.CO.QRIS.WWW0215ID10253747967000303UMI5204573253033605802ID5910Cimatix_id6008SIDOARJO61056125262070703A016304F702";

describe("sesi admin", () => {
  it("token valid diterima, kedaluwarsa dan rusak ditolak", async () => {
    const token = await createSessionToken(SECRET, NOW, 60_000);
    expect(await verifySessionToken(SECRET, token, NOW)).toBe(true);
    expect(await verifySessionToken(SECRET, token, new Date(NOW.getTime() + 59_000))).toBe(true);
    expect(await verifySessionToken(SECRET, token, new Date(NOW.getTime() + 61_000))).toBe(false);
    expect(await verifySessionToken("secret-lain-secret-lain-secret-lain-12", token, NOW)).toBe(false);
    expect(await verifySessionToken(SECRET, null, NOW)).toBe(false);
    expect(await verifySessionToken(SECRET, "", NOW)).toBe(false);
    expect(await verifySessionToken(SECRET, "abc.def", NOW)).toBe(false);
  });

  it("masa berlaku tidak bisa diperpanjang dengan mengubah angkanya", async () => {
    const token = await createSessionToken(SECRET, NOW, 60_000);
    const [expires, signature] = token.split(".");
    const forged = `${Number(expires) + 86_400_000}.${signature}`;
    expect(await verifySessionToken(SECRET, forged, NOW)).toBe(false);
  });

  it("perbandingan password", async () => {
    expect(await passwordMatches("kata-sandi-panjang", "kata-sandi-panjang")).toBe(true);
    expect(await passwordMatches("kata-sandi-panjang", "kata-sandi-panjang ")).toBe(false);
    expect(await passwordMatches("kata-sandi-panjang", "")).toBe(false);
    expect(constantTimeEqual("a", "ab")).toBe(false);
    expect(constantTimeEqual("ab", "ab")).toBe(true);
  });
});

describe("tanggal-jam form", () => {
  it("WIB ke UTC dan sebaliknya", () => {
    expect(localInputToIso("2026-11-21T08:00", "Asia/Jakarta")).toBe("2026-11-21T01:00:00.000Z");
    expect(isoToLocalInput("2026-11-21T01:00:00.000Z", "Asia/Jakarta")).toBe("2026-11-21T08:00");
    expect(localInputToIso("2026-11-21T00:30", "Asia/Jakarta")).toBe("2026-11-20T17:30:00.000Z");
    expect(isoToLocalInput(null, "Asia/Jakarta")).toBe("");
  });

  it("format salah atau tanggal mustahil ditolak", () => {
    expect(localInputToIso("21/11/2026 08:00", "Asia/Jakarta")).toBeNull();
    expect(localInputToIso("2026-02-30T08:00", "Asia/Jakarta")).toBeNull();
    expect(localInputToIso("2026-11-21T25:00", "Asia/Jakarta")).toBeNull();
  });
});

const promoForm = (over: FormValues = {}): FormValues => ({
  name: "Diskon 50% (maks Rp35.000)",
  level: "transaction",
  type: "percent",
  value: "50",
  scope: "all_items",
  appliesTo: "base_price",
  maxDiscount: "35.000",
  active: "on",
  ...over,
});
const TZ = { timeZone: "Asia/Jakarta" };

describe("form promo", () => {
  it("promo valid, angka berformat rupiah dibaca", () => {
    const r = parsePromoForm(promoForm(), TZ);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toMatchObject({ id: null, level: "transaction", type: "percent", value: 50, maxDiscount: 35000, minSubtotal: null, active: true, productIds: null });
    }
    const rp = parsePromoForm(promoForm({ maxDiscount: "Rp 30.000", minSubtotal: "50000" }), TZ);
    expect(rp.ok && rp.value.maxDiscount).toBe(30000);
    expect(rp.ok && rp.value.minSubtotal).toBe(50000);
  });

  it("kolom kosong menjadi null dan tidak aktif bila kotak tidak dicentang", () => {
    const r = parsePromoForm(promoForm({ maxDiscount: "", active: undefined }), TZ);
    expect(r.ok && r.value.maxDiscount).toBeNull();
    expect(r.ok && r.value.active).toBe(false);
  });

  it("menolak input salah dengan pesan per kolom", () => {
    expect(parsePromoForm(promoForm({ name: "" }), TZ)).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(parsePromoForm(promoForm({ value: "150" }), TZ)).toMatchObject({ ok: false, errors: { value: "Persen maksimal 100." } });
    expect(parsePromoForm(promoForm({ value: "abc" }), TZ)).toMatchObject({ ok: false, errors: { value: expect.stringContaining("angka") } });
    expect(parsePromoForm(promoForm({ type: "persen" }), TZ)).toMatchObject({ ok: false, errors: { type: expect.any(String) } });
    expect(parsePromoForm(promoForm({ minQty: "3", maxQty: "2" }), TZ)).toMatchObject({ ok: false, errors: { minQty: expect.any(String) } });
  });

  it("promo per item wajib menyebut produk", () => {
    const r = parsePromoForm(promoForm({ level: "item", type: "fixed", value: "10000", maxUnits: "1" }), TZ);
    expect(r).toMatchObject({ ok: false, errors: { productIds: expect.any(String) } });
    const ok = parsePromoForm(promoForm({ level: "item", type: "fixed", value: "10000", maxUnits: "1", productIds: ["p1", "p2", "p1"] }), TZ);
    expect(ok.ok && ok.value.productIds).toEqual(["p1", "p2"]);
    expect(ok.ok && ok.value.maxUnits).toBe(1);
  });

  it("maxUnits dibuang untuk promo transaksi", () => {
    const r = parsePromoForm(promoForm({ maxUnits: "2" }), TZ);
    expect(r.ok && r.value.maxUnits).toBeNull();
  });

  it("periode: dibaca sebagai WIB, selesai harus setelah mulai", () => {
    const ok = parsePromoForm(promoForm({ startsAt: "2026-11-21T08:00", endsAt: "2026-11-23T23:20" }), TZ);
    expect(ok.ok && ok.value.startsAt).toBe("2026-11-21T01:00:00.000Z");
    expect(ok.ok && ok.value.endsAt).toBe("2026-11-23T16:20:00.000Z");
    expect(parsePromoForm(promoForm({ startsAt: "2026-11-23T08:00", endsAt: "2026-11-21T08:00" }), TZ)).toMatchObject({
      ok: false,
      errors: { endsAt: expect.any(String) },
    });
  });

  it("id promo yang ada dibawa untuk update", () => {
    const r = parsePromoForm(promoForm({ id: "0f9d6a3e-5b6a-4a50-9f0e-3a2b1c9d8e7f" }), TZ);
    expect(r.ok && r.value.id).toBe("0f9d6a3e-5b6a-4a50-9f0e-3a2b1c9d8e7f");
  });
});

const brandForm = (over: FormValues = {}): FormValues => ({
  name: "Kopi Kenangan",
  accent: "#c8102e",
  splitMode: "auto",
  maxItemsPerOrder: "20",
  sortOrder: "10",
  feeType: "per_item",
  feeAmount: "2.300",
  feeSingleAmount: "4.000",
  ...over,
});

describe("form brand dan fee", () => {
  it("fee per item dengan tarif 1 item", () => {
    const r = parseBrandForm(brandForm());
    expect(r.ok && r.value).toMatchObject({
      name: "Kopi Kenangan",
      accent: "#C8102E",
      splitMode: "auto",
      maxItemsPerOrder: 20,
      sortOrder: 10,
      feeRules: { type: "per_item", amount: 2300, singleItemAmount: 4000 },
    });
  });

  it("jenis fee lain", () => {
    expect(parseBrandForm(brandForm({ feeType: "none" }))).toMatchObject({ ok: true, value: { feeRules: { type: "none" } } });
    expect(parseBrandForm(brandForm({ feeType: "per_order", feeAmount: "3000" }))).toMatchObject({ ok: true, value: { feeRules: { type: "per_order", amount: 3000 } } });
    const noSingle = parseBrandForm(brandForm({ feeSingleAmount: "" }));
    expect(noSingle.ok && noSingle.value.feeRules).toEqual({ type: "per_item", amount: 2300, singleItemAmount: null });
  });

  it("menolak input salah", () => {
    expect(parseBrandForm(brandForm({ accent: "merah" }))).toMatchObject({ ok: false, errors: { accent: expect.any(String) } });
    expect(parseBrandForm(brandForm({ feeAmount: "" }))).toMatchObject({ ok: false, errors: { feeAmount: expect.any(String) } });
    expect(parseBrandForm(brandForm({ feeType: "gratis" }))).toMatchObject({ ok: false, errors: { feeType: expect.any(String) } });
    expect(parseBrandForm(brandForm({ maxItemsPerOrder: "0" }))).toMatchObject({ ok: false, errors: { maxItemsPerOrder: expect.any(String) } });
    expect(parseBrandForm(brandForm({ maxItemsPerOrder: "101" }))).toMatchObject({ ok: false });
    expect(parseBrandForm(brandForm({ splitMode: "x" }))).toMatchObject({ ok: false, errors: { splitMode: expect.any(String) } });
    expect(parseBrandForm(brandForm({ name: "  " }))).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
  });
});

const settingsForm = (over: FormValues = {}): FormValues => ({
  openDays: ["5", "6", "0"],
  tentativeDays: ["2"],
  openTime: "08:00",
  closeTime: "23:20",
  whatsappNumber: "0877 9342 0768",
  paymentExpiryMinutes: "60",
  announcement: "",
  ...over,
});

describe("form pengaturan situs", () => {
  it("valid: nomor WA dinormalkan, QRIS kosong = tidak diubah", () => {
    const r = parseSettingsForm(settingsForm());
    expect(r.ok && r.value).toEqual({
      openDays: [0, 5, 6],
      tentativeDays: [2],
      openTime: "08:00",
      closeTime: "23:20",
      whatsappNumber: "6287793420768",
      paymentExpiryMinutes: 60,
      announcement: null,
      emergencyClosed: false,
    });
  });

  it("hari buka tidak ikut jadi tentatif; QRIS baru divalidasi", () => {
    const r = parseSettingsForm(settingsForm({ tentativeDays: ["5", "2"], qrisPayload: ` ${QRIS.slice(0, 40)}\n${QRIS.slice(40)} `, emergencyClosed: "on", announcement: "Libur  lebaran" }));
    expect(r.ok && r.value.tentativeDays).toEqual([2]);
    expect(r.ok && r.value.qrisPayload).toBe(QRIS);
    expect(r.ok && r.value.emergencyClosed).toBe(true);
    expect(r.ok && r.value.announcement).toBe("Libur lebaran");
  });

  it("menolak input salah", () => {
    expect(parseSettingsForm(settingsForm({ openDays: [] }))).toMatchObject({ ok: false, errors: { openDays: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ closeTime: "07:00" }))).toMatchObject({ ok: false, errors: { closeTime: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ openTime: "8" }))).toMatchObject({ ok: false, errors: { openTime: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ whatsappNumber: "12345" }))).toMatchObject({ ok: false, errors: { whatsappNumber: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ paymentExpiryMinutes: "2" }))).toMatchObject({ ok: false, errors: { paymentExpiryMinutes: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ qrisPayload: QRIS.replace("Cimatix", "Cimatax") }))).toMatchObject({ ok: false, errors: { qrisPayload: expect.any(String) } });
    expect(parseSettingsForm(settingsForm({ announcement: "x".repeat(201) }))).toMatchObject({ ok: false, errors: { announcement: expect.any(String) } });
  });
});

describe("peringatan margin", () => {
  const promo = (over: Partial<Parameters<typeof promoMarginWarnings>[1][number]>) => ({
    name: "Promo",
    level: "transaction" as const,
    type: "fixed" as const,
    value: 10000,
    maxDiscount: null,
    minSubtotal: null,
    ...over,
  });

  it("memperingatkan bila potongan tetap tidak lebih besar dari fee", () => {
    expect(promoMarginWarnings({ type: "per_order", amount: 12000 }, [promo({})])).toHaveLength(1);
    expect(promoMarginWarnings({ type: "per_item", amount: 10000, singleItemAmount: null }, [promo({ level: "item" })])).toHaveLength(1);
  });

  it("tarif 1 item yang lebih tinggi ikut dihitung", () => {
    expect(promoMarginWarnings({ type: "per_item", amount: 2300, singleItemAmount: 12000 }, [promo({ level: "item" })])).toHaveLength(1);
  });

  it("aman: potongan lebih besar, fee nol, promo nonaktif, atau persen tanpa batas", () => {
    expect(promoMarginWarnings({ type: "per_order", amount: 3000 }, [promo({})])).toEqual([]);
    expect(promoMarginWarnings({ type: "none" }, [promo({})])).toEqual([]);
    expect(promoMarginWarnings({ type: "per_order", amount: 99999 }, [promo({ active: false })])).toEqual([]);
    expect(promoMarginWarnings({ type: "per_item", amount: 9999, singleItemAmount: null }, [promo({ level: "item", type: "percent", value: 50 })])).toEqual([]);
  });

  it("persen dengan batas kecil per porsi diperingatkan", () => {
    expect(promoMarginWarnings({ type: "per_item", amount: 5000, singleItemAmount: null }, [promo({ level: "item", type: "percent", value: 30, maxDiscount: 4000 })])).toHaveLength(1);
  });

  it("voucher transaksi dibandingkan dengan biaya jasa transaksi terkecil", () => {
    // Chatime: potongan Rp10.000 per transaksi 1 item, biaya jasa per item Rp12.000.
    expect(promoMarginWarnings({ type: "per_item", amount: 12000, singleItemAmount: null }, [promo({})])).toHaveLength(1);
    // Biaya Rp2.300 per item dan Rp4.000 untuk 1 item: aman.
    expect(promoMarginWarnings({ type: "per_item", amount: 2300, singleItemAmount: 4000 }, [promo({})])).toEqual([]);
    // Transaksi minimal 2 item: biaya 2 x 6.000 = 12.000 melebihi potongan.
    const two = promoMarginWarnings({ type: "per_item", amount: 6000, singleItemAmount: null }, [promo({ minQty: 2 })]);
    expect(two).toHaveLength(1);
    expect(two[0]).toContain("2 item");
  });

  it("peringatan brand aktif tanpa menu atau outlet", () => {
    expect(brandWarnings({ isActive: true, productCount: 0, outletCount: 3, outletMode: "catalog" })).toHaveLength(1);
    expect(brandWarnings({ isActive: true, productCount: 5, outletCount: 0, outletMode: "catalog" })).toHaveLength(1);
    expect(brandWarnings({ isActive: true, productCount: 5, outletCount: 0, outletMode: "customer_input" })).toEqual([]);
    expect(brandWarnings({ isActive: false, productCount: 0, outletCount: 0, outletMode: "catalog" })).toEqual([]);
  });
});
