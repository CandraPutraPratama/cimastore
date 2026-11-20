import Link from "next/link";
import { ServiceStatus } from "@/components/storefront/ServiceStatus";
import { getHome } from "@/server/catalog";

const number = new Intl.NumberFormat("id-ID");

export default async function Home() {
  const { settings, brands } = await getHome();

  return (
    <main className="flex flex-1 flex-col">
      <header className="px-5 pt-8 pb-6">
        <p className="text-3xl font-extrabold tracking-tight">jasdor</p>
        <h1 className="mt-3 max-w-[22ch] text-xl leading-snug font-semibold">
          Pesan kopi dan teh favoritmu lebih hemat, ambil sendiri di outlet.
        </h1>
        <div className="mt-4">
          <ServiceStatus settings={settings} now={new Date()} />
        </div>
        {settings.announcement ? (
          <p className="mt-4 rounded-xl bg-marigold/20 px-4 py-3 text-sm">{settings.announcement}</p>
        ) : null}
      </header>

      <section aria-labelledby="pilih-brand" className="flex-1 border-t border-line">
        <h2 id="pilih-brand" className="px-5 pt-5 pb-2 text-sm font-semibold text-ink-soft">
          Pilih brand
        </h2>
        {brands.length === 0 ? (
          <p className="px-5 py-8 text-ink-soft">Belum ada brand yang bisa dipesan. Coba lagi nanti.</p>
        ) : (
          <ul>
            {brands.map((brand) => {
              const notReady = brand.outletMode === "catalog" && brand.outletCount === 0;
              const body = (
                <>
                  <span aria-hidden className="w-1.5 shrink-0 rounded-full" style={{ background: brand.theme.accent ?? "var(--color-ink)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-xl font-bold">{brand.name}</span>
                      {notReady ? (
                        <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold text-ink-soft">Segera hadir</span>
                      ) : !brand.isActive ? (
                        <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-semibold text-ink-soft">Pratinjau</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {brand.outletMode === "customer_input"
                        ? "Tulis sendiri outlet tujuanmu"
                        : notReady
                          ? "Menu sedang disiapkan"
                          : `${number.format(brand.outletCount)} outlet`}
                    </span>
                    {brand.promoNames.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {brand.promoNames.map((promo) => (
                          <span key={promo} className="rounded-md bg-hemat-soft px-2 py-0.5 text-xs font-semibold text-hemat">
                            {promo}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </>
              );
              const rowClass = "flex items-stretch gap-4 px-5 py-4";
              return (
                <li key={brand.slug}>
                  {notReady ? (
                    <div className={`${rowClass} opacity-60`}>{body}</div>
                  ) : (
                    <Link href={`/${brand.slug}`} className={`${rowClass} transition-colors hover:bg-mist active:bg-mist`}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="px-5 py-6 text-xs text-ink-faint">
        Jasdor adalah layanan jasa order independen dan tidak berafiliasi dengan brand mana pun.
      </footer>
    </main>
  );
}
