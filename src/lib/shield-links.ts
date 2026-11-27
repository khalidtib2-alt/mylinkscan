import { toZoneStats, type ZoneStats } from "./shield-link-analytics";

export const shieldSlug = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
const reserved = new Set(["api", "admin", "pro", "stats", "go", "shield-links", "bot-shield", "export", "login", "verify"]);

export function validCustomSlug(slug: string) {
  return shieldSlug.test(slug) && !reserved.has(slug);
}

export function shieldConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || new URL(url).protocol !== "https:") throw new Error("Shield Links is unavailable.");
  return { url, headers: { apikey: key, Authorization: "Bearer " + key } };
}

export async function findManagedLink(slug: string, token: string) {
  if (!shieldSlug.test(slug) || !/^[a-f0-9]{32}$/.test(token)) return null;
  const { url, headers } = shieldConfig();
  const query = new URLSearchParams({
    slug: "eq." + slug, manage_token: "eq." + token, limit: "1",
    select: "id,slug,destination_url,created_at,human_clicks,blocked_bots",
  });
  const response = await fetch(url + "/rest/v1/shield_links?" + query, { headers, cache: "no-store" });
  if (!response.ok) throw new Error("Shield Links is unavailable.");
  const [row] = await response.json() as {
    id: string; slug: string; destination_url: string; created_at: string;
    human_clicks: number | null; blocked_bots: number | null;
  }[];
  if (!row) return null;
  let zoneBreakdown: ZoneStats[] = [];
  try {
    const zoneQuery = new URLSearchParams({
      shield_link_id: "eq." + row.id,
      select: "zone_id,human_clicks,blocked_bots,last_block_reason",
      order: "human_clicks.desc,blocked_bots.desc",
      limit: "1000",
    });
    const zoneResponse = await fetch(url + "/rest/v1/shield_link_zone_stats?" + zoneQuery, { headers, cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (zoneResponse.ok) zoneBreakdown = toZoneStats(await zoneResponse.json());
  } catch {
    // Zone reporting is optional until the analytics migration is deployed.
  }
  return { slug: row.slug, destinationUrl: row.destination_url, createdAt: row.created_at,
    humanClicks: Number(row.human_clicks ?? 0), blockedBots: Number(row.blocked_bots ?? 0),
    topZones: zoneBreakdown.slice(0, 10), zoneBreakdown,
    highBotZoneIds: zoneBreakdown.filter((zone) => zone.botRate > 60).map((zone) => zone.zoneId) };
}
