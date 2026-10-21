import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeShell } from "@/components/ThemeShell";
import { QueryProvider } from "@/components/QueryProvider";
import { PWARegister } from "@/components/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Прогноз клёва",
  description: "Персональный прогноз клёва с поправками на месте для рыбака",
  applicationName: "Прогноз клёва",
  authors: [{ name: "Резниченко Сергей Иванович", url: "mailto:rezseriv@gmail.com" }],
  creator: "Резниченко Сергей Иванович",
  publisher: "Резниченко Сергей Иванович",
  copyright: "© 2026 Резниченко С. И.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Прогноз клёва",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1a3a2e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeShell>
          <QueryProvider>
            {children}
            <Toaster />
            <SonnerToaster />
            <PWARegister />
          </QueryProvider>
        </ThemeShell>
      </body>
    </html>
  );
}
