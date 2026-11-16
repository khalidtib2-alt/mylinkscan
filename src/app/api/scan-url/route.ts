import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { publicAddress } from "../public-address";
import { checkServerIdentity, connect } from "node:tls";
import { scanUrl } from "../../checks";
import type { UrlHop, UrlReport } from "../../url-report";

export const runtime = "nodejs";

const timeoutMs = 5000;
const redirectCodes = new Set([301, 302, 303, 307, 308]);
class BlockedTarget extends Error {}

function hostname(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}

function validateTarget(url: URL) {
  const host = hostname(url);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port) {
    throw new BlockedTarget("Only HTTP and HTTPS URLs on their default ports without credentials are supported.");
  }
  if (!isIP(host) && (host.length > 253 || !host.includes(".") || /(?:^|\.)(localhost|local|internal|home\.arpa|onion)$/.test(host) ||
    !host.split(".").every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)))) {
    throw new BlockedTarget("Only public DNS names and public IP addresses are supported.");
  }
  url.hash = "";
}

function verifyTls(url: URL, address: string, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(false);
  const host = hostname(url);
  return new Promise<boolean>((resolve) => {
    const socket = connect({
      host: address, port: 443, servername: isIP(host) ? undefined : host, rejectUnauthorized: true,
      checkServerIdentity: (_server, certificate) => checkServerIdentity(host, certificate),
    });
    const finish = (verified: boolean) => {
      signal.removeEventListener("abort", abort);
      socket.destroy();
      resolve(verified);
    };
    const abort = () => finish(false);
    signal.addEventListener("abort", abort, { once: true });
    socket.once("error", abort);
    socket.once("close", abort);
    socket.once("secureConnect", () => finish(true));
  });
}

async function resolvePublic(url: URL, signal: AbortSignal) {
  const host = hostname(url);
  const family = isIP(host);
  signal.throwIfAborted();
  const addresses = family ? [{ address: host, family }] : await new Promise<{ address: string; family: number }[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void lookup(host, { all: true, verbatim: true }).then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
  if (!addresses.length) throw new Error("No DNS addresses returned.");
  if (addresses.some(({ address }) => !publicAddress(address))) {
    throw new BlockedTarget("The destination resolved to a private, reserved, or otherwise non-public address.");
  }
  return addresses;
}

function requestHeaders(url: URL, target: { address: string; family: number }, method: "HEAD" | "GET", signal: AbortSignal) {
  return new Promise<{ status: number; location?: string }>((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      method, signal, agent: false, family: target.family,
      ...(url.protocol === "https:" && { rejectUnauthorized: true }),
      maxHeaderSize: 16 * 1024,
      headers: { "User-Agent": "MyLinkscan-Bot/1.0", ...(method === "GET" && { Range: "bytes=0-0" }) },
      // Keep the original Host and TLS identity while connecting only to the checked IP.
      lookup: (_host, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      resolve({ status: response.statusCode ?? 0, location: response.headers.location });
      response.destroy();
    });
    req.once("error", reject);
    req.end();
  });
}

