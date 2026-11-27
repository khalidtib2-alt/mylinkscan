import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Bot Shield Case Study: Filtering Pop & Redirect Traffic Before CPA Offers",
  description: "A transparent, audit-ready workflow for reviewing pop and redirect traffic by zone before it reaches a CPA offer.",
  alternates: { canonical: "/case-study" },
  openGraph: {
    title: "Bot Shield Case Study: Filtering Pop & Redirect Traffic Before CPA Offers",
    description: "See how a Shield Link can separate human visits from blocked automation across traffic zones.",
    url: "/case-study",
    type: "article",
  },
};

const steps = [
  { title: "Traffic Source", text: "Launch a small, controlled campaign and pass each source or placement ID through a zone parameter such as `zone=123` or `website_id=123`." },
  { title: "MyLinkscan Shield Link", text: "Place a Shield Link between the traffic source and your tracker. Incoming query parameters are forwarded to the destination, while MyLinkscan records human and blocked-bot counts by zone." },
  { title: "Tracker / Offer", text: "Send qualified visits to your tracker or CPA offer. Keep the tracker’s click ID and attribution parameters in the destination URL so conversion reporting remains connected." },
  { title: "Cutting High-Bot Zones", text: "Compare zone-level human visits and bot-block rates with downstream tracker results. Pause or investigate zones using your own thresholds and offer rules." },
];

export default function CaseStudyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 sm:py-16">
      <article className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">Pop &amp; redirect traffic workflow</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight text-white sm:text-5xl">Bot Shield Case Study: Filtering Pop &amp; Redirect Traffic Before CPA Offers</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">A practical audit template for media buyers who want to inspect placement quality before sending traffic into a CPA funnel. The workflow preserves attribution parameters and makes zone-level bot counts visible.</p>

        <section aria-labelledby="workflow-title" className="mt-10">
          <h2 id="workflow-title" className="text-2xl font-bold text-white">The 4-step workflow</h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {steps.map((step, index) => <li key={step.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Step {index + 1}</p><h3 className="mt-2 text-lg font-bold text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{step.text}</p></li>)}
          </ol>
        </section>

        <section aria-labelledby="audit-title" className="mt-10 rounded-2xl border border-emerald-900 bg-emerald-950/20 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-300">Live-ready audit card</p><h2 id="audit-title" className="mt-2 text-2xl font-bold text-white">$30 PopAds test — results pending</h2></div><span className="rounded-full border border-amber-700 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-200">Template · not measured results</span></div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">This card is structured for a small $30 test. No impression, click, conversion, or bot-rate figures are being claimed until campaign and tracker exports are added.</p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[["Test budget", "$30 planned"], ["Campaign dates", "Add run dates"], ["PopAds clicks", "Awaiting source export"], ["Human visits", "Awaiting Shield Link stats"], ["Blocked bots", "Awaiting Shield Link stats"], ["CPA conversions / spend", "Awaiting tracker export"]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-semibold text-slate-100">{value}</dd></div>)}
          </dl>
          <p className="mt-4 text-xs leading-5 text-slate-500">For a defensible comparison, record the campaign date range, zone IDs, tracker click totals, conversions, spend, and any attribution window. Compare the same date range across each export.</p>
        </section>

        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-white">Start with zone-level tracking</h2>
          <p className="mt-2 text-slate-300">Create a Shield Link, add a zone ID to each placement URL, and review human visits versus blocked bots before changing campaign spend.</p>
          <Link href="/shield-links" className="mt-5 inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-bold text-slate-950 hover:bg-emerald-300">Create a Protected Shield Link</Link>
        </section>
      </article>
    </main>
  );
}
