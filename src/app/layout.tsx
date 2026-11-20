import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fredoka";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Jasdor", template: "%s | Jasdor" },
  description: "Jasa order kopi dan teh favorit, lebih hemat. Ambil sendiri di outlet.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f3e8d0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">
        {children}
      </body>
    </html>
  );
}
