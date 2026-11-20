/** Kotak logo brand. Memakai logo asli kalau ada; kalau belum, huruf pertama di atas warna brand. */
export function BrandMark({ name, logoUrl, accent, className = "size-14" }: { name: string; logoUrl?: string | null; accent?: string; className?: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" width={56} height={56} loading="lazy" className={`${className} shrink-0 rounded-md border-[2.5px] border-ink bg-paper object-contain p-1`} />
    );
  }
  return (
    <span aria-hidden className={`${className} outline-letter grid shrink-0 place-items-center rounded-md border-[2.5px] border-ink text-[1.75rem]`} style={{ background: accent ?? "var(--color-marigold)" }}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
