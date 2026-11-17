export function FaqSection({ items }: { items: readonly { question: string; answer: string }[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <section className="mt-8" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="text-xl font-bold text-emerald-300">Frequently asked questions</h2>
      <div className="mt-4 grid gap-3">
        {items.map(({ question, answer }) => (
          <div key={question} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="font-semibold text-slate-100">{question}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{answer}</p>
          </div>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    </section>
  );
}
