/**
 * Jam layanan jasdor (satu jadwal untuk semua brand).
 * Hari: 0 = Minggu ... 6 = Sabtu. Jam dalam zona waktu jadwal (default Asia/Jakarta).
 */

export interface ServiceSchedule {
  openDays: number[];
  tentativeDays: number[];
  openTime: string;
  closeTime: string;
  timeZone: string;
  emergencyClosed: boolean;
}

export type ServiceState = "open" | "tentative" | "closed";

export interface ServiceStatus {
  state: ServiceState;
  /** Jam tutup hari ini (HH:mm) bila sedang buka/tentatif. */
  closesAt?: string;
  /** Kapan buka berikutnya, contoh { day: 5, time: "08:00", isToday: false }. */
  nextOpen?: { day: number; time: string; isToday: boolean };
}

export const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Hari & menit-dalam-hari pada zona waktu tertentu. */
export function localDayAndMinutes(now: Date, timeZone: string): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function serviceStatus(schedule: ServiceSchedule, now: Date): ServiceStatus {
  const { day, minutes } = localDayAndMinutes(now, schedule.timeZone);
  const open = toMinutes(schedule.openTime);
  const close = toMinutes(schedule.closeTime);
  const servesOn = (d: number) => schedule.openDays.includes(d) || schedule.tentativeDays.includes(d);

  if (!schedule.emergencyClosed && servesOn(day) && minutes >= open && minutes < close) {
    return {
      state: schedule.openDays.includes(day) ? "open" : "tentative",
      closesAt: schedule.closeTime,
    };
  }

  // Cari hari buka berikutnya (hari ini bila belum lewat jam buka).
  for (let offset = 0; offset < 8; offset++) {
    const d = (day + offset) % 7;
    if (!schedule.openDays.includes(d)) continue;
    if (offset === 0 && minutes >= open) continue;
    return { state: "closed", nextOpen: { day: d, time: schedule.openTime, isToday: offset === 0 } };
  }
  return { state: "closed" };
}
