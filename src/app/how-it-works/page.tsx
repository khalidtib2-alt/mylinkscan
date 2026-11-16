import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("How MyLinkscan Works", "Learn how MyLinkscan checks URLs, hashes files locally with SHA-256, and flags disguised downloads.", "/how-it-works");

export default function HowItWorksPage() {
  return (
    <SitePage title="How MyLinkscan Works" intro="File and folder scans stay on your device. Submitting a URL adds live checks from our server.">
      <h2>URL checks</h2>
      <p>Your browser parses the URL without opening it and flags signals such as plain HTTP, IP-based URLs, long links, and names that resemble common brands. Our server resolves public addresses, checks TLS, and follows up to five redirects using HTTP headers. When available, it compares the submitted URL and observed destinations against a recent URLhaus malware list. These checks can miss harmful links, and legitimate links can trigger warnings.</p>
      <h2>SHA-256 fingerprints</h2>
      <p>Your browser reads the selected file and computes its SHA-256 fingerprint using the Web Crypto API. You can compare the fingerprint against a checksum published by a trusted source for the exact same download. The scanner hashes files up to 128 MB on HTTPS or localhost. Larger files still get a header check.</p>
      <h2>File headers and spoofed extensions</h2>
      <p>Magic bytes are recognizable values at the beginning of some file formats. MyLinkscan looks for signatures such as the Windows MZ executable header, plus selected text markers used by scripts. If a file named like a photo carries an executable header, the scanner flags the mismatch. It also flags common executable and script extensions. A recognized document header cannot establish that the rest of the file is safe.</p>
      <h2>Folder inspection</h2>
      <p>The folder picker gives the browser access to the files in the selected folder and its subfolders. The scanner processes those files individually and shows their relative paths and findings. Archive contents remain outside the scan.</p>
      <h2>Spotting phishing links and disguised .exe files</h2>
      <ol>
        <li>Preview or copy the destination without opening it. Read the full hostname and watch for misspellings or a familiar brand embedded in someone else’s domain.</li>
        <li>If a message asks you to sign in, pay, or act urgently, open the organization’s official site yourself. Confirm the request through contact information you already trust.</li>
        <li>Turn on <strong>File name extensions</strong> in Windows File Explorer. A name such as <code>invoice.pdf.exe</code> ends in <code>.exe</code> and should be treated as an executable. Leave unexpected attachments unopened and verify them through a known channel.</li>
      </ol>
      <p>See the <a href="https://consumer.ftc.gov/articles/how-recognize-and-avoid-phishing-scams">FTC’s phishing guide</a> for more examples and reporting steps.</p>
      <p><Link href="/#scanner">Open the scanner</Link></p>
    </SitePage>
  );
}
