import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";
import BotCheck from "./bot-check";

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
    </SitePage>
  );
}
