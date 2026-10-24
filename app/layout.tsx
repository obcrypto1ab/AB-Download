import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";

import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap"
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "AB Download — Your Media. Your Quality. Your Control.",
  description:
    "Preview your media, explore available quality options, and save authorized videos with a clean, effortless workflow.",
  applicationName: "AB Download",
  openGraph: {
    title: "AB Download",
    description: "Your Media. Your Quality. Your Control.",
    siteName: "AB Download",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#080A12",
  width: "device-width",
  initialScale: 1
};

/** Applies the persisted theme before first paint to avoid a flash. */
const themeInitScript = `
try {
  var t = localStorage.getItem("ab-theme");
  document.documentElement.dataset.theme = t === "light" ? "light" : "dark";
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
