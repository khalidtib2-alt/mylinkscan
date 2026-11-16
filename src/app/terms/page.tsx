import Link from "next/link";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Terms of Use", "Read the terms for using MyLinkscan and the limits of its browser-based results.", "/terms");

export default function TermsPage() {
  return (
    <SitePage title="Terms of Use" intro="These terms apply when you use the MyLinkscan website and scanner.">
      <h2>Using the scanner</h2>
      <p>Use the site lawfully and only inspect files and folders you are authorized to access. Do not interfere with the website or other people’s use of it.</p>
      <h2>Interpreting results</h2>
      <p>MyLinkscan provides informational results based on a limited set of checks. It may flag legitimate inputs or miss harmful ones. You are responsible for deciding whether to open a link or file. The service is provided as available, without a guarantee of accuracy, uninterrupted access, or suitability for any particular use.</p>
      <h2>Changes and questions</h2>
      <p>We may update the scanner and these terms as the site evolves. If you have questions, visit the <Link href="/contact">contact page</Link>. See the <Link href="/privacy-policy">Privacy Policy</Link> for details about scan inputs and messages.</p>
    </SitePage>
  );
}
