export type ZoneStats = {
  zoneId: string;
  humanHits: number;
  blockedBots: number;
  totalHits: number;
  botRate: number;
};

const ZONE_PARAM_PRIORITY = ["website_id", "zone", "zone_id", "sub1", "subid", "source"];

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

export function toZoneStats(rows: Array<{ zone_id: string; human_clicks: number | string | null; blocked_bots: number | string | null }>): ZoneStats[] {
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
    };
  }).sort((a, b) => b.totalHits - a.totalHits).slice(0, 10);
}
