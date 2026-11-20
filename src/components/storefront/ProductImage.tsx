"use client";
/* eslint-disable @next/next/no-img-element -- foto berasal dari CDN brand; optimasi gambar Next tidak dipakai di Workers. */

import { useState } from "react";

export function ProductImage({ src, name, className }: { src?: string; name: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden className={`grid place-items-center bg-mist text-xl font-bold text-ink-faint ${className}`}>
        {name.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      // Foto yang sudah gagal sebelum halaman aktif tidak memicu onError lagi.
      ref={(el) => {
        if (el && el.complete && el.naturalWidth === 0) setFailed(true);
      }}
      className={`bg-mist object-cover ${className}`}
    />
  );
}
