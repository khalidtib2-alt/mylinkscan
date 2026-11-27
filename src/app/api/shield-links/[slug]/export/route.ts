import { verifyProKey } from "../../../../../lib/pro-license";
import { findManagedLink } from "../../../../../lib/shield-links";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  if (!await verifyProKey(request.headers)) return Response.json({ error: "CSV export requires Shield Links Pro." }, { status: 403, headers });
  try {
    const { slug } = await params;
    const link = await findManagedLink(slug, request.headers.get("x-manage-token") ?? "");
    if (!link) return Response.json({ error: "Shield Link not found." }, { status: 404, headers });

    const total = link.humanClicks + link.blockedBots;
    const rate = total ? (100 * link.blockedBots / total).toFixed(2) : "0.00";
    const fields = [link.slug, link.destinationUrl, link.createdAt, link.humanClicks, link.blockedBots, total, rate + "%"];
    const zoneRows = link.topZones.flatMap((zone) => {
      const zoneRate = zone.totalHits ? (100 * zone.blockedBots / zone.totalHits).toFixed(2) + "%" : "0.00%";
      return [[zone.zoneId, zone.humanHits, zone.blockedBots, zone.totalHits, zoneRate]];
    });
    const csv = [
      "slug,target_url,created_at,human_visits,blocked_bots,total_hits,bot_block_rate",
      fields.map(csvCell).join(","),
      "",
      "Zone ID Breakdown",
      "zone_id,human_visits,blocked_bots,total_hits,bot_block_rate",
      ...zoneRows.map((row) => row.map(csvCell).join(",")),
    ].join("\r\n") + "\r\n";
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shield-' + slug + '.csv"' } });
  } catch {
    return Response.json({ error: "Stats are temporarily unavailable." }, { status: 502, headers });
  }
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
