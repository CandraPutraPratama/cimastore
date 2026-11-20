import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { adminConfig, isAdmin } from "@/server/admin/auth";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin/pesanan");
  const config = adminConfig();
  return (
    <div className="toko panel mx-auto mt-10 max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Masuk admin</h1>
      <p className="mt-1 mb-5 text-sm text-ink-soft">Halaman ini khusus pemilik jasdor.</p>
      {config.ok ? <LoginForm /> : <p role="alert" className="rounded-xl border-2 border-ink bg-spark px-4 py-3 text-sm font-semibold">{config.problem}</p>}
    </div>
  );
}
