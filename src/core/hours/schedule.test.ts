import { describe, expect, it } from "vitest";
import { localDayAndMinutes, serviceStatus, type ServiceSchedule } from "./schedule";

const JASDOR: ServiceSchedule = {
  openDays: [5, 6, 0],
  tentativeDays: [2],
  openTime: "08:00",
  closeTime: "23:20",
  timeZone: "Asia/Jakarta",
  emergencyClosed: false,
};

// 20 Nov 2026 = Jumat. Waktu ditulis dalam WIB (+07:00).
const at = (iso: string) => new Date(iso);

describe("serviceStatus", () => {
  it("Jumat siang: buka sampai 23:20", () => {
    expect(serviceStatus(JASDOR, at("2026-11-20T12:00:00+07:00"))).toEqual({ state: "open", closesAt: "23:20" });
  });

  it("Jumat 23:20 tepat: sudah tutup, buka lagi Sabtu 08:00", () => {
    expect(serviceStatus(JASDOR, at("2026-11-20T23:20:00+07:00"))).toEqual({
      state: "closed",
      nextOpen: { day: 6, time: "08:00", isToday: false },
    });
  });

  it("Jumat pagi sebelum jam buka: buka hari ini", () => {
    expect(serviceStatus(JASDOR, at("2026-11-20T07:30:00+07:00")).nextOpen).toEqual({ day: 5, time: "08:00", isToday: true });
  });

  it("Senin: tutup, buka lagi Jumat", () => {
    expect(serviceStatus(JASDOR, at("2026-11-23T10:00:00+07:00")).nextOpen).toEqual({ day: 5, time: "08:00", isToday: false });
  });

  it("Selasa: tentatif", () => {
    expect(serviceStatus(JASDOR, at("2026-11-24T10:00:00+07:00")).state).toBe("tentative");
  });

  it("tutup darurat mengalahkan jadwal", () => {
    expect(serviceStatus({ ...JASDOR, emergencyClosed: true }, at("2026-11-21T10:00:00+07:00")).state).toBe("closed");
  });

  it("memakai zona waktu jadwal, bukan zona waktu server", () => {
    // 2026-11-20T17:30Z = Sabtu 00:30 WIB
    expect(localDayAndMinutes(at("2026-11-20T17:30:00Z"), "Asia/Jakarta")).toEqual({ day: 6, minutes: 30 });
  });
});
