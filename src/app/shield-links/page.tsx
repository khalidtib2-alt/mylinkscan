"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ShieldLinksGuide from "./guide";

type ShieldItem = {
  slug: string;
  shieldUrl: string;
  manageToken: string;
  destinationUrl: string;
  humanClicks: number;
  blockedBots: number;
};

const KEY = "mylinkscan_shield_links_v1";

export default function ShieldLinksPage() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState<ShieldItem[]>([]);
  const currentItems = useRef<ShieldItem[]>([]);
  const [copied, setCopied] = useState("");
  const [sIn, setSIn] = useState("");
  const [tIn, setTIn] = useState("");

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
          ? { ...item, humanClicks: data.humanClicks, blockedBots: data.blockedBots }
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl: url }),
      });
      const d = await r.json();
      if (!r.ok) return setErr(d.error || "Failed to create link.");
      save([d, ...currentItems.current.filter((x) => x.slug !== d.slug)]);
      setUrl("");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  function copy(val: string, id: string) {
    navigator.clipboard?.writeText(val);
    setCopied(id);
    setTimeout(() => setCopied(""), 1500);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-center text-3xl font-extrabold text-white">Protected Shield Links</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Wrap any link to block bots and datacenter scrapers while forwarding genuine human clicks.
        </p>

        <form onSubmit={onCreate} className="mt-6 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:flex-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourwebsite.com" className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white" />
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
                <div className="flex gap-2">
                  <button onClick={() => copy(it.shieldUrl, "u-" + it.slug)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs">{copied === "u-" + it.slug ? "Copied" : "Copy Link"}</button>
                  <button onClick={() => copy(it.manageToken, "t-" + it.slug)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs">{copied === "t-" + it.slug ? "Copied" : "Copy Token"}</button>
                  <button onClick={() => refresh(it.slug, it.manageToken)} className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">Refresh</button>
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
