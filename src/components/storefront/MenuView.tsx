"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { priceLine, type PricedLine } from "@/core/catalog/selection";
import { menuPricingConfig, resolveMenuProduct, startingPrice, type MenuPayload } from "@/core/catalog/storefront";
import { formatRupiah } from "@/core/money/format";
import { priceOrder } from "@/core/pricing/engine";
import { CartSheet, type CartRow } from "./CartSheet";
import { ProductImage } from "./ProductImage";
import { ProductSheet } from "./ProductSheet";
import { useCart } from "./useCart";

export function MenuView({ menu }: { menu: MenuPayload }) {
  const { items, ready, add, setQuantity } = useCart(menu.brand.slug, menu.outlet.code);
  const [openProductId, setOpenProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const byCategory = useMemo(
    () =>
      menu.categories
        .map((c) => ({ ...c, products: menu.products.filter((p) => p.categoryId === c.id) }))
        .filter((c) => c.products.length > 0),
    [menu],
  );

  // Harga keranjang selalu dihitung ulang dari menu terbaru (harga bisa berubah sejak ditambahkan).
  const { rows, order } = useMemo(() => {
    const priced: PricedLine[] = [];
    const rows: CartRow[] = items.map((item) => {
      const product = resolveMenuProduct(menu, item.productId);
      if (!product) {
        return { key: item.key, name: "Menu tidak tersedia", details: "", quantity: item.quantity, lineTotal: 0, problem: "Menu ini sudah tidak dijual di outlet ini." };
      }
      const result = priceLine(product, { productId: item.productId, quantity: item.quantity, optionIds: item.optionIds, note: item.note });
      if (!result.ok) {
        return { key: item.key, name: product.name, details: "", quantity: item.quantity, lineTotal: 0, problem: result.errors[0].message };
      }
      priced.push(result.line);
      return {
        key: item.key,
        name: result.line.name,
        details: result.line.options.map((o) => o.name).join(", "),
        note: result.line.note,
        quantity: item.quantity,
        lineTotal: result.line.unitPrice * item.quantity,
      };
    });
    return { rows, order: priceOrder(priced, menuPricingConfig(menu)) };
  }, [items, menu]);

  const openProduct = openProductId ? resolveMenuProduct(menu, openProductId) : null;
  const openMeta = openProductId ? menu.products.find((p) => p.id === openProductId) : undefined;
  const remaining = menu.brand.maxItemsPerOrder - order.itemCount;
  const closeProduct = useCallback(() => setOpenProductId(null), []);
  const closeCart = useCallback(() => setCartOpen(false), []);

  function jumpTo(categoryId: string) {
    document.getElementById(`kategori-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="flex flex-1 flex-col pb-28">
      <header className="px-5 pt-5 pb-3">
        <Link href={`/${menu.brand.slug}`} className="text-sm font-semibold text-ink-soft hover:text-ink">
          Ganti outlet
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span aria-hidden className="h-8 w-1.5 rounded-full" style={{ background: menu.brand.theme.accent ?? "var(--color-ink)" }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-soft">{menu.brand.name}</p>
            <h1 className="truncate text-xl font-extrabold tracking-tight">{menu.outlet.name}</h1>
          </div>
        </div>
        {menu.promos.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {menu.promos.map((p) => (
              <li key={p.id} className="rounded-md bg-hemat-soft px-2 py-0.5 text-xs font-semibold text-hemat">
                {p.name}
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <nav aria-label="Kategori menu" className="sticky top-0 z-20 border-y border-line bg-paper/95 backdrop-blur">
        <ul className="flex gap-2 overflow-x-auto px-5 py-2.5 [scrollbar-width:none]">
          {byCategory.map((c) => (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                onClick={() => jumpTo(c.id)}
                className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap hover:border-ink"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {byCategory.map((category) => (
        <section key={category.id} id={`kategori-${category.id}`} className="scroll-mt-14" aria-labelledby={`judul-${category.id}`}>
          <h2 id={`judul-${category.id}`} className="px-5 pt-6 pb-1 text-lg font-bold">
            {category.name}
          </h2>
          <ul>
            {category.products.map((product) => {
              const soldOut = product.status === "sold_out";
              const price = startingPrice(menu, product);
              const hasChoice = product.optionGroupIds.some((gid) =>
                menu.optionGroups[gid]?.options.some((o) => (product.optionDeltas[o.id] ?? o.priceDelta) > 0),
              );
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    disabled={soldOut}
                    onClick={() => setOpenProductId(product.id)}
                    className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-mist active:bg-mist disabled:cursor-not-allowed"
                  >
                    <ProductImage src={product.imageUrl} name={product.name} className={`size-20 shrink-0 rounded-2xl ${soldOut ? "opacity-40 grayscale" : ""}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block font-semibold ${soldOut ? "text-ink-faint" : ""}`}>{product.name}</span>
                      {product.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{product.description}</span>
                      ) : null}
                      <span className="mt-1 block text-sm">
                        {soldOut ? (
                          <span className="font-semibold text-ink-faint">Habis di outlet ini</span>
                        ) : (
                          <span className="price font-semibold">
                            {hasChoice ? "mulai " : ""}
                            {formatRupiah(price)}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {toast ? (
        <p role="status" className="fixed inset-x-0 bottom-24 z-30 mx-auto w-fit max-w-[90%] rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper">
          {toast}
        </p>
      ) : null}

      {ready && order.itemCount > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-3.5 text-left text-paper shadow-lg"
          >
            <span>
              <span className="block font-semibold">Lihat pesanan ({order.itemCount} item)</span>
              {order.savings > 0 ? (
                <span className="block text-sm text-marigold">Hemat {formatRupiah(order.savings)}</span>
              ) : null}
            </span>
            <span className="price text-lg font-bold">{formatRupiah(order.total)}</span>
          </button>
        </div>
      ) : null}

      {openProduct ? (
        <ProductSheet
          key={openProduct.id}
          product={openProduct}
          imageUrl={openMeta?.imageUrl}
          description={openMeta?.description}
          maxQuantity={Math.max(0, remaining)}
          onClose={closeProduct}
          onAdd={(selection) => {
            add({ productId: openProduct.id, ...selection });
            setOpenProductId(null);
            setToast(`${openProduct.name} ditambahkan`);
            setTimeout(() => setToast(null), 1800);
          }}
        />
      ) : null}

      {cartOpen ? (
        <CartSheet
          outletName={menu.outlet.name}
          rows={rows}
          order={order}
          maxItems={menu.brand.maxItemsPerOrder}
          onQuantity={setQuantity}
          onClose={closeCart}
        />
      ) : null}
    </main>
  );
}
