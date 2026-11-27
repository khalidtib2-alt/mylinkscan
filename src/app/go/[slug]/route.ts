import { NextRequest, NextResponse } from "next/server";
import net from "node:net";
import { appendQueryParams, extractZoneId } from "../../../lib/shield-link-analytics";

const BOT_UA_REGEX =
  /(bot|crawl|spider|slurp|curl|wget|python|requests|aiohttp|httpx|scrapy|playwright|puppeteer|selenium|phantomjs|headless|node-fetch|axios|go-http-client|java\/|libwww|nikto|sqlmap|nmap|masscan|zgrab|censys|shodan)/i;

const DATACENTER_KEYWORDS = [
  "amazon",
  "aws",
  "google cloud",
  "google llc",
  "microsoft",
  "azure",
  "digitalocean",
  "hetzner",
  "ovh",
  "linode",
  "akamai",
  "vultr",
  "alibaba",
  "oracle",
  "choopa",
  "contabo",
  "scaleway",
  "hostinger",
  "leaseweb",
  "datacenter",
  "data center",
  "hosting",
  "colocation",
  "vps",
];

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

function extractClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && net.isIP(first)) return first;
  }
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp && net.isIP(realIp)) return realIp;
  return "";
}

function isPublicIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return !(
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  return false;
}

async function checkDatacenterAsn(ip: string): Promise<{ isDatacenter: boolean; org: string }> {
  if (!ip || !isPublicIp(ip)) {
    return { isDatacenter: false, org: "" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { isDatacenter: false, org: "" };
    const data = (await res.json()) as {
      success?: boolean;
      connection?: { org?: string; isp?: string };
    };
    if (!data.success) return { isDatacenter: false, org: "" };
    const combined = `${data.connection?.org || ""} ${data.connection?.isp || ""}`.trim();
    const lower = combined.toLowerCase();
    const matched = DATACENTER_KEYWORDS.some((kw) => lower.includes(kw));
    return { isDatacenter: matched, org: combined };
  } catch {
    return { isDatacenter: false, org: "" };
  } finally {
    clearTimeout(timer);
  }
}

function blockedHtml(reasons: string[]): string {
  const safeReasons = reasons
    .map((r) => `<li>${r.replace(/[<>&"]/g, "")}</li>`)
    .join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Automated Traffic Blocked — MyLinkscan Bot Shield</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #f8fafc; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 520px; width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: rgba(244,63,94,0.15); color: #fb7185; border: 1px solid rgba(244,63,94,0.35); padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
    h1 { font-size: 22px; margin: 16px 0 8px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
    ul { color: #cbd5e1; font-size: 13px; background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 14px 18px 14px 32px; margin: 16px 0; }
    a { color: #34d399; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">403 · Access Filtered</span>
    <h1>Automated or Non-Human Traffic Blocked</h1>
    <p>This destination is protected by <strong>MyLinkscan Bot Shield</strong>. Your request was flagged before reaching the target site.</p>
    <ul>${safeReasons}</ul>
    <a href="/shield-links">Protected by MyLinkscan Bot Shield →</a>
  </div>
</body>
</html>`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await context.params;
  const slug = (rawSlug || "").trim().toLowerCase();

  const config = getSupabaseConfig();
  if (!config || !slug) {
    return NextResponse.redirect(new URL("/shield-links", req.url), 302);
  }

  const query = new URLSearchParams({
    slug: `eq.${slug}`,
    select: "id,destination_url,strict_mode,human_clicks,blocked_bots",
    limit: "1",
  });

  const lookupRes = await fetch(`${config.url}/rest/v1/shield_links?${query.toString()}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
  });

  if (!lookupRes.ok) {
    return NextResponse.redirect(new URL("/shield-links", req.url), 302);
  }

  const rows = (await lookupRes.json()) as Array<{
    id: string;
    destination_url: string;
    strict_mode: boolean;
    human_clicks: number;
    blocked_bots: number;
  }>;

  if (!rows.length) {
    return NextResponse.redirect(new URL("/shield-links", req.url), 302);
  }

  const link = rows[0];
  const ua = (req.headers.get("user-agent") || "").trim();
  const acceptLang = (req.headers.get("accept-language") || "").trim();
  const reasons: string[] = [];

  if (!ua || ua.length < 12) {
    reasons.push("Missing or abnormally short browser User-Agent header");
  } else if (BOT_UA_REGEX.test(ua)) {
    reasons.push("Automated scraper, CLI tool, or headless bot User-Agent signature");
  }

  if (!acceptLang) {
    reasons.push("Missing standard browser Accept-Language header");
  }

  const ip = extractClientIp(req);
  if (ip) {
    const asnCheck = await checkDatacenterAsn(ip);
    if (asnCheck.isDatacenter) {
      reasons.push(`Cloud / datacenter network detected (${asnCheck.org || "Hosting ASN"})`);
    }
  }

  const isBot = reasons.length > 0;
  const nowIso = new Date().toISOString();
  const zoneId = extractZoneId(req.nextUrl.searchParams);

  // Update counter in Supabase
  const patchBody = isBot
    ? { blocked_bots: Number(link.blocked_bots || 0) + 1, last_event_at: nowIso }
    : { human_clicks: Number(link.human_clicks || 0) + 1, last_event_at: nowIso };

  await fetch(`${config.url}/rest/v1/shield_links?id=eq.${encodeURIComponent(link.id)}`, {
    method: "PATCH",
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patchBody),
  }).catch(() => {});

  if (zoneId) {
    await fetch(`${config.url}/rest/v1/rpc/record_shield_link_zone_hit`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_shield_link_id: link.id, p_zone_id: zoneId, p_is_bot: isBot }),
      cache: "no-store",
    }).catch(() => {
      // Keep redirects working when the optional zone analytics migration is not deployed yet.
    });
  }

  if (isBot) {
    return new NextResponse(blockedHtml(reasons), {
      status: 403,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let destination: string;
  try {
    destination = appendQueryParams(link.destination_url, req.nextUrl.searchParams);
  } catch {
    return NextResponse.redirect(new URL("/shield-links", req.url), 302);
  }
  return NextResponse.redirect(destination, {
    status: 302,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
