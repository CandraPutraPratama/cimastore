import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { adminConfig, isAdmin } from "@/server/admin/auth";

export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin/pesanan");
  const config = adminConfig();
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-line bg-paper p-6">
      <h1 className="text-xl font-extrabold">Masuk admin</h1>
      <p className="mt-1 mb-5 text-sm text-ink-soft">Halaman ini khusus pemilik jasdor.</p>
      {config.ok ? <LoginForm /> : <p role="alert" className="rounded-xl bg-marigold/25 px-4 py-3 text-sm font-medium">{config.problem}</p>}
    </div>
  );
}
