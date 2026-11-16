import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Privacy Policy", "See how MyLinkscan handles local file scans, submitted URLs, and contact messages.", "/privacy-policy");

export default function PrivacyPage() {
  return (
    <SitePage title="Privacy Policy" intro="Scanned files and folders never leave your browser. Live URL checks use the MyLinkscan server.">
      <h2>Scan inputs and results</h2>
      <p>The file and folder scanner processes file contents, names, folder paths, SHA-256 hashes, and results locally. It does not upload this information or store it in cookies or browser storage.</p>
      <h2>Submitted URLs</h2>
      <p>When you select Scan Now, your browser sends the URL to MyLinkscan. The server can resolve the hostname and request headers from the submitted URL and its redirect destinations. Those sites may log the requests. MyLinkscan compares URLs against a downloaded threat feed on our server. It does not submit your links to URLhaus. Avoid submitting URLs containing private tokens or personal information.</p>
      <h2>Site visits</h2>
      <p>Visiting the site sends standard web requests to load pages and site assets. Hosting infrastructure may process request information such as your IP address, browser information, and the pages requested. The current site code does not include analytics tags or advertising scripts.</p>
      <h2>Messages you send</h2>
      <p>The contact form prepares a draft in your email app. If you send the draft, your email provider transmits your address and message. We use messages to respond and investigate reported issues.</p>
      <h2>Privacy questions</h2>
      <p>Use the <Link href="/contact">contact page</Link> for questions about this policy or an email you sent.</p>
    </SitePage>
  );
}
