import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  metadataBase: new URL("https://rentflow-kadz.vercel.app"),
  title: {
    default: "RentFlow — Rent ledger & receipts",
    template: "%s · RentFlow",
  },
  description:
    "Simple, trustworthy rent tracking, receipts and statements for landlords in Kenya & East Africa.",
  applicationName: "RentFlow",
  // Google Search Console verification (renders the google-site-verification meta tag).
  verification: {
    google: "D9h8qRAfBDA-dhJpE62MgpcCPE4_zqwb3daEgi5VQB0",
  },
  openGraph: {
    type: "website",
    siteName: "RentFlow",
    title: "RentFlow — Rent ledger & receipts",
    description:
      "Simple, trustworthy rent tracking, receipts and statements for landlords.",
    url: "https://rentflow-kadz.vercel.app",
    images: [{ url: "/rentflow.png", width: 512, height: 512, alt: "RentFlow" }],
  },
  twitter: {
    card: "summary",
    title: "RentFlow — Rent ledger & receipts",
    description: "Simple, trustworthy rent tracking, receipts and statements for landlords.",
    images: ["/rentflow.png"],
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
