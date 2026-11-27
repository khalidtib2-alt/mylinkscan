import { after, NextRequest, NextResponse } from "next/server";
import { appendQueryParams, classifyShieldRequest, extractZoneId } from "../../../lib/shield-link-analytics";
import { recordShieldHit } from "../../../lib/shield-hit-queue";
import { cacheShieldLink, cacheShieldLinkMiss, getCachedShieldLink, isCachedShieldLinkMiss, type ShieldLinkRecord } from "../../../lib/shield-link-cache";

const REDIRECT_HEADERS = { "Cache-Control": "no-store, no-cache, must-revalidate" };
const inFlightLookups = new Map<string, Promise<ShieldLinkRecord | null>>();

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { url, key };
}

async function findShieldLink(slug: string, config: { url: string; key: string }): Promise<ShieldLinkRecord | null> {
  const cached = getCachedShieldLink(slug);
  if (cached) return cached;
  if (isCachedShieldLinkMiss(slug)) return null;

  const pending = inFlightLookups.get(slug);
  if (pending) return pending;
  if (inFlightLookups.size >= 100) return null;

  const lookup = (async () => {
    const query = new URLSearchParams({ slug: `eq.${slug}`, select: "id,slug,destination_url,strict_mode", limit: "1" });
    const response = await fetch(`${config.url}/rest/v1/shield_links?${query}`, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const rows = await response.json() as ShieldLinkRecord[];
    const link = rows[0] ?? null;
    if (link) cacheShieldLink(link);
    else cacheShieldLinkMiss(slug);
    return link;
  })();
  inFlightLookups.set(slug, lookup);
  try {
    return await lookup;
  } catch {
    return null;
  } finally {
    if (inFlightLookups.get(slug) === lookup) inFlightLookups.delete(slug);
  }
}

function blockedHtml(reason: string): string {
  const label = reason.replace(/_/g, " ").replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Automated Traffic Blocked - MyLinkscan</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#020617;color:#f8fafc;font:15px system-ui}.card{max-width:520px;padding:32px;border:1px solid #1e293b;border-radius:16px;background:#0f172a}h1{font-size:22px}p{color:#94a3b8;line-height:1.6}a{color:#34d399}</style></head><body><main class="card"><h1>Automated Traffic Blocked by MyLinkscan</h1><p>This Shield Link filtered the request before it reached the destination.</p><p>Signal: ${label}</p><a href="/shield-links">Protected by MyLinkscan Bot Shield</a></main></body></html>`;
}

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = (rawSlug || "").trim().toLowerCase();
  const config = getSupabaseConfig();
  if (!config || !/^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(slug)) {
    return NextResponse.redirect(new URL("/shield-links", req.url), { status: 302, headers: REDIRECT_HEADERS });
  }

  const link = await findShieldLink(slug, config);
  if (!link) return NextResponse.redirect(new URL("/shield-links", req.url), { status: 302, headers: REDIRECT_HEADERS });

  let finalUrl: string;
  try {
    finalUrl = appendQueryParams(link.destination_url, req.nextUrl.searchParams);
  } catch {
    return NextResponse.redirect(new URL("/shield-links", req.url), { status: 302, headers: REDIRECT_HEADERS });
  }

  const decision = classifyShieldRequest(req.headers.get("user-agent") || "", req.headers.get("accept-language") || "");
  const cleanZoneId = extractZoneId(req.nextUrl.searchParams);

  // Analytics is queued after the response; traffic bursts are coalesced into REST RPC batches.
  try {
    after(() => recordShieldHit({
      shield_link_id: link.id,
      zone_id: cleanZoneId,
      status: decision.status,
      block_reason: decision.blockReason,
    }));
  } catch {
    // `after()` is unavailable outside a Next request context (for example in isolated unit tests).
  }

  if (decision.status === "blocked") {
    return new NextResponse(blockedHtml(decision.blockReason || "automation_detected"), {
      status: 403,
      headers: { ...REDIRECT_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const redirect = NextResponse.redirect(finalUrl, 302);
  redirect.headers.set("Cache-Control", REDIRECT_HEADERS["Cache-Control"]);
  return redirect;
}
