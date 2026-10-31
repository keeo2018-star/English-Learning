import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PwaRegistration } from "@/components/ui/pwa-registration";
import { KnockoutControls } from "@/components/ui/knockout-controls";
import "./globals.css";
import "@/components/ui/design-system.css";
import "../../public/interaction-policy.css";

const roboto = localFont({
  src: [
    { path: "./fonts/Roboto.ttf", weight: "100 900", style: "normal" },
    { path: "./fonts/Roboto-Italic.ttf", weight: "100 900", style: "italic" },
  ],
  variable: "--font-roboto",
  display: "swap",
});
export const metadata: Metadata = {
  title: "English Learning",
  applicationName: "English Learning",
  other: { "apple-mobile-web-app-capable": "yes" },
  appleWebApp: {
    capable: true, title: "English", statusBarStyle: "default",
    startupImage: [
      { url: "/icons/apple-splash-375x812-3.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/apple-splash-390x844-3.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/apple-splash-393x852-3.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/apple-splash-430x932-3.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" },
      { url: "/icons/apple-splash-375x667-2.png", media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" },
    ],
  },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
  description: "Collect words. Build a daily practice.",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#f5f4ef",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>{children}<KnockoutControls /><PwaRegistration /></body>
    </html>
  );
}
