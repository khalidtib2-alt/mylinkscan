export type ZoneStats = {
  zoneId: string;
  humanHits: number;
  blockedBots: number;
  totalHits: number;
  botRate: number;
  lastBlockReason: string | null;
};

const ZONE_PARAM_PRIORITY = ["website_id", "zone_id", "source_id", "subid", "zone", "sub1", "source"];
const UA_BOT_REGEX = /(headlesschrome|headless|puppeteer|playwright|phantomjs|curl\/|python-requests|python\-urllib|go-http-client|bot\b|spider|crawler|crawl\b|scrapy|wget\/|selenium|httpx|aiohttp|axios|node-fetch|libwww|bytespider|dataforseo|semrushbot|ahrefsbot|mj12bot|dotbot|hosting|datacenter)/i;
const BROWSER_UA_REGEX = /(mozilla\/|chrome\/|safari\/|firefox\/|edg\/)/i;

export function classifyShieldRequest(userAgent: string, acceptLanguage: string): { status: "allowed" | "blocked"; blockReason: string | null } {
  const ua = userAgent.trim();
  if (!ua) return { status: "blocked", blockReason: "missing_user_agent" };
  if (UA_BOT_REGEX.test(ua)) return { status: "blocked", blockReason: "automation_user_agent" };
  if (BROWSER_UA_REGEX.test(ua) && !acceptLanguage.trim()) return { status: "blocked", blockReason: "missing_accept_language" };
  return { status: "allowed", blockReason: null };
}

export function extractZoneId(params: URLSearchParams): string | null {
  for (const key of ZONE_PARAM_PRIORITY) {
    const value = params.get(key)?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
    if (value) return value.slice(0, 128);
  }
  return null;
}

export function appendQueryParams(destination: string, incoming: URLSearchParams): string {
  const target = new URL(destination);
  incoming.forEach((value, key) => target.searchParams.append(key, value));
  return target.toString();
}

export function toZoneStats(rows: Array<{ zone_id: string; human_clicks: number | string | null; blocked_bots: number | string | null; last_block_reason?: string | null }>): ZoneStats[] {
  return rows.map((row) => {
    const humanHits = Number(row.human_clicks || 0);
    const blockedBots = Number(row.blocked_bots || 0);
    const totalHits = humanHits + blockedBots;
    return {
      zoneId: row.zone_id,
      humanHits,
      blockedBots,
      totalHits,
      botRate: totalHits ? (100 * blockedBots) / totalHits : 0,
      lastBlockReason: row.last_block_reason || null,
    };
  }).sort((a, b) => b.totalHits - a.totalHits);
}
