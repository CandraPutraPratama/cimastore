/**
 * Utilitas bersama untuk importer brand. Importer hanya mengubah data mentah
 * menjadi CatalogSnapshot; tidak menyentuh database atau jaringan.
 */
import type { CatalogSnapshotInput } from "../core/catalog/snapshot";

type SnapshotOptionGroupInput = CatalogSnapshotInput["optionGroups"][number];

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Hash pendek dan stabil (FNV-1a 32-bit) untuk membuat id dari isi data. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** "21:30:00" atau "9:00" -> "21:30" / "09:00"; selain itu undefined. */
export function toHHmm(value: string | null | undefined): string | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function cleanText(value: string | null | undefined): string | undefined {
  const t = (value ?? "").replace(/\s+/g, " ").trim().replace(/[,;]+$/, "").trim();
  return t.length > 0 ? t : undefined;
}

/**
 * Mengumpulkan grup opsi: grup dengan isi identik dipakai bersama oleh banyak produk,
 * grup yang isinya berbeda (walau namanya sama) mendapat id sendiri.
 */
export class OptionGroupRegistry {
  private readonly groups = new Map<string, SnapshotOptionGroupInput>();

  register(group: Omit<SnapshotOptionGroupInput, "id" | "options"> & {
    options: Array<Omit<SnapshotOptionGroupInput["options"][number], "id"> & { key?: string }>;
  }): { id: string; optionIdByKey: Map<string, string> } {
    const content = JSON.stringify(group);
    const id = `${slugify(group.name) || "grup"}-${shortHash(content)}`;
    const optionIdByKey = new Map<string, string>();
    const usedOptionIds = new Set<string>();
    const options = group.options.map(({ key, ...option }, index) => {
      let optionId = `${id}.${slugify(option.name) || "opsi"}`;
      if (usedOptionIds.has(optionId)) optionId = `${optionId}-${index}`;
      usedOptionIds.add(optionId);
      optionIdByKey.set(key ?? option.name, optionId);
      return { ...option, id: optionId };
    });
    if (!this.groups.has(id)) this.groups.set(id, { ...group, id, options });
    return { id, optionIdByKey };
  }

  all(): SnapshotOptionGroupInput[] {
    return [...this.groups.values()];
  }
}

export interface ImportReport {
  brand: string;
  counts: Record<string, number>;
  warnings: string[];
}
