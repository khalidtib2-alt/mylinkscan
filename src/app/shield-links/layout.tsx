import type { ReactNode } from "react";
import { pageMetadata } from "../site-page";

export const metadata = pageMetadata(
  "Protected Shield Links for Bot & Fake Click Filtering",
  "Create free protected links for your website or campaign. Filter suspected scraper and datacenter traffic and track human clicks and blocked bots.",
  "/shield-links",
);

export default function ShieldLinksLayout({ children }: { children: ReactNode }) {
  return children;
}
