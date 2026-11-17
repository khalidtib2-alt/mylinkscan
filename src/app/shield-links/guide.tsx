import { FaqSection } from "../faq-section";

const steps = [
  { title: "Wrap Your URL", text: "Paste your destination, such as a product page or campaign landing page, to create a Protected Shield Link." },
  { title: "Share Anywhere", text: "Copy your Shield Link for emails, social posts, or placements that accept redirect links. Keep your Manage Token private." },
  { title: "Filter Datacenter & Scraper Bots", text: "MyLinkscan screens each request for automation and hosting-network signals before sending accepted visitors to your destination." },
];

const faqs = [
  { question: "How does a Shield Link block fake bot clicks?", answer: "It checks signals such as scraper User-Agents, missing browser headers, and known hosting networks. Requests flagged by those checks receive a blocked page. Some bots can pass, and some legitimate visitors may be flagged." },
  { question: "Will real human visitors see a CAPTCHA or delay?", answer: "Shield Links uses no CAPTCHA. Accepted visitors are redirected after server-side checks, so a network lookup can add a brief delay." },
  { question: "Can I track human clicks vs. blocked bots?", answer: "Yes. The dashboard shows how many requests were forwarded and how many were blocked. Use your slug and Manage Token to load the counts on another browser." },
  { question: "Is Protected Shield Links free to use?", answer: "Yes. You can create a Protected Shield Link and view its click counts for free." },
];

export default function ShieldLinksGuide() {
  return (
    <div className="mt-12 border-t border-slate-800 pt-8">
      <section aria-labelledby="shield-links-guide-heading">
        <h2 id="shield-links-guide-heading" className="text-xl font-bold text-emerald-300">How Protected Shield Links Work</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map(({ title, text }) => (
            <li key={title} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <h3 className="font-semibold text-slate-100">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <FaqSection items={faqs} />
    </div>
  );
}
