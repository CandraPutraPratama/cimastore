import { redirect } from "next/navigation";
import { requireAdmin } from "@/server/admin/auth";

export default async function AdminHome() {
  await requireAdmin();
  redirect("/admin/pesanan");
}
