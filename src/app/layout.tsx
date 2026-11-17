import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { scannerLinks, siteUrl, trustLinks } from "./site";
import "./globals.css";

const title = "MyLinkscan — Scan Links, Files & Folders Before You Open Them";
const description = "Check links with live DNS, TLS, redirects, and threat intelligence. Inspect files and folders locally on your device.";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: title, template: "%s | MyLinkscan" },
  alternates: { canonical: "/" },
  description,
  applicationName: "MyLinkscan",
  verification: { google: "aLwwZpZhLlUEgoU5uykrNyH0WSXVLXE30FYwc2ZIlqU" },
  openGraph: { title, description, type: "website", siteName: "MyLinkscan" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <header className="site-header">
          <div className="nav-wrap">
            <Link className="brand" href="/" aria-label="MyLinkscan home">
              <span className="brand-icon"><ShieldCheck size={24} aria-hidden="true" /></span>
              MyLinkscan
            </Link>
            <nav aria-label="Main navigation">
              {scannerLinks.map(({ href, label }) => <a href={href} key={href}>{label}</a>)}
              <Link href="/how-it-works">How It Works</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="nav-wrap">
            <Link href="/" className="footer-brand">MyLinkscan</Link>
            <nav aria-label="Footer navigation">
              {trustLinks.map(({ href, label }) => <Link href={href} key={href}>{label}</Link>)}
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
