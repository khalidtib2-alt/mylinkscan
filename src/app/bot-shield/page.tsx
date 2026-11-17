import Link from "next/link";
import { FaqSection } from "../faq-section";
import { pageMetadata, SitePage } from "../site-page";
import BotCheck from "./bot-check";

const faqs = [
  { question: "What does the Bot Shield Trust Score measure?", answer: "It summarizes the browser, request, and network signals available to the self-test. A low score points to suspicious signals, while a high score cannot verify that a visitor is human." },
  { question: "Why might my browser be flagged as suspicious?", answer: "A hosting network, a software renderer, or missing language information can contribute to a suspicious result. Check the signal breakdown to see what affected your score." },
  { question: "Can I check an IP address or User-Agent manually?", answer: "Yes. Paste a public IPv4 or IPv6 address to check network information, or paste a User-Agent to look for common automation markers." },
];

export const metadata = pageMetadata("Bot & Fake Traffic Shield", "Inspect browser automation signals and public IP hosting or ASN information.", "/bot-shield");

export default function BotShield() {
  return (
    <SitePage title="Bot & Fake Traffic Shield" intro="Check your browser and network for signs of automation or datacenter traffic.">
      <BotCheck />
      <p className="hint">These are diagnostic signals. A human can use a datacenter connection, and a Human verdict cannot establish who is behind a request. Public IPs are sent to ipwho.is for network lookup. Browser diagnostics stay on this page.</p>
      <section className="mt-8 rounded-2xl border border-emerald-800 bg-emerald-950/50 p-5">
        <h2>Filter automated clicks with Shield Links</h2>
        <p>Create a protected link for your website or campaign to filter suspected bots and see how many requests were blocked.</p>
        <Link className="mt-4 inline-flex rounded-lg border border-emerald-600 bg-emerald-950 px-4 py-2 font-semibold hover:bg-emerald-900" href="/shield-links">Create a free Protected Shield Link</Link>
      </section>
      <section className="mt-8 border-t border-slate-700 pt-4" aria-labelledby="bot-signals-heading">
        <h2 id="bot-signals-heading" className="text-emerald-300">Common Bot &amp; Scraper Signals Detected</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li><strong>User-Agent markers.</strong> Command-line tools, scraper frameworks, and headless browsers may identify themselves in this header.</li>
          <li><strong>Browser inconsistencies.</strong> The self-test looks at WebDriver, language settings, unusual screen and viewport dimensions, and software WebGL rendering.</li>
          <li><strong>Hosting networks.</strong> ISP and ASN information can indicate that a public IP belongs to a cloud or datacenter provider.</li>
        </ul>
      </section>
      <FaqSection items={faqs} />
    </SitePage>
  );
}
