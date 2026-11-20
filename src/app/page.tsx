import { formatRupiah } from "@/core/money/format";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-16">
      <h1 className="text-2xl font-semibold">Jasdor v2</h1>
      <p className="text-zinc-600">
        Website jasa order multi-brand sedang dibangun.
      </p>
      <p className="text-sm text-zinc-500">
        Contoh format harga: {formatRupiah(22500)}
      </p>
    </main>
  );
}
