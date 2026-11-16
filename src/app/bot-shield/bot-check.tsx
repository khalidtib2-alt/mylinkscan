"use client";

import { useEffect, useState } from "react";
import { scoreSignals, type BotReport, type Signal } from "./signals";

function browserSignals(): Signal[] {
  let renderer = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl) renderer = String(gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) ?? "");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { /* WebGL may be disabled. */ }
  const software = /swiftshader|llvmpipe|software rasterizer/i.test(renderer);
  const languages = navigator.languages ?? [];
  const viewport = window.innerWidth + " × " + window.innerHeight;
  const inconsistent = screen.width <= 0 || screen.height <= 0 || window.innerWidth <= 0 || window.innerHeight <= 0 ||
    (window.outerWidth > 0 && window.innerWidth > window.outerWidth + 100) ||
    (window.outerHeight > 0 && window.innerHeight > window.outerHeight + 100);
  return [
    { label: "WebDriver", detail: navigator.webdriver === undefined ? "Unavailable" : navigator.webdriver ? "Automation reported" : "Automation flag is off", penalty: navigator.webdriver ? 65 : 0 },
    { label: "Plugins", detail: navigator.plugins ? String(navigator.plugins.length) : "Unavailable", penalty: 0 },
    { label: "Browser languages", detail: languages.join(", ") || "Unavailable", penalty: languages.length ? 0 : 8 },
    { label: "Screen / viewport", detail: screen.width + " × " + screen.height + " / " + viewport + (inconsistent ? " · unusual dimensions" : ""), penalty: inconsistent ? 12 : 0 },
    { label: "WebGL renderer", detail: renderer || "Unavailable", penalty: software ? 20 : 0 },
  ];
}

async function fetchSignals(signal?: AbortSignal, body?: object): Promise<Signal[]> {
  const response = await fetch("/api/bot-check", {
    signal, cache: "no-store",
    ...(body && { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Check unavailable.");
  return (result as BotReport).signals;
}

function Report({ signals }: { signals: Signal[] }) {
  const { score, verdict } = scoreSignals(signals);
  const unavailable = signals.every(({ label, detail }) => detail === "Unavailable" || label === "Public IP");
  return (
    <div className="result">
      <p className="font-semibold text-emerald-300">{unavailable ? "Insufficient data for a verdict" : `Trust Score ${score}/100 · ${verdict}`}</p>
      <dl className="mt-3 grid gap-2">
        {signals.map(({ label, detail, penalty }) => (
          <div className="border-b border-slate-700 pb-2" key={label}>
            <dt className="font-semibold">{label}</dt><dd>{detail}{penalty ? ` (−${penalty} points)` : ""}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function BotCheck() {
  const [self, setSelf] = useState<Signal[]>();
  const [pending, setPending] = useState(true);
  const [mode, setMode] = useState<"ip" | "userAgent">("ip");
  const [input, setInput] = useState("");
  const [manual, setManual] = useState<Signal[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const local = browserSignals();
    setSelf(local);
    function finish(signals: Signal[]) {
      if (controller.signal.aborted) return;
      setSelf([...local, ...signals]);
      setPending(false);
    }
    void fetchSignals(controller.signal).then(finish, () => finish([{ label: "Server diagnostics", detail: "Unavailable", penalty: 0 }]));
    return () => controller.abort();
  }, []);

  return (
    <>
      <h2>Am I a Bot?</h2>
      {pending && <p role="status">Checking browser and network signals…</p>}
      {self && <Report signals={self} />}
      <h2>Inspect an IP or User-Agent</h2>
      <form className="contact-form" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setManual(undefined);
        setError("");
        try { setManual(await fetchSignals(undefined, { [mode]: input.trim() })); }
        catch (error) { setError(error instanceof Error ? error.message : "Check unavailable."); }
        finally { setBusy(false); }
      }}>
        <fieldset className="flex flex-wrap gap-4" disabled={busy}>
          <legend className="sr-only">Input type</legend>
          <label><input type="radio" name="check-type" checked={mode === "ip"} onChange={() => { setMode("ip"); setInput(""); setManual(undefined); setError(""); }} /> IP address</label>
          <label><input type="radio" name="check-type" checked={mode === "userAgent"} onChange={() => { setMode("userAgent"); setInput(""); setManual(undefined); setError(""); }} /> User-Agent</label>
        </fieldset>
        <label htmlFor="manual-check">{mode === "ip" ? "Public IPv4 or IPv6 address" : "User-Agent string"}</label>
        <input id="manual-check" disabled={busy} value={input} onChange={(event) => { setInput(event.target.value); setManual(undefined); setError(""); }} required maxLength={mode === "ip" ? 45 : 1024} spellCheck={false} autoComplete="off" />
        <button className="primary" disabled={busy} type="submit">{busy ? "Checking…" : "Check"}</button>
      </form>
      <div aria-live="polite">{error && <p className="text-amber-300">{error}</p>}{manual && <Report signals={manual} />}</div>
    </>
  );
}
