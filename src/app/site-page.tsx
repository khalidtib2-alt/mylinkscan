import type { Metadata } from "next";
import type { ReactNode } from "react";

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const socialTitle = title + " | MyLinkscan";
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title: socialTitle, description, url: path, type: "website", siteName: "MyLinkscan" },
    twitter: { card: "summary", title: socialTitle, description },
  };
}

export function SitePage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="info-page">
      <h1>{title}</h1>
      <p className="info-intro">{intro}</p>
      <div className="info-content">{children}</div>
    </main>
  );
}
