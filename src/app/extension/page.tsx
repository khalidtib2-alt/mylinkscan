import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Chrome Extension", "Scan links and create Protected Shield Links from the MyLinkscan Chrome toolbar.", "/extension");

export default function ExtensionPage() {
  return (
    <SitePage title="MyLinkscan Chrome Extension" intro="Scan links and create Protected Shield Links from your browser toolbar.">
      <h2>Install from source</h2>
      <ol>
        <li>Download or clone the <a href="https://github.com/khalidtib2-alt/mylinkscan">MyLinkscan repository</a>. If you download a ZIP, extract it first.</li>
        <li>Open <code>chrome://extensions</code> in Chrome and switch on <strong>Developer mode</strong>.</li>
        <li>Choose <strong>Load unpacked</strong>, then select the <code>chrome-extension</code> folder. Pin MyLinkscan from Chrome’s Extensions menu for quick access.</li>
      </ol>
      <h2>Scan a page or a link</h2>
      <p>Open the toolbar popup and select <strong>Scan Now</strong> to check the current tab, or paste another link first. Choose <strong>Open full report in a new tab</strong> for detailed results.</p>
      <p>To check a link without opening it in your browser, right-click the link and choose <strong>Scan Link with MyLinkscan</strong>. The web scanner opens and runs the check.</p>
      <h2>Create a Protected Shield Link in one click</h2>
      <p>Open the toolbar popup and select <strong>Protect Link (Shield Link)</strong> to protect the current tab or a pasted URL. Pro users can save a license under <strong>Pro Key</strong> and enter an optional custom slug before creating the link. Select <strong>Copy Shield Link</strong> to share it.</p>
      <p>Copy your private Manage Token before closing the popup. Select <strong>View live Human vs. Bot stats</strong> and enter the token and the slug at the end of your Shield Link to load its counts. Share only the Shield Link.</p>
      <h2>Permissions and privacy</h2>
      <p>Chrome grants temporary access to the active tab when you invoke the extension. The extension also registers the link menu and contacts the MyLinkscan scanner endpoint. Live checks send the URL to MyLinkscan and may share it with URLhaus. Avoid scanning URLs with private access tokens or personal information.</p>
      <p>Creating a Shield Link sends the destination to MyLinkscan so the service can store it and redirect visitors.</p>
      <p><Link href="/#scanner">Open the web scanner</Link></p>
    </SitePage>
  );
}
