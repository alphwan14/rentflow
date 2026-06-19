import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RentFlow Kenya — Digital Rent Ledger & SMS Receipts for Landlords",
    template: "%s · RentFlow",
  },
  description:
    "RentFlow is a simple digital rent ledger and receipt system for landlords and caretakers in Kenya — Mombasa, Nairobi and across East Africa. Track rent, send SMS receipts, and manage arrears and advance payments.",
  applicationName: "RentFlow",
  keywords: [
    "RentFlow",
    "rentflow",
    "rentflow kenya",
    "rentflow mombasa",
    "rent mombasa",
    "rent management kenya",
    "rent tracking kenya",
    "digital rent receipts",
    "sms rent receipts",
    "mpesa rent receipts",
    "rent ledger",
    "landlord app kenya",
    "caretaker rent app",
    "rent arrears",
    "advance rent payment",
  ],
  category: "finance",
  alternates: { canonical: "/" },
  // Google Search Console verification (renders the google-site-verification meta tag).
  verification: {
    google: "D9h8qRAfBDA-dhJpE62MgpcCPE4_zqwb3daEgi5VQB0",
  },
  openGraph: {
    type: "website",
    siteName: "RentFlow",
    locale: "en_KE",
    title: "RentFlow Kenya — Digital Rent Ledger & SMS Receipts for Landlords",
    description:
      "Track rent, send SMS receipts, and manage arrears and advance payments. Built for landlords and caretakers in Mombasa, Nairobi and across Kenya.",
    url: SITE_URL,
    images: [{ url: "/rentflow.png", width: 512, height: 512, alt: "RentFlow" }],
  },
  twitter: {
    card: "summary",
    title: "RentFlow Kenya — Digital Rent Ledger & SMS Receipts",
    description: "Rent tracking, SMS receipts and statements for landlords in Kenya.",
    images: ["/rentflow.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};
// Favicon / Apple touch icon are provided by the file conventions
// src/app/icon.png and src/app/apple-icon.png (auto-detected by Next.js).

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
