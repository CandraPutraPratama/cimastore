import { localDayAndMinutes, serviceStatus, type ServiceSchedule } from "../hours/schedule";

/**
 * Waktu ambil pesanan. Customer memesan selama jasdor buka, lalu memilih
 * "sekarang" atau jam tertentu hari ini (slot 15 menit), dibatasi jam jasdor dan jam outlet.
 */

export const PICKUP_LEAD_MINUTES = 10;
const SLOT_MINUTES = 15;

export interface OutletHours {
  open?: string;
  close?: string;
}

export interface PickupOptions {
  canOrder: boolean;
  reason?: string;
  /** Bisa diambil secepatnya (outlet buka sekarang). */
  nowAvailable: boolean;
  /** Slot hari ini, format HH:mm. */
  slots: string[];
}

export type PickupChoice = { mode: "now" } | { mode: "scheduled"; time: string };

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHHmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function outletWindow(hours: OutletHours): { start: number; end: number } {
  if (!hours.open || !hours.close) return { start: 0, end: 24 * 60 };
  const start = toMinutes(hours.open);
  const end = toMinutes(hours.close);
  // Tutup lewat tengah malam (misal 10.00 - 02.00): untuk hari ini dihitung sampai 24.00.
  return end > start ? { start, end } : { start, end: 24 * 60 };
}

export function pickupOptions(schedule: ServiceSchedule, outlet: OutletHours, now: Date): PickupOptions {
  const status = serviceStatus(schedule, now);
  if (status.state === "closed") {
    return { canOrder: false, reason: "Jasdor sedang tutup.", nowAvailable: false, slots: [] };
  }
  const { minutes } = localDayAndMinutes(now, schedule.timeZone);
  const window = outletWindow(outlet);
  const latest = Math.min(toMinutes(schedule.closeTime), window.end);
  const ready = minutes + PICKUP_LEAD_MINUTES;

  const nowAvailable = minutes >= window.start && ready <= latest;
  const first = Math.ceil(Math.max(ready, toMinutes(schedule.openTime), window.start) / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: string[] = [];
  for (let m = first; m <= latest; m += SLOT_MINUTES) slots.push(toHHmm(m));

  if (!nowAvailable && slots.length === 0) {
    return { canOrder: false, reason: "Outlet ini sudah tutup untuk hari ini.", nowAvailable, slots };
  }
  return { canOrder: true, nowAvailable, slots };
}

export type ResolvedPickup =
  | { ok: true; mode: "now" | "scheduled"; pickupAt: Date }
  | { ok: false; message: string };

/** Memvalidasi pilihan customer dan mengubahnya menjadi waktu ambil. */
export function resolvePickup(
  choice: PickupChoice,
  schedule: ServiceSchedule,
  outlet: OutletHours,
  now: Date,
): ResolvedPickup {
  const options = pickupOptions(schedule, outlet, now);
  if (!options.canOrder) return { ok: false, message: options.reason ?? "Belum bisa memesan sekarang." };

  const startOfMinute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  if (choice.mode === "now") {
    if (!options.nowAvailable) return { ok: false, message: "Outlet belum buka. Pilih jam ambil." };
    return { ok: true, mode: "now", pickupAt: new Date(startOfMinute.getTime() + PICKUP_LEAD_MINUTES * 60_000) };
  }
  if (!options.slots.includes(choice.time)) {
    return { ok: false, message: "Jam ambil itu sudah tidak tersedia. Pilih jam lain." };
  }
  const { minutes } = localDayAndMinutes(now, schedule.timeZone);
  return {
    ok: true,
    mode: "scheduled",
    pickupAt: new Date(startOfMinute.getTime() + (toMinutes(choice.time) - minutes) * 60_000),
  };
}

/** Jam HH:mm di zona waktu jadwal. */
export function formatClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("hour")}.${get("minute")}`;
}

export function pickupLabel(mode: "now" | "scheduled", pickupAt: Date, timeZone: string): string {
  const clock = formatClock(pickupAt, timeZone);
  return mode === "now" ? `Sekarang (siap sekitar ${clock})` : `Dijadwalkan ${clock}`;
}
