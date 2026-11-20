/** Kolom sempit ala aplikasi ponsel untuk semua halaman customer. Panel admin punya layout sendiri. */
export default function TokoLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
      {children}
    </div>
  );
}
