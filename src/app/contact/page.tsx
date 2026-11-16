import ContactForm from "./contact-form";
import { contactEmail } from "../site";
import { pageMetadata, SitePage } from "../site-page";

export const metadata = pageMetadata("Contact", "Contact MyLinkscan about scanner results, accessibility, or site feedback.", "/contact");

export default function ContactPage() {
  return (
    <SitePage title="Contact" intro="Send feedback, report a site issue, or ask about a scan result.">
      <p>Email <a href={"mailto:" + contactEmail}>{contactEmail}</a> or prepare a draft below. Describe the issue in your own words and leave out sensitive URLs, attachments, and personal information.</p>
      <ContactForm email={contactEmail} />
    </SitePage>
  );
}
