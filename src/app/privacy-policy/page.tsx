import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Privacy Policy", "See how MyLinkscan handles local file scans, submitted URLs, and contact messages.", "/privacy");

export default function PrivacyPage() {
  return (
    <SitePage title="Privacy Policy" intro="Scanned files and folders never leave your browser. Live URL checks use the MyLinkscan server.">
      <h2>Scan inputs and results</h2>
      <p>The file and folder scanner processes file contents, names, folder paths, SHA-256 hashes, and results locally. It does not upload this information or store it in cookies or browser storage.</p>
      <h2>Submitted URLs</h2>
      <p>When you select Scan Now, your browser sends the URL to MyLinkscan. The server can resolve the hostname and request headers from the submitted URL and its redirect destinations. Those sites may log the requests. When URLhaus is enabled, MyLinkscan sends the verified public URLs, including query strings and excluding fragments, to URLhaus for a threat lookup. Avoid submitting URLs containing private tokens or personal information.</p>
      <h2>Bot Shield</h2>
      <p>Opening Bot Shield runs a self-test. MyLinkscan reads request headers and sends the public IP detected by the hosting platform, or the public IP you enter, to ipwho.is for network information. Browser diagnostics such as WebDriver and WebGL are evaluated locally. A manually submitted User-Agent is checked by MyLinkscan.</p>
      <h2>Site visits</h2>
      <p>Visiting the site sends standard web requests to load pages and site assets. Hosting infrastructure may process request information such as your IP address, browser information, and the pages requested. The current site code does not include analytics tags or advertising scripts.</p>
      <h2>Messages you send</h2>
      <p>The contact form prepares a draft in your email app. If you send the draft, your email provider transmits your address and message. We use messages to respond and investigate reported issues.</p>
      <h2>Chrome Extension Privacy Policy</h2>
      <p>The extension reads the active tab URL when you select Scan Now or Protect Link without a pasted URL. It reads a right-clicked link only when you select Scan Link with MyLinkscan. It does not monitor browsing in the background, collect your browsing history, or sell user data.</p>
      <p>The extension sends submitted URLs over HTTPS to mylinkscan.com for scanning or Shield Link creation. MyLinkscan checks public scan URLs with URLhaus when enabled and may contact the destination to check its connection and redirects. Shield Link creation stores the destination so the link can redirect visitors.</p>
      <p>The extension saves your optional Pro license key and any saved extension settings on your device using chrome.storage.local. It sends the key over HTTPS to MyLinkscan to verify it or use Pro features. MyLinkscan may verify the license with its licensing provider. Select Clear in the popup to remove the local key.</p>
      <p>MyLinkscan’s use and transfer of information received from Chrome APIs adheres to the <a href="https://developer.chrome.com/docs/webstore/program-policies/user-data">Chrome Web Store User Data Policy</a>, including its Limited Use requirements. We use this information to provide the features described here and do not use it for personalized advertising.</p>
      <h2>Privacy questions</h2>
      <p>Use the <Link href="/contact">contact page</Link> for questions about this policy or an email you sent.</p>
    </SitePage>
  );
}
