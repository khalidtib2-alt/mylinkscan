import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Privacy Policy", "See how MyLinkscan processes scan inputs locally and handles messages you choose to send.", "/privacy-policy");

export default function PrivacyPage() {
  return (
    <SitePage title="Privacy Policy" intro="Scanned files and folders never leave your browser. MyLinkscan performs scans on your device.">
      <h2>Scan inputs and results</h2>
      <p>The scanner processes file contents, names, folder paths, SHA-256 hashes, and scan results locally. It does not upload this information or store it in cookies or browser storage. Pasted URLs are analyzed as text and are not sent to a server or opened by the scanner.</p>
      <h2>Site visits</h2>
      <p>Visiting the site sends standard web requests to load pages and site assets. Hosting infrastructure may process request information such as your IP address, browser information, and the pages requested. The current site code does not include analytics tags or advertising scripts.</p>
      <h2>Messages you send</h2>
      <p>The contact form prepares a draft in your email app. If you send the draft, your email provider transmits your address and message. We use messages to respond and investigate reported issues.</p>
      <h2>Privacy questions</h2>
      <p>Use the <Link href="/contact">contact page</Link> for questions about this policy or an email you sent.</p>
    </SitePage>
  );
}
