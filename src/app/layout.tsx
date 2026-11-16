import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const title = "MyLinkscan — Scan Links, Files & Folders Before You Open Them";
const description = "100% private local analysis for links, files, and folders. Your files never leave your device.";

export const metadata: Metadata = {
  title,
  description,
  applicationName: "MyLinkscan",
  openGraph: { title, description, type: "website", siteName: "MyLinkscan" },
  twitter: { card: "summary", title, description },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
