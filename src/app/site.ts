export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://mylinkscan.com");
export const contactEmail = "support.mylinkscan@gmail.com";

export const trustLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/extension", label: "Chrome Extension" },
  { href: "/bot-shield", label: "Bot Shield" },
];

export const scannerLinks = [
  { href: "/?scan=url", label: "URL Scanner" },
  { href: "/?scan=file", label: "File & Folder Scan" },
  { href: "/extension", label: "Chrome Extension" },
  { href: "/bot-shield", label: "Bot Shield" },
  { href: "/shield-links", label: "Shield Links" },
];
