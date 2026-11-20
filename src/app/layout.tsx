import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jasdor", template: "%s | Jasdor" },
  description: "Jasa order kopi dan teh favorit, lebih hemat. Ambil sendiri di outlet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#17233b",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper shadow-[0_0_0_1px_var(--color-line)]">
          {children}
        </div>
      </body>
    </html>
  );
}
