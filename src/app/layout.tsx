import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/layout/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "台股爆發預警系統 (TSBS)",
  description: "監測台股中具備短期內爆發性成長特徵的股票",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TSBS",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-50 antialiased selection:bg-blue-500/30`}>
        <Providers>
          <main className="min-h-screen pb-20">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
