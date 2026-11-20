/* eslint-disable @next/next/no-img-element -- logo statis kecil; optimasi gambar Next tidak dipakai di Workers. */
import { BrandMark } from "@/components/BrandMark";
import Link from "next/link";
import { RecentOrders } from "@/components/order/RecentOrders";
import { ServiceStatus } from "@/components/storefront/ServiceStatus";
import { getHome } from "@/server/catalog";

const number = new Intl.NumberFormat("id-ID");

/** Awan doodle dan percikan, dipakai berulang di hero. Murni hiasan. */
function Cloud({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 64 32" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 27h37a9 9 0 0 0 1-17.9A12 12 0 0 0 29 6.5 10 10 0 0 0 14 14.7 6.2 6.2 0 0 0 14 27Z" />
    </svg>
  );
}

function Spark({ className }: { className: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="var(--color-marigold-deep)" strokeWidth="3" strokeLinecap="round">
      <path d="M12 3v6M4.5 6.5l3.8 4.2M19.5 6.5l-3.8 4.2" />
    </svg>
  );
}

export default async function Home() {
  const { settings, brands } = await getHome();

  return (
    <main className="flex flex-1 flex-col">
      <header className="relative overflow-hidden border-b-[2.5px] border-ink bg-mist px-5 pt-7 pb-6">
        <Cloud className="absolute top-3 right-4 w-14 text-ink/25" />
        <Cloud className="absolute bottom-16 left-[-10px] w-12 text-ink/20" />
        <div className="relative flex items-center gap-5">
          <img
            src="/logo-jasdor.webp"
            width={112}
            height={112}
            alt="Maskot Jasdor: cowok membawa kopi dengan kucing oranye berkacamata hitam di bahunya"
            className="size-28 shrink-0 rounded-full"
          />
          <div className="bubble bubble-pop min-w-0 flex-1 px-4 py-3">
            <h1 className="text-xl leading-snug font-semibold">Mau ngopi lebih hemat? Pesan di sini, ambil sendiri di outlet</h1>
          </div>
        </div>
        <Spark className="absolute top-4 left-[6.75rem] w-7 -rotate-12" />
        <div className="relative mt-5">
          <ServiceStatus settings={settings} now={new Date()} />
        </div>
        {settings.announcement ? (
          <p className="panel relative mt-4 bg-spark px-4 py-3 text-sm font-semibold">{settings.announcement}</p>
        ) : null}
      </header>

      <RecentOrders />

      <section aria-labelledby="pilih-brand" className="flex-1 px-5 pt-6 pb-4">
        <h2 id="pilih-brand" className="text-2xl font-semibold">
          <span className="marker">Mau pesan dari mana?</span>
        </h2>
        {brands.length === 0 ? (
          <p className="mt-4 text-ink-soft">Belum ada brand yang bisa dipesan. Coba lagi nanti.</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {brands.map((brand) => {
              // Belum siap: menu belum diimpor, atau brand katalog tanpa outlet aktif.
              const notReady = brand.productCount === 0 || (brand.outletMode === "catalog" && brand.outletCount === 0);
              const body = (
                <>
                  <BrandMark name={brand.name} logoUrl={brand.logoUrl} accent={brand.theme.accent} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-xl font-semibold">{brand.name}</span>
                      {notReady ? (
                        <span className="sticker [transform:none] bg-mist text-ink-soft">Segera hadir</span>
                      ) : !brand.isActive ? (
                        <span className="sticker [transform:none] bg-mist text-ink-soft">Pratinjau</span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-soft">
                      {notReady
                        ? "Menu sedang disiapkan"
                        : brand.outletMode === "customer_input"
                          ? "Tulis sendiri outlet tujuanmu"
                          : `${number.format(brand.outletCount)} outlet`}
                    </span>
                    {brand.promoNames.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-2">
                        {brand.promoNames.map((promo) => (
                          <span key={promo} className="sticker bg-hemat-soft text-hemat">
                            {promo}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </>
              );
              const rowClass = "panel flex items-start gap-4 p-4";
              return (
                <li key={brand.slug}>
                  {notReady ? (
                    <div className={`${rowClass} opacity-60 shadow-none`}>{body}</div>
                  ) : (
                    <Link href={`/${brand.slug}`} className={`${rowClass} panel-press`}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="border-t-[2.5px] border-ink bg-mist px-5 py-6 text-xs text-ink-soft">
        Jasdor adalah layanan jasa order independen dan tidak berafiliasi dengan brand mana pun.
      </footer>
    </main>
  );
}
