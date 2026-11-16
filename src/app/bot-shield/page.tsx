import { pageMetadata, SitePage } from "../site-page";
import BotCheck from "./bot-check";

export const metadata = pageMetadata("Bot & Fake Traffic Shield", "Inspect browser automation signals and public IP hosting or ASN information.", "/bot-shield");

export default function BotShield() {
  return (
    <SitePage title="Bot & Fake Traffic Shield" intro="Check your browser and network for signs of automation or datacenter traffic.">
      <BotCheck />
      <p className="hint">These are diagnostic signals. A human can use a datacenter connection, and a Human verdict cannot establish who is behind a request. Public IPs are sent to ipwho.is for network lookup. Browser diagnostics stay on this page.</p>
    </SitePage>
  );
}
