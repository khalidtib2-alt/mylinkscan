"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ShieldLinksGuide from "./guide";

type ShieldItem = {
  slug: string;
  shieldUrl: string;
  manageToken: string;
  destinationUrl: string;
  humanClicks: number;
  blockedBots: number;
  topZones?: { zoneId: string; humanHits: number; blockedBots: number; totalHits: number; botRate: number; lastBlockReason?: string | null }[];
  highBotZoneIds?: string[];
};

const KEY = "mylinkscan_shield_links_v1";
const PRO_KEY = "mylinkscan_pro_key";

export default function ShieldLinksPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<ShieldItem[]>([]);
  const currentItems = useRef<ShieldItem[]>([]);
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [sIn, setSIn] = useState("");
  const [tIn, setTIn] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [proKey, setProKey] = useState("");
  const [licenseInput, setLicenseInput] = useState("");
  const [licenseError, setLicenseError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [cryptoPlan, setCryptoPlan] = useState<"month" | "year">("month");
  const [cryptoNetwork, setCryptoNetwork] = useState<"polygon" | "tron">("polygon");
  const [cryptoAsset, setCryptoAsset] = useState<"USDC" | "USDT">("USDC");
  const [cryptoEmail, setCryptoEmail] = useState("");
  const [txHash, setTxHash] = useState("");
  const [cryptoBusy, setCryptoBusy] = useState(false);
  const [cryptoMessage, setCryptoMessage] = useState("");
  const [issuedKey, setIssuedKey] = useState("");
  const upgradeDialog = useRef<HTMLDialogElement>(null);
  const checkout = process.env.NEXT_PUBLIC_PRO_CHECKOUT_URL;
  const cryptoWallet = cryptoNetwork === "polygon" ? process.env.NEXT_PUBLIC_CRYPTO_POLYGON_ADDRESS : process.env.NEXT_PUBLIC_CRYPTO_TRON_ADDRESS;

  useEffect(() => {
    const controller = new AbortController();
    try {
      const saved = localStorage.getItem(PRO_KEY);
      if (saved) {
        void fetch("/api/pro/verify", { method: "POST", headers: { "x-pro-key": saved }, signal: controller.signal })
          .then((response) => { if (response.ok && !controller.signal.aborted) setProKey(saved); })
          .catch(() => {});
      }
    } catch {}
    return () => controller.abort();
  }, []);

  async function activate(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setLicenseError("");
    try {
      const key = licenseInput.trim();
      const response = await fetch("/api/pro/verify", { method: "POST", headers: { "x-pro-key": key } });
      if (!response.ok) return setLicenseError("This Pro key could not be verified.");
      setProKey(key);
      try { localStorage.setItem(PRO_KEY, key); } catch {}
      setLicenseInput("");
      upgradeDialog.current?.close();
    } catch {
      setLicenseError("License verification is temporarily unavailable.");
    } finally {
      setVerifying(false);
    }
  }

  async function submitCrypto(e: React.FormEvent) {
    e.preventDefault();
    setCryptoBusy(true);
    setCryptoMessage("");
    setIssuedKey("");
    try {
      const response = await fetch("/api/pro/crypto-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cryptoEmail, network: cryptoNetwork, asset: cryptoAsset, plan: cryptoPlan, txHash }),
      });
      const data = await response.json();
      if (!response.ok && response.status !== 422) throw new Error(data.error || "Could not submit the transaction.");
      setCryptoMessage(data.message || data.error || "Order submitted.");
      if (data.licenseKey) {
        setIssuedKey(data.licenseKey);
        setProKey(data.licenseKey);
        try { localStorage.setItem(PRO_KEY, data.licenseKey); } catch {}
      }
    } catch (error) {
      setCryptoMessage(error instanceof Error ? error.message : "Transaction submission failed.");
    } finally {
      setCryptoBusy(false);
    }
  }

  async function downloadCsv(item: ShieldItem) {
    if (!proKey) return upgradeDialog.current?.showModal();
    setErr("");
    try {
      const response = await fetch("/api/shield-links/" + encodeURIComponent(item.slug) + "/export", {
        headers: { "x-pro-key": proKey, "x-manage-token": item.manageToken },
      });
      if (!response.ok) {
        const data = await response.json();
        return setErr(data.error || "CSV export failed.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = "shield-" + item.slug + ".csv";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      setErr("CSV export is temporarily unavailable.");
    }
  }

  const save = useCallback((next: ShieldItem[]) => {
    currentItems.current = next;
    setItems(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const refresh = useCallback(async (slug: string, token: string, signal?: AbortSignal) => {
    try {
      const params = new URLSearchParams({ slug, token });
      const response = await fetch("/api/shield-links?" + params, { cache: "no-store", signal });
      if (!response.ok) return;
      const data = await response.json();
      if (signal?.aborted) return;
      const latest = currentItems.current;
      if (signal) {
        save(latest.map((item) => item.slug === slug && item.manageToken === token
          ? { ...item, humanClicks: data.humanClicks, blockedBots: data.blockedBots, topZones: data.topZones || [], highBotZoneIds: data.highBotZoneIds || [] }
          : item));
      } else {
        save([{ ...data, manageToken: token }, ...latest.filter((item) => item.slug !== slug)]);
      }
    } catch {
      // Keep the last saved counts when the network is unavailable.
    }
  }, [save]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(saved)) save(saved);
    } catch {}

    let controller: AbortController | undefined;
    function refreshSaved() {
      controller?.abort();
      const { signal } = (controller = new AbortController());
      for (const item of currentItems.current) {
        if (item?.slug && item.manageToken) void refresh(item.slug, item.manageToken, signal);
      }
    }

    refreshSaved();
    window.addEventListener("focus", refreshSaved);
    return () => {
      controller?.abort();
      window.removeEventListener("focus", refreshSaved);
    };
  }, [refresh, save]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/shield-links", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(proKey && { "x-pro-key": proKey }) },
        body: JSON.stringify({ destinationUrl: url, ...(proKey && customSlug && { customSlug }) }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error || "Failed to create link.");
      save([d, ...currentItems.current.filter((x) => x.slug !== d.slug)]);
      setUrl("");
      setCustomSlug("");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  function copy(val: string, id: string) {
    setCopyError("");
    void navigator.clipboard?.writeText(val).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(""), 1500);
    }).catch(() => setCopyError("Clipboard access is unavailable in this browser."));
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-center text-3xl font-extrabold text-white">Protected Shield Links</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Wrap any link to block bots and datacenter scrapers while forwarding genuine human clicks.
        </p>

        <section aria-label="Shield Links plans" className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-bold">Free</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-300"><li>3 active links</li><li>Random slug, like /go/abc1234</li><li>Live Human vs. Bot counters</li></ul>
          </div>
          <div className="rounded-2xl border border-emerald-700 bg-emerald-950/40 p-5">
            <h2 className="font-bold text-emerald-300">Pro · $9/mo</h2>
            <ul className="mt-2 space-y-1 text-sm text-slate-300"><li>Unlimited links</li><li>Custom slugs, like /go/your-brand</li><li>One-click CSV export</li></ul>
            {proKey ? <p className="mt-3 text-sm text-emerald-300">Pro is active</p> : <button type="button" className="mt-3 text-sm font-semibold text-emerald-300 underline" onClick={() => upgradeDialog.current?.showModal()}>Activate Pro Key / Upgrade</button>}
          </div>
        </section>

        <section aria-labelledby="traffic-stack-title" className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">For media buyers</p>
          <h2 id="traffic-stack-title" className="mt-1 text-lg font-bold text-white">Recommended Traffic &amp; Tracking Stack</h2>
          <p className="mt-1 text-sm text-slate-400">Use a traffic source and tracker to compare placements, then route traffic through a Shield Link to measure human visits and blocked automation by zone.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              { name: "PopAds", role: "Pop traffic source", href: process.env.NEXT_PUBLIC_AFFILIATE_POPADS_URL || "https://www.popads.net/" },
              { name: "BeMob", role: "Campaign tracker", href: process.env.NEXT_PUBLIC_AFFILIATE_BEMOB_URL || "https://bemob.com/" },
              { name: "RedTrack", role: "Ad tracking platform", href: process.env.NEXT_PUBLIC_AFFILIATE_REDTRACK_URL || "https://www.redtrack.io/" },
            ].map((tool) => <a key={tool.name} href={tool.href} target="_blank" rel="noopener noreferrer sponsored" className="rounded-xl border border-slate-700 bg-slate-950/70 p-4 transition hover:border-emerald-700"><span className="block font-semibold text-white">{tool.name}</span><span className="mt-1 block text-xs text-slate-400">{tool.role}</span><span className="mt-3 block text-xs text-emerald-300">Visit website →</span></a>)}
          </div>
          <p className="mt-3 text-xs text-slate-500">Affiliate disclosure: Some links may be tracked partner links. MyLinkscan may earn a commission if you sign up through one, at no extra cost to you.</p>
        </section>

        <dialog ref={upgradeDialog} aria-labelledby="pro-dialog-title" className="m-auto max-h-[90vh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 text-slate-100 backdrop:bg-black/70">
          <div className="flex items-center justify-between gap-3">
            <h2 id="pro-dialog-title" className="text-lg font-bold">Activate Pro Key / Upgrade ($9/mo)</h2>
            <button type="button" className="text-sm text-slate-300" onClick={() => upgradeDialog.current?.close()}>Close</button>
          </div>
          {checkout ? <a className="mt-3 inline-block rounded-xl bg-emerald-400 px-4 py-3 font-bold text-slate-950" href={checkout} target="_blank" rel="noopener noreferrer">Pay with Card / Apple Pay (Creem)</a>
            : <div className="mt-3"><button type="button" disabled className="rounded-xl bg-emerald-400/40 px-4 py-3 font-bold text-slate-950/70">Pay with Card / Apple Pay (Creem)</button><p className="mt-2 text-xs text-slate-400">Card checkout is not configured yet. You can activate a key or pay directly with crypto below.</p></div>}
          <form onSubmit={activate} className="mt-4 grid gap-2">
            <label htmlFor="pro-license">License key</label>
            <input id="pro-license" type="password" required maxLength={256} value={licenseInput} onChange={(e) => setLicenseInput(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2" />
            {licenseError && <p role="alert" className="text-sm text-rose-300">{licenseError}</p>}
            <button disabled={verifying} className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950">{verifying ? "Verifying…" : "Activate Pro Key"}</button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-700" />OR PAY DIRECTLY<span className="h-px flex-1 bg-slate-700" /></div>
          <section className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
            <h3 className="font-bold text-white">Pay Direct with Crypto <span className="text-emerald-300">(USDC / USDT)</span></h3>
            <p className="mt-1 text-xs text-amber-200">Network warning: only send the selected token on the selected network. Unsupported transfers may be unrecoverable.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Plan<select value={cryptoPlan} onChange={(e) => setCryptoPlan(e.target.value as "month" | "year")} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm"><option value="month">$9 / month</option><option value="year">$90 / year</option></select></label>
              <label className="text-xs text-slate-300">Network<select value={cryptoNetwork} onChange={(e) => { const next = e.target.value as "polygon" | "tron"; setCryptoNetwork(next); setCryptoAsset(next === "tron" ? "USDT" : "USDC"); }} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm"><option value="polygon">Polygon PoS</option><option value="tron">Tron TRC-20</option></select></label>
            </div>
            <label className="mt-3 block text-xs text-slate-300">Token<select value={cryptoAsset} onChange={(e) => setCryptoAsset(e.target.value as "USDC" | "USDT")} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm">{cryptoNetwork === "polygon" ? <><option value="USDC">Native USDC</option><option value="USDT">USDT0 on Polygon</option></> : <><option value="USDT">USDT (TRC-20)</option><option value="USDC" disabled>USDC (legacy — unsupported)</option></>}</select></label>
            {cryptoNetwork === "tron" && <p className="mt-2 text-xs text-slate-400">Circle discontinued USDC support on Tron. Use Tron USDT, or choose Polygon for native USDC.</p>}
            <div className="mt-3 rounded-lg border border-slate-700 p-3"><div className="flex items-center justify-between gap-2"><span className="text-xs text-slate-400">Send to {cryptoNetwork === "polygon" ? "Polygon" : "Tron"} address</span>{cryptoWallet && <button type="button" onClick={() => copy(cryptoWallet, "crypto-wallet")} className="rounded bg-slate-800 px-2 py-1 text-xs text-emerald-200">{copied === "crypto-wallet" ? "Copied" : "Copy address"}</button>}</div><code className="mt-2 block break-all text-xs text-white">{cryptoWallet || "Wallet address is not configured yet."}</code></div>
            <form onSubmit={submitCrypto} className="mt-3 grid gap-2">
              <label className="text-xs text-slate-300" htmlFor="crypto-email">Customer email</label><input id="crypto-email" required type="email" value={cryptoEmail} onChange={(e) => setCryptoEmail(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" placeholder="you@example.com" />
              <label className="text-xs text-slate-300" htmlFor="crypto-txhash">Transaction Hash</label><input id="crypto-txhash" required value={txHash} onChange={(e) => setTxHash(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs" placeholder={cryptoNetwork === "polygon" ? "0x…" : "Tron transaction ID"} />
              <button disabled={cryptoBusy || !cryptoWallet} className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold disabled:opacity-50">{cryptoBusy ? "Checking transaction…" : "Submit transaction hash"}</button>
            </form>
            {cryptoMessage && <p role="status" className="mt-3 break-all text-sm text-amber-200">{cryptoMessage}</p>}
            {issuedKey && <div className="mt-3 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3"><p className="text-sm font-bold text-emerald-200">Your Pro key</p><code className="mt-2 block break-all text-xs">{issuedKey}</code><button type="button" onClick={() => copy(issuedKey, "issued-pro-key")} className="mt-2 rounded bg-emerald-500 px-3 py-1 text-xs font-bold text-slate-950">{copied === "issued-pro-key" ? "Copied" : "Copy key"}</button></div>}
          </section>
        </dialog>

        <form onSubmit={onCreate} className="mt-6 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <label htmlFor="destination-url" className="text-sm font-semibold">Destination URL</label>
          <input id="destination-url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourwebsite.com" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white" />
          <div className="flex items-center gap-2">
            <label htmlFor="custom-slug" className="text-sm font-semibold">Custom Slug <span className="font-normal text-slate-400">(optional)</span></label>
            <button type="button" onClick={() => upgradeDialog.current?.showModal()} className="rounded bg-emerald-900 px-2 py-1 text-xs font-bold text-emerald-200">PRO</button>
          </div>
          <input id="custom-slug" disabled={!proKey} value={customSlug} onChange={(e) => setCustomSlug(e.target.value)} maxLength={32} minLength={3} pattern="[a-z0-9][a-z0-9\-]{1,30}[a-z0-9]" placeholder="your-brand" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm disabled:opacity-60" />
          <button disabled={busy} className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
            {busy ? "Creating..." : "Create Shield Link"}
          </button>
        </form>
        {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}

        <div className="mt-8 space-y-4">
          {items.map((it) => (
            <div key={it.slug} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono text-sm text-emerald-400">{it.shieldUrl}</span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => copy(it.shieldUrl, "u-" + it.slug)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs">{copied === "u-" + it.slug ? "Copied" : "Copy Link"}</button>
                  <button onClick={() => copy(it.manageToken, "t-" + it.slug)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs">{copied === "t-" + it.slug ? "Copied" : "Copy Token"}</button>
                  <button onClick={() => refresh(it.slug, it.manageToken)} className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">Refresh</button>
                  <button onClick={() => void downloadCsv(it)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs">Download CSV</button>
                </div>
              </div>
              <p className="mt-1 truncate text-xs text-slate-400">Target: {it.destinationUrl} (Slug: {it.slug})</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-emerald-500/10 p-3">
                  <div className="text-xs text-slate-400">Human Clicks</div>
                  <div className="text-2xl font-bold text-emerald-400">{it.humanClicks}</div>
                </div>
                <div className="rounded-xl bg-rose-500/10 p-3">
                  <div className="text-xs text-slate-400">Bots Blocked</div>
                  <div className="text-2xl font-bold text-rose-400">{it.blockedBots}</div>
                </div>
              </div>
              <section aria-label={`Top zones for ${it.slug}`} className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-white">Top Traffic Zones (website_id)</h3><button type="button" disabled={!it.highBotZoneIds?.length} onClick={() => copy((it.highBotZoneIds || []).join(", "), "high-zones-" + it.slug)} className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 disabled:cursor-not-allowed disabled:opacity-40">{copied === "high-zones-" + it.slug ? "Copied high-bot zones" : "Copy High-Bot Zones (>60% bots)"}</button></div>
                {it.topZones?.length ? <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-xs"><thead className="text-slate-500"><tr><th className="py-2 pr-3 font-medium">Zone ID</th><th className="py-2 pr-3 font-medium">Total Hits</th><th className="py-2 pr-3 font-medium">Human Passed</th><th className="py-2 font-medium">Bots Blocked (%)</th></tr></thead><tbody className="divide-y divide-slate-800">{it.topZones.map((zone) => <tr key={zone.zoneId}><td className="max-w-44 break-all py-2 pr-3 font-mono text-slate-200">{zone.zoneId}</td><td className="py-2 pr-3">{zone.totalHits}</td><td className="py-2 pr-3 text-emerald-300">{zone.humanHits}</td><td className="py-2 text-rose-300">{zone.blockedBots} ({zone.botRate.toFixed(1)}%)</td></tr>)}</tbody></table>{it.topZones.some((zone) => zone.lastBlockReason) && <p className="mt-2 text-[11px] text-slate-500">Latest block signal: {it.topZones.find((zone) => zone.lastBlockReason)?.lastBlockReason?.replaceAll("_", " ")}</p>}</div> : <p className="mt-1 text-xs text-slate-500">No zone-tagged visits recorded yet. Add `website_id`, `zone_id`, `source_id`, or `subid` to your Shield Link traffic.</p>}
                {copyError && <p role="status" className="mt-2 text-xs text-amber-300">{copyError}</p>}
              </section>
            </div>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); if (sIn && tIn) refresh(sIn.trim(), tIn.trim()); }} className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 sm:grid-cols-3">
          <input value={sIn} onChange={(e) => setSIn(e.target.value)} placeholder="Slug" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <input value={tIn} onChange={(e) => setTIn(e.target.value)} placeholder="Manage Token" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm" />
          <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-emerald-400">Load Stats</button>
        </form>
        <ShieldLinksGuide />
      </main>
    </div>
  );
}
