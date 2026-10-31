import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/components/ui/design-system.css";

const roboto = localFont({
  src: [
    { path: "./fonts/Roboto.ttf", weight: "100 900", style: "normal" },
    { path: "./fonts/Roboto-Italic.ttf", weight: "100 900", style: "italic" },
  ],
  variable: "--font-roboto",
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
    <html lang="en" className={roboto.variable}>
      <body>{children}</body>
    </html>
  );
}
