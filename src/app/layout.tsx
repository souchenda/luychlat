import type { Metadata, Viewport } from "next"
import { Geist_Mono, Kantumruy_Pro } from "next/font/google"

import { Providers } from "@/components/providers"

import "./globals.css"

// Kantumruy Pro covers both Khmer and Latin glyphs.
const kantumruy = Kantumruy_Pro({
  variable: "--font-sans",
  subsets: ["khmer", "latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "លុយឆ្លាត · LuyChlat",
  description: "គ្រប់គ្រងលុយ និងបំណុល ផ្ទាល់ខ្លួន និងអាជីវកម្ម",
  applicationName: "LuyChlat",
  appleWebApp: { capable: true, title: "លុយឆ្លាត", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
  // Older iOS Safari only reads the apple-prefixed tag for standalone mode.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km" className={`${kantumruy.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
