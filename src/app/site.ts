export const siteUrl = new URL(process.env.SITE_URL ?? "https://mylinkscan.com");
export const contactEmail = process.env.CONTACT_EMAIL ?? "support@mylinkscan.com";

export const trustLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/extension", label: "Chrome Extension" },
];

export const scannerLinks = [
  { href: "/?scan=url", label: "URL Scanner" },
  { href: "/?scan=file", label: "File & Folder Scan" },
  { href: "/extension", label: "Chrome Extension" },
];
