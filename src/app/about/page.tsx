import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("About", "Learn why MyLinkscan checks links, files, and folders privately in your browser.", "/about");

export default function AboutPage() {
  return (
    <SitePage title="About MyLinkscan" intro="MyLinkscan helps you pause and examine an unfamiliar link or download before opening it.">
      <h2>What we check</h2>
      <p>The URL scanner examines the text of a link. The file and folder scanners look for recognizable headers and script markers and compute file fingerprints where supported. All scan processing takes place in your browser.</p>
      <h2>How to use the results</h2>
      <p>Use a finding as a reason to verify a sender or investigate further. A file can still be harmful when the scanner finds no warning. See <Link href="/how-it-works">How It Works</Link> for the checks and their limits.</p>
      <h2>Get in touch</h2>
      <p>Use the <Link href="/contact">contact page</Link> to report a problem or share feedback.</p>
    </SitePage>
  );
}
