import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PakistanCraft — Voxel Sandbox",
  description: "An original voxel sandbox set across Pakistan. Explore Lahore's Badshahi Mosque, Minar-e-Pakistan, Shalimar Gardens and more. Build, mine, and craft your corner of the homeland.",
  keywords: ["PakistanCraft", "voxel", "sandbox", "Pakistan", "Lahore", "Three.js", "block game"],
  authors: [{ name: "PakistanCraft" }],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#01411C",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground overscroll-none`}
        style={{ touchAction: "none" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
