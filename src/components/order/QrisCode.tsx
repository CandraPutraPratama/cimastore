"use client";

import { encode } from "uqr";
import { useMemo } from "react";

const QUIET = 4;

/** Path SVG ringkas: kotak hitam berurutan dalam satu baris digabung jadi satu persegi panjang. */
function qrPath(payload: string): { d: string; size: number } {
  const { data, size } = encode(payload, { ecc: "M", border: 0 });
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y][x]) x++;
      d += `M${start + QUIET} ${y + QUIET}h${x - start}v1h-${x - start}z`;
    }
  }
  return { d, size: size + QUIET * 2 };
}

export function QrisCode({ payload, label }: { payload: string; label: string }) {
  const { d, size } = useMemo(() => qrPath(payload), [payload]);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="block h-auto w-full" shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/** Gambar PNG QRIS (dengan nominal & nama merchant) untuk disimpan lalu dibuka dari galeri e-wallet. */
export async function qrisPngBlob(payload: string, lines: string[]): Promise<Blob> {
  const { d, size } = qrPath(payload);
  const scale = 12;
  const qrPx = size * scale;
  const textHeight = 36 + lines.length * 40;
  const canvas = document.createElement("canvas");
  canvas.width = qrPx;
  canvas.height = qrPx + textHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.fillStyle = "#000";
  ctx.fill(new Path2D(d));
  ctx.restore();
  ctx.fillStyle = "#17233b";
  ctx.textAlign = "center";
  lines.forEach((line, i) => {
    ctx.font = `${i === 0 ? "bold 34px" : "26px"} system-ui, sans-serif`;
    ctx.fillText(line, canvas.width / 2, qrPx + 20 + i * 40 + 20);
  });
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar"))), "image/png"));
}
