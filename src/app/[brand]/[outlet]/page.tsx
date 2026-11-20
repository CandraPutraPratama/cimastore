import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MenuView } from "@/components/storefront/MenuView";
import { getMenu } from "@/server/catalog";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: PageProps<"/[brand]/[outlet]">): Promise<Metadata> {
  const { brand, outlet } = await params;
  const menu = await getMenu(brand, decode(outlet));
  return { title: menu ? `${menu.brand.name} ${menu.outlet.name}` : "Outlet tidak ditemukan" };
}

export default async function OutletMenuPage({ params }: PageProps<"/[brand]/[outlet]">) {
  const { brand, outlet } = await params;
  const menu = await getMenu(brand, decode(outlet));
  if (!menu) notFound();
  return <MenuView menu={menu} />;
}
