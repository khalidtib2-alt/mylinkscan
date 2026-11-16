import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Chrome Extension", "Install the MyLinkscan Chrome extension to check your current tab or scan a link from the context menu.", "/extension");

export default function ExtensionPage() {
  return (
    <SitePage title="MyLinkscan Chrome Extension" intro="Check the page you’re on or scan a link from the right-click menu before opening it.">
      <h2>Install from source</h2>
      <ol>
        <li>Download or clone the <a href="https://github.com/khalidtib2-alt/mylinkscan">MyLinkscan repository</a>. If you download a ZIP, extract it first.</li>
        <li>Open <code>chrome://extensions</code> in Chrome and switch on <strong>Developer mode</strong>.</li>
        <li>Choose <strong>Load unpacked</strong>, then select the <code>chrome-extension</code> folder. Pin MyLinkscan from Chrome’s Extensions menu for quick access.</li>
      </ol>
      <h2>Scan a page or a link</h2>
      <p>Open the toolbar popup to scan the current web page automatically. To check another link, paste it into the popup and select <strong>Scan Now</strong>. Choose <strong>Open full report in a new tab</strong> for detailed results.</p>
      <p>To check a link without opening it in your browser, right-click the link and choose <strong>Scan Link with MyLinkscan</strong>. The web scanner opens and runs the check.</p>
      <h2>Permissions and privacy</h2>
      <p>Chrome grants temporary access to the active tab when you invoke the extension. The extension also registers the link menu and contacts the MyLinkscan scanner endpoint. Live checks send the URL to MyLinkscan and may share it with URLhaus. Avoid scanning URLs with private access tokens or personal information.</p>
      <p><Link href="/#scanner">Open the web scanner</Link></p>
    </SitePage>
  );
}
