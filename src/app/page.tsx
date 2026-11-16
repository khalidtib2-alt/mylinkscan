"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileSearch, FolderOpen, Link2, LockKeyhole, Puzzle, ScanLine, ShieldCheck, UploadCloud } from "lucide-react";
import { scanFile, scanUrl, type FileResult } from "./checks";
import type { UrlReport } from "./url-report";

const tabs = [
  { label: "URL Scanner", icon: Link2 },
  { label: "Scan File", icon: FileSearch },
  { label: "Scan Folder", icon: FolderOpen },
];

const features = [
  { id: "links", title: "Instant Link Threat Check", description: "See instant phishing heuristics, then check DNS, TLS, redirects, and URLhaus listings.", icon: ScanLine },
  { id: "files", title: "Local File & Folder Inspection", description: "Fingerprint files with SHA-256 and look for executable headers or script markers directly in your browser.", icon: FolderOpen },
  { id: "extension", title: "Free Chrome Extension", description: "Check your current tab or scan any web link from Chrome’s right-click menu.", icon: Puzzle, href: "/extension" },
];

export default function Home() {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState("");
  const [urlResult, setUrlResult] = useState<ReturnType<typeof scanUrl>>();
  const [urlError, setUrlError] = useState("");
  const [report, setReport] = useState<UrlReport>();
  const [checking, setChecking] = useState(false);
  const currentScan = useRef<AbortController | null>(null);
  const [files, setFiles] = useState<FileResult[]>([]);
  const [fileTab, setFileTab] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inspectUrl = useCallback(async (value: string) => {
    currentScan.current?.abort();
    const controller = new AbortController();
    currentScan.current = controller;
    setUrlResult(undefined);
    setReport(undefined);
    setUrlError("");
    try {
      if (value.length > 2048) throw new Error("Enter a URL up to 2,048 characters.");
      setUrlResult(scanUrl(value));
    } catch (error) {
      setChecking(false);
      setUrlError(error instanceof TypeError ? "Enter a valid HTTP or HTTPS URL." : (error as Error).message);
      return;
    }
    setChecking(true);
    try {
      const response = await fetch("/api/scan-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (!controller.signal.aborted) setReport(result as UrlReport);
    } catch (error) {
      if (!controller.signal.aborted) {
        setUrlError(error instanceof Error && error.name === "Error" ? error.message : "Live checks are unavailable. Local findings are shown below.");
      }
    } finally {
      if (!controller.signal.aborted) setChecking(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const destination = params.get("url");
    const scan = params.get("scan");
    if (destination !== null || scan === "url" || scan === "file") {
      setTab(destination === null && scan === "file" ? 1 : 0);
      document.getElementById("scanner")?.scrollIntoView();
    }
    if (destination !== null) {
      setUrl(destination);
      const timer = window.setTimeout(() => void inspectUrl(destination), 0);
      return () => {
        window.clearTimeout(timer);
        currentScan.current?.abort();
      };
    }
  }, [inspectUrl]);

  async function inspect(selection: File[]) {
    if (!selection.length || busy) return;
    setFileTab(tab);
    setBusy(true);
    setTotal(selection.length);
    setFiles([]);
    const results: FileResult[] = [];
    try {
      for (const file of selection) {
        results.push(await scanFile(file));
        if (results.length % 25 === 0) setFiles([...results]);
      }
    } finally {
      setFiles(results);
      setBusy(false);
    }
  }

  return (
      <main>
        <section className="hero mx-auto max-w-5xl px-5 text-center">
          <span className="hero-icon"><ShieldCheck size={32} strokeWidth={1.7} /></span>
          <h1>Scan Links, Files &amp; Folders <span>Before You Open Them</span></h1>
          <p className="subtitle">Live Link Checks. Your Files and Folders Never Leave Your Device.</p>
          <section id="scanner" className="scanner mx-auto text-left" aria-label="Scanner">
            <div className="tabs" role="group" aria-label="Scan type">
              {tabs.map(({ label, icon: Icon }, index) => (
                <button key={label} type="button" aria-pressed={tab === index} onClick={() => setTab(index)}><Icon size={18} />{label}</button>
              ))}
            </div>
            <div className="scan-body">
              {tab === 0 ? (
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void inspectUrl(url);
                }}>
                  <label className="input-label" htmlFor="scan-url">URL to inspect</label>
                  <div className="url-row">
                    <div className="url-box"><Link2 size={19} /><input id="scan-url" type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://example.com" value={url} maxLength={2048} onChange={(event) => {
                      currentScan.current?.abort();
                      setUrl(event.target.value);
                      setUrlResult(undefined);
                      setUrlError("");
                      setReport(undefined);
                      setChecking(false);
                    }} required /></div>
                    <button type="submit" className="primary" disabled={checking}>Scan Now <ArrowRight size={17} /></button>
                  </div>
                  <p className="hint">Scan Now sends the URL to MyLinkscan for live checks and may share it with URLhaus. Leave out links containing passwords, private tokens, or personal information.</p>
                  <div aria-live="polite">
                    {checking && <p className="hint">Checking DNS, redirects, TLS, and the threat feed…</p>}
                    {urlError && <p className="result text-amber-300">{urlError}</p>}
                    {urlResult && !report && <div className="result">
                      <strong className="break-all">{urlResult.host}</strong>
                      {urlResult.assumedHttps && <p className="hint">HTTPS was assumed because no scheme was provided.</p>}
                      {urlResult.warnings.length ? <ul className="mt-2 list-disc pl-5 text-amber-300">{urlResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="mt-2 text-emerald-300">No configured URL signals found. This does not establish that the link is safe.</p>}
                    </div>}
                    {report && <section aria-label="Security Report Card" className="result space-y-3">
                      <h2 className="text-lg font-bold">Security Report Card</h2>
                      <p><strong>Overall Risk Verdict:</strong> <span className={report.verdict === "High Risk" ? "text-red-300" : report.verdict === "Caution" ? "text-amber-300" : "text-emerald-300"}>{report.verdict}</span></p>
                      <p className="hint">The verdict reflects the available checks. Even a Safe result cannot guarantee a link is safe.</p>
                      {report.issue && <p className="text-amber-300">{report.issue}</p>}
                      <p className="break-all"><strong>Final Destination URL:</strong> {report.finalUrl ?? "Not confirmed"}</p>
                      <h3 className="font-semibold">Redirect Hops, DNS/IP &amp; HTTPS Status</h3>
                      {report.hops.length ? <ol className="space-y-2">
                        {report.hops.map((hop, index) => <li key={hop.url} className="break-all rounded-md border border-slate-700 p-2">
                          <p>{index === 0 ? "Starting URL" : "Redirect " + index}: {hop.url}</p>
                          <p className="hint">{hop.addresses.length ? "IP: " + hop.addresses.join(", ") : "No public IP verified"} · {hop.https}{hop.status ? " · HTTP " + hop.status : ""}</p>
                        </li>)}
                      </ol> : <p className="hint">No destinations were contacted.</p>}
                      <p><strong>URLhaus Threat Feed:</strong> {report.feed}</p>
                      {report.feed === "Unavailable" && <p className="hint">The verdict reflects the other checks. URLhaus could not confirm a match.</p>}
                      <h3 className="font-semibold">Heuristic Findings</h3>
                      {[...new Set([...(urlResult?.warnings ?? []), ...report.findings])].length
                        ? <ul className="list-disc pl-5 text-amber-300">{[...new Set([...(urlResult?.warnings ?? []), ...report.findings])].map((warning) => <li key={warning}>{warning}</li>)}</ul>
                        : <p className="hint">No configured URL signals found.</p>}
                    </section>}
                  </div>
                </form>
              ) : (
                <>
                  <label className={dragging ? "drop dragging" : "drop"} onDragOver={tab === 1 ? (event) => { event.preventDefault(); setDragging(true); } : undefined} onDragLeave={() => setDragging(false)} onDrop={tab === 1 ? (event) => {
                    event.preventDefault();
                    setDragging(false);
                    const [file] = event.dataTransfer.files;
                    if (file) void inspect([file]);
                  } : undefined}>
                    <UploadCloud size={28} />
                    <span>{tab === 1 ? "Drop a file here or choose a file" : "Choose a folder to inspect"}</span>
                    <input key={tab} type="file" className="sr-only" disabled={busy} ref={(input) => {
                      if (input && tab === 2) input.setAttribute("webkitdirectory", "");
                    }} onChange={(event) => { void inspect(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
                  </label>
                  <p className="hint">{tab === 2 ? "Includes files in subfolders. " : ""}SHA-256 hashing is limited to 128 MB per file.</p>
                  <p className="hint" role="status">{busy && fileTab !== tab ? "A scan is running in the other file tab." : total > 0 && fileTab === tab && (busy ? `Scanning ${files.length} of ${total} files…` : `Inspected ${files.length} of ${total} files. ${files.filter((file) => file.warning).length} flagged.`)}</p>
                  {fileTab === tab && files.length > 0 && <ul className="file-results">{files.map((file, index) => <li className="result" key={index}>
                    <strong className="break-all">{file.name}</strong>
                    <p>{file.type}</p>
                    {file.warning && <p className="text-amber-300">{file.warning}</p>}
                    {file.hash && <p className="hint break-all">SHA-256 <code>{file.hash}</code></p>}
                    {file.error && <p className="text-amber-300">{file.error}</p>}
                  </li>)}</ul>}
                </>
              )}
            </div>
            <div className="privacy"><LockKeyhole size={15} /> {tab === 0 ? "Instant checks run locally. Live checks use the server." : "File and folder scans run on this device. No uploads."}</div>
          </section>
        </section>
        <section id="how-it-works" aria-label="How it works" className="features mx-auto max-w-5xl px-5">
          {features.map(({ id, title, description, icon: Icon, href }) => {
            const content = <><span className="feature-icon"><Icon size={21} /></span><h2>{title}</h2><p>{description}</p></>;
            return href ? <Link id={id} className="feature hover:border-emerald-400/60" key={id} href={href}>{content}</Link>
              : <article id={id} className="feature" key={id}>{content}</article>;
          })}
        </section>
        <p className="scope mx-auto max-w-5xl px-5">Results cover a limited set of checks. File scans do not perform antivirus checks or inspect archive contents.</p>
      </main>
  );
}
