import type { SiteSettings } from "@/core/catalog/storefront";
import { DAY_NAMES, serviceStatus } from "@/core/hours/schedule";

function dot(time: string) {
  return time.replace(":", ".");
}

/** Status layanan jasdor saat ini, untuk ditampilkan di atas halaman. */
export function ServiceStatus({ settings, now }: { settings: SiteSettings; now: Date }) {
  const status = serviceStatus(settings, now);
  const text =
    status.state === "open"
      ? `Buka sampai ${dot(status.closesAt!)} WIB`
      : status.state === "tentative"
        ? `Buka terbatas hari ini, konfirmasi admin dulu`
        : status.nextOpen
          ? `Tutup. Buka lagi ${status.nextOpen.isToday ? "hari ini" : DAY_NAMES[status.nextOpen.day]} ${dot(status.nextOpen.time)} WIB`
          : "Sedang tutup";

  const tone =
    status.state === "open"
      ? "bg-hemat-soft text-hemat"
      : status.state === "tentative"
        ? "bg-spark text-ink"
        : "bg-paper text-ink-soft";

  return (
    <p className={`inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1 text-sm font-bold ${tone}`}>
      <span aria-hidden className={`size-2 rounded-full ${status.state === "open" ? "bg-hemat" : status.state === "tentative" ? "bg-marigold-deep" : "bg-ink-faint"}`} />
      {text}
    </p>
  );
}
