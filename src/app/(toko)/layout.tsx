/** Kolom sempit ala aplikasi ponsel untuk semua halaman customer. Panel admin punya layout sendiri. */
export default function TokoLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="toko mx-auto flex min-h-dvh w-full max-w-[480px] flex-col border-x-[2.5px] border-ink bg-paper">
      {children}
    </div>
  );
}
