"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

type SavedShieldLink = {
  slug: string;
  shieldUrl: string;
  manageToken: string;
  destinationUrl: string;
  humanClicks: number;
  blockedBots: number;
  lastEventAt?: string | null;
};

const STORAGE_KEY = "mylinkscan_shield_links_v1";

export default function ShieldLinksPage() {
  const [destinationUrl, setDestinationUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [links, setLinks] = useState<SavedShieldLink[]>([]);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [refreshingSlug, setRefreshingSlug] = useState<string | null>(null);

  // Manual lookup fields
  const [lookupSlug, setLookupSlug] = useState("");
  const [lookupToken, setLookupToken] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setLinks(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  function persistLinks(updated: SavedShieldLink[]) {
    setLinks(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!destinationUrl.trim()) {
      setError("Please enter your website or landing page URL.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/shield-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create Shield Link.");
        return;
      }

      const newItem: SavedShieldLink = {
        slug: data.slug,
        shieldUrl: data.shieldUrl,
        manageToken: data.manageToken,
        destinationUrl: data.destinationUrl,
        humanClicks: Number(data.humanClicks || 0),
        blockedBots: Number(data.blockedBots || 0),
      };

      persistLinks([newItem, ...links.filter((l) => l.slug !== newItem.slug)]);
      setDestinationUrl("");
    } catch {
      setError("Network error while creating Shield Link.");
    } finally {
      setCreating(false);
    }
  }

  async function refreshStats(slug: string, manageToken: string) {
    setRefreshingSlug(slug);
    try {
      const res = await fetch(
        `/api/shield-links?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(manageToken)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const updated = links.map((item) =>
        item.slug === slug
          ? {
              ...item,
              shieldUrl: data.shieldUrl || item.shieldUrl,
              destinationUrl: data.destinationUrl || item.destinationUrl,
              humanClicks: Number(data.humanClicks || 0),
              blockedBots: Number(data.blockedBots || 0),
              lastEventAt: data.lastEventAt || null,
            }
          : item
      );
      persistLinks(updated);
    } finally {
      setRefreshingSlug(null);
    }
  }

  async function handleManualLookup(e: React.FormEvent) {
    e.preventDefault();
    setLookupError("");
    const cleanSlug = lookupSlug.trim().replace(/^.*\/go\//, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const cleanToken = lookupToken.trim();
    if (!cleanSlug || !cleanToken) {
      setLookupError("Enter both your Shield Link slug and Manage Token.");
      return;
    }

    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/shield-links?slug=${encodeURIComponent(cleanSlug)}&token=${encodeURIComponent(cleanToken)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error || "Shield Link not found.");
        return;
      }

      const found: SavedShieldLink = {
        slug: data.slug,
        shieldUrl: data.shieldUrl,
        manageToken: cleanToken,
        destinationUrl: data.destinationUrl,
        humanClicks: Number(data.humanClicks || 0),
        blockedBots: Number(data.blockedBots || 0),
        lastEventAt: data.lastEventAt || null,
      };

      persistLinks([found, ...links.filter((l) => l.slug !== found.slug)]);
      setLookupSlug("");
      setLookupToken("");
    } catch {
      setLookupError("Network error while looking up stats.");
    } finally {
      setLookupLoading(false);
    }
  }

  function copyText(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedSlug(key);
    setTimeout(() => setCopiedSlug(null), 1800);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Bar */}
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
              🛡️
            </span>
            <span className="text-lg tracking-tight">MyLinkscan</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-5 text-sm text-slate-300">
            <Link href="/" className="hover:text-emerald-400">
              URL &amp; File Scanner
            </Link>
            <Link href="/bot-shield" className="hover:text-emerald-400">
              Bot Shield
            </Link>
            <Link href="/shield-links" className="font-semibold text-emerald-400">
              Shield Links
            </Link>
            <Link href="/extension" className="hover:text-emerald-400">
              Chrome Extension
            </Link>
            <Link href="/how-it-works" className="hover:text-emerald-400">
              How It Works
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Bot &amp; Fake Traffic Filter
          </span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Protected Shield Links
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">
            Wrap your website or campaign URL in a MyLinkscan Shield Link. We filter out automated scrapers, CLI tools, and cloud datacenter bots before forwarding genuine human visitors.
          </p>
        </div>

        {/* Create Shield Link Box */}
        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <h2 className="text-lg font-semibold text-white">Create a New Protected Link</h2>
          <p className="mt-1 text-sm text-slate-400">
            Paste your real destination URL below. Share the generated <code className="text-emerald-400">/go/…</code> link in your bio, emails, or traffic campaigns.
          </p>

          <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creating}
              className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
            >
              {creating ? "Creating..." : "Generate Shield Link"}
            </button>
          </form>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </p>
          )}
        </section>

        {/* Active Shield Links & Stats */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Your Shield Links &amp; Live Traffic Stats</h2>
            <span className="text-xs text-slate-400">Saved in this browser</span>
          </div>

          {links.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center text-sm text-slate-400">
              No Shield Links created yet on this device. Generate your first protected link above!
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {links.map((item) => (
                <div
                  key={item.slug}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={item.shieldUrl}
                          target="_blank"
                          rel="noreferrer"
