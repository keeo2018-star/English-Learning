import type { Metadata } from "next";
import "./globals.css";
import "@/components/ui/design-system.css";
export const metadata: Metadata = {
  title: "Wordbook · English Learning",
  description: "Collect words. Build a daily practice.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
