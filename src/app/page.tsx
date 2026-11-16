"use client";

import { useState } from "react";
import { ArrowRight, FileSearch, FolderOpen, Link2, LockKeyhole, Puzzle, ScanLine, ShieldCheck, UploadCloud } from "lucide-react";
import { scanFile, scanUrl, type FileResult } from "./checks";

const tabs = [
  { label: "URL Scanner", icon: Link2 },
  { label: "Scan File", icon: FileSearch },
  { label: "Scan Folder", icon: FolderOpen },
];

const features = [
  { id: "links", title: "Instant Link Threat Check", description: "Check a URL for common phishing signals, suspicious domains, and unencrypted connections without visiting it.", icon: ScanLine },
  { id: "files", title: "Local File & Folder Inspection", description: "Fingerprint files with SHA-256 and look for executable headers or script markers directly in your browser.", icon: FolderOpen },
  { id: "extension", title: "Free Chrome Extension", description: "The Chrome extension is not available yet. You can check links here in the meantime.", icon: Puzzle },
];

export default function Home() {
  const [tab, setTab] = useState(0);
  const [url, setUrl] = useState("");
  const [urlResult, setUrlResult] = useState<ReturnType<typeof scanUrl>>();
  const [urlError, setUrlError] = useState("");
  const [files, setFiles] = useState<FileResult[]>([]);
  const [fileTab, setFileTab] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

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
    <>
      <header className="site-header">
        <div className="nav-wrap">
          <a className="brand" href="#" aria-label="MyLinkscan home"><span className="brand-icon"><ShieldCheck size={24} /></span>MyLinkscan</a>
          <nav aria-label="Main navigation">
            <a href="#scanner" onClick={() => setTab(0)}>URL Scanner</a>
            <a href="#scanner" onClick={() => setTab(1)}>File &amp; Folder Scan</a>
            <a href="#extension">Chrome Extension</a>
            <a href="#how-it-works">How It Works</a>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero mx-auto max-w-5xl px-5 text-center">
          <span className="hero-icon"><ShieldCheck size={32} strokeWidth={1.7} /></span>
          <h1>Scan Links, Files &amp; Folders <span>Before You Open Them</span></h1>
          <p className="subtitle">100% Private Local Analysis — Your Files Never Leave Your Device</p>
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
                  setUrlResult(undefined);
                  setUrlError("");
                  try { setUrlResult(scanUrl(url)); }
                  catch (error) { setUrlError(error instanceof TypeError ? "Enter a valid HTTP or HTTPS URL." : (error as Error).message); }
                }}>
                  <label className="input-label" htmlFor="scan-url">URL to inspect</label>
                  <div className="url-row">
                    <div className="url-box"><Link2 size={19} /><input id="scan-url" type="text" inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://example.com" value={url} onChange={(event) => { setUrl(event.target.value); setUrlResult(undefined); setUrlError(""); }} required /></div>
                    <button type="submit" className="primary">Scan Now <ArrowRight size={17} /></button>
                  </div>
                  <p className="hint">Paste a link to check its structure. The scanner never opens the URL.</p>
                  <div aria-live="polite">
                    {urlError && <p className="result text-amber-300">{urlError}</p>}
                    {urlResult && <div className="result">
                      <strong className="break-all">{urlResult.host}</strong>
                      {urlResult.assumedHttps && <p className="hint">HTTPS was assumed because no scheme was provided.</p>}
                      {urlResult.warnings.length ? <ul className="mt-2 list-disc pl-5 text-amber-300">{urlResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p className="mt-2 text-emerald-300">No configured URL signals found. This does not establish that the link is safe.</p>}
                    </div>}
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
            <div className="privacy"><LockKeyhole size={15} /> All scans run on this device. No uploads.</div>
          </section>
        </section>
        <section id="how-it-works" aria-label="How it works" className="features mx-auto max-w-5xl px-5">
          {features.map(({ id, title, description, icon: Icon }) => <article id={id} className="feature" key={id}><span className="feature-icon"><Icon size={21} /></span><h2>{title}</h2><p>{description}</p></article>)}
        </section>
        <p className="scope mx-auto max-w-5xl px-5">Results are heuristic signals. This tool does not perform antivirus checks, look up reputation, or inspect archive contents.</p>
      </main>
    </>
  );
}
