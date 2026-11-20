"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { OutletsPayload } from "@/core/catalog/storefront";

type LocationState = "idle" | "locating" | "denied";

const number = new Intl.NumberFormat("id-ID");

export function OutletPicker({ brand, initial }: { brand: string; initial: OutletsPayload }) {
  const [query, setQuery] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [location, setLocation] = useState<LocationState>("idle");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ brand });
      if (query.trim()) params.set("q", query.trim());
      if (coords) {
        params.set("lat", String(coords.lat));
        params.set("lng", String(coords.lng));
      }
      try {
        const res = await fetch(`/api/outlets?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        setData(await res.json());
      } catch (err) {
        if (!controller.signal.aborted) setError("Daftar outlet gagal dimuat. Periksa koneksi lalu coba lagi.");
        void err;
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [brand, query, coords]);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocation("denied");
      return;
    }
    setLocation("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocation("idle");
      },
      () => setLocation("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <section className="flex flex-1 flex-col" aria-label="Daftar outlet">
      <div className="sticky top-0 z-10 border-b border-line bg-paper px-5 pt-1 pb-3">
        <label htmlFor="cari-outlet" className="sr-only">
          Cari outlet
        </label>
        <input
          id="cari-outlet"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Cari nama outlet, mall, atau kota"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-line bg-mist px-4 py-3 text-base placeholder:text-ink-faint focus:border-ink focus:bg-paper focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={location === "locating"}
            className="font-semibold text-ink underline decoration-marigold decoration-2 underline-offset-4 disabled:opacity-60"
          >
            {coords ? "Diurutkan dari lokasimu" : location === "locating" ? "Mencari lokasimu..." : "Urutkan dari lokasiku"}
          </button>
          <span className="text-ink-faint" aria-live="polite">
            {loading ? "Memuat..." : `${number.format(data.total)} outlet`}
          </span>
        </div>
        {location === "denied" ? (
          <p className="mt-2 text-sm text-danger">Lokasi tidak bisa dibaca. Izinkan akses lokasi di browser, atau cari outlet dengan mengetik namanya.</p>
        ) : null}
      </div>

      {error ? <p className="px-5 py-6 text-danger">{error}</p> : null}

      {!error && data.outlets.length === 0 ? (
        <p className="px-5 py-8 text-ink-soft">
          Tidak ada outlet yang cocok dengan &ldquo;{query}&rdquo;. Coba nama mall, jalan, atau kota.
        </p>
      ) : null}

      <ul className={loading ? "opacity-60" : undefined}>
        {data.outlets.map((outlet) => (
          <li key={outlet.code} className="border-b border-line last:border-b-0">
            <Link
              href={`/${brand}/${encodeURIComponent(outlet.code)}`}
              className="block px-5 py-4 transition-colors hover:bg-mist active:bg-mist"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{outlet.name}</span>
                {outlet.distanceKm !== undefined ? (
                  <span className="price shrink-0 text-sm font-semibold text-ink-soft">
                    {outlet.distanceKm < 1 ? `${Math.round(outlet.distanceKm * 1000)} m` : `${outlet.distanceKm.toFixed(1).replace(".", ",")} km`}
                  </span>
                ) : null}
              </span>
              {outlet.address ? <span className="mt-0.5 line-clamp-1 block text-sm text-ink-soft">{outlet.address}</span> : null}
              {outlet.openTime && outlet.closeTime ? (
                <span className="mt-1 block text-xs text-ink-faint">
                  Outlet buka {outlet.openTime.replace(":", ".")} sampai {outlet.closeTime.replace(":", ".")}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
