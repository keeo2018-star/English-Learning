import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/components/ui/design-system.css";

const afacadFlux = localFont({
  src: "./fonts/AfacadFlux.ttf",
  variable: "--font-afacad-flux",
  weight: "100 1000",
  style: "normal",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Wordbook · English Learning",
  description: "Collect words. Build a daily practice.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={afacadFlux.variable}>
      <body>{children}</body>
    </html>
  );
}
