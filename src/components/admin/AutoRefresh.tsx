"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Memuat ulang data halaman server tiap beberapa detik selama tab terlihat (daftar pesanan masuk). */
export function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