async function queryUrlhaus(url: string, signal: AbortSignal): Promise<UrlReport["feed"]> {
  const key = process.env.URLHAUS_AUTH_KEY?.trim();
  if (!key || signal.aborted) return "Unavailable";
  try {
    const response = await fetch("https://urlhaus-api.abuse.ch/v1/url/", {
      method: "POST",
      headers: { "Auth-Key": key, "User-Agent": "MyLinkscan-Bot/1.0" },
      body: new URLSearchParams({ url }),
      cache: "no-store",
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return "Unavailable";
    }
    const result = await response.json();
    if (result?.query_status === "ok") return "URL match";
    if (result?.query_status === "no_results") return "No match";
  } catch {
    // URLhaus is an independent check. A failed query does not change the live scan findings.
  }
  return "Unavailable";
}

async function inspect(initial: URL): Promise<UrlReport> {
  const signal = AbortSignal.timeout(timeoutMs);
  const threatChecks: Promise<UrlReport["feed"]>[] = [];
  const hops: UrlHop[] = [];
  const visited = new Set<string>();
  const findings = new Set<string>();
  let url = initial;
  let finalUrl: string | null = null;
  let issue: string | undefined;
  let blocked = false;
  try {
    for (let redirects = 0; ; redirects++) {
      validateTarget(url);
      if (visited.has(url.href)) throw new Error("A redirect loop was detected.");
      visited.add(url.href);
      scanUrl(url.href).warnings.forEach((warning) => findings.add(warning));
      const hop: UrlHop = { url: url.href, addresses: [], https: url.protocol === "https:" ? "TLS unverified" : "HTTP only for this hop" };
      hops.push(hop);
      const addresses = await resolvePublic(url, signal);
      hop.addresses = addresses.map(({ address }) => address);
      threatChecks.push(queryUrlhaus(url.href, signal));
      let response = await requestHeaders(url, addresses[0], "HEAD", signal);
      if (url.protocol === "https:") hop.https = "Verified TLS";
      if ([405, 501].includes(response.status)) response = await requestHeaders(url, addresses[0], "GET", signal);
      hop.status = response.status;
      if (!redirectCodes.has(response.status)) {
        finalUrl = url.href;
        if (url.protocol === "http:") {
          hop.https = await verifyTls(url, addresses[0].address, signal) ? "Verified TLS available (HTTP response)" : "TLS unverified (HTTP response)";
        }
        if (response.status >= 400) issue = "The destination returned HTTP " + response.status + ".";
        break;
      }
      if (!response.location) throw new Error("A redirect response omitted its destination.");
      if (redirects === 5) throw new Error("The scan reached the five-redirect limit.");
      try { url = new URL(response.location, url); }
      catch { throw new Error("A redirect supplied an invalid URL."); }
    }
  } catch (error) {
    blocked = error instanceof BlockedTarget;
    const code = (error as NodeJS.ErrnoException).code;
    issue = signal.aborted ? "The live check reached its five-second timeout." :
      code === "ENOTFOUND" || code === "EAI_AGAIN" ? "DNS lookup did not resolve the destination." :
      blocked || (error instanceof Error && !code) ? (error as Error).message :
      "Could not complete the HTTP or TLS connection.";
  }
  const threatResults = await Promise.all(threatChecks);
  const feed = threatResults.includes("URL match") ? "URL match" :
    threatResults.length && threatResults.every((result) => result === "No match") ? "No match" : "Unavailable";
  const verdict = blocked || feed === "URL match" ? "High Risk" :
    issue || findings.size ? "Caution" : "Safe";
  return { verdict, finalUrl, hops, findings: [...findings], feed, issue };
}

let activeScans = 0;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return Response.json({ error: "Cross-site requests are not supported." }, { status: 403 });
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Send an application/json body." }, { status: 415 });
  }
  if (activeScans >= 8) return Response.json({ error: "The scanner is busy. Try again shortly." }, { status: 429 });
  activeScans++;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing request body.");
    const decoder = new TextDecoder();
    let raw = "";
    let size = 0;
    const bodyTimer = setTimeout(() => { void reader.cancel().catch(() => {}); }, timeoutMs);
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 12_288) throw new Error("Request is too large.");
        raw += decoder.decode(chunk.value, { stream: true });
      }
      raw += decoder.decode();
    } finally {
      clearTimeout(bodyTimer);
      void reader.cancel().catch(() => {});
    }
    const input: unknown = JSON.parse(raw)?.url;
    if (typeof input !== "string" || input.length > 2048) throw new Error("Invalid URL.");
    const value = input.trim();
    const local = scanUrl(value);
    const url = new URL(local.assumedHttps ? "https://" + value : value);
    return Response.json(await inspect(url), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Enter a valid HTTP or HTTPS URL up to 2,048 characters." }, { status: 400 });
  } finally {
    activeScans--;
  }
}
