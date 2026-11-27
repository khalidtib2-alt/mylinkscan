import { findManagedLink, shieldConfig } from "../../../../lib/shield-links";
import { invalidateShieldLinkCache } from "../../../../lib/shield-link-cache";
import net from "node:net";

function isPrivateDestination(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (["localhost", "metadata.google.internal"].includes(host) || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  const version = net.isIP(host);
  if (version === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) return host === "::" || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  return false;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const headers = { "Cache-Control": "no-store" };
  const url = new URL(request.url);
  const token = (request.headers.get("x-manage-token") ?? url.searchParams.get("token") ?? "").trim();
  if (!token) return Response.json({ error: "Manage token required." }, { status: 400, headers });

  try {
    const { slug } = await params;
    const link = await findManagedLink(slug, token);
    if (!link) return Response.json({ error: "Shield Link not found." }, { status: 404, headers });
    return Response.json({ ...link, shieldUrl: new URL("/go/" + link.slug, url).href }, { headers });
  } catch {
    return Response.json({ error: "Stats are temporarily unavailable." }, { status: 502, headers });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = (request.headers.get("x-manage-token") ?? "").trim();
  if (!token) return Response.json({ error: "Manage token required." }, { status: 400 });
  const body = await request.json().catch(() => null);
  let destination: URL;
  try {
    const raw = typeof body?.destinationUrl === "string" ? body.destinationUrl.trim() : "";
    destination = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return Response.json({ error: "Enter a valid public destination URL." }, { status: 400 });
  }
  if (!/^https?:$/.test(destination.protocol) || destination.username || destination.password || isPrivateDestination(destination.hostname) ||
      (net.isIP(destination.hostname.replace(/^\[|\]$/g, "")) === 0 && !destination.hostname.includes("."))) {
    return Response.json({ error: "Enter a valid public destination URL." }, { status: 400 });
  }
  try {
    const { url, headers } = shieldConfig();
    const query = new URLSearchParams({ slug: "eq." + slug, manage_token: "eq." + token, select: "slug,destination_url" });
    const response = await fetch(url + "/rest/v1/shield_links?" + query, {
      method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ destination_url: destination.href }), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return Response.json({ error: "Could not update this Shield Link." }, { status: 502 });
    const [row] = await response.json() as Array<{ slug: string; destination_url: string }>;
    if (!row) return Response.json({ error: "Shield Link not found." }, { status: 404 });
    invalidateShieldLinkCache(slug);
    return Response.json({ slug: row.slug, destinationUrl: row.destination_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Shield Link update is temporarily unavailable." }, { status: 502 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const token = (request.headers.get("x-manage-token") ?? "").trim();
  if (!token) return Response.json({ error: "Manage token required." }, { status: 400 });
  try {
    const { url, headers } = shieldConfig();
    const query = new URLSearchParams({ slug: "eq." + slug, manage_token: "eq." + token, select: "slug" });
    const response = await fetch(url + "/rest/v1/shield_links?" + query, {
      method: "DELETE", headers: { ...headers, Prefer: "return=representation" }, cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return Response.json({ error: "Could not delete this Shield Link." }, { status: 502 });
    const rows = await response.json() as Array<{ slug: string }>;
    if (!rows.length) return Response.json({ error: "Shield Link not found." }, { status: 404 });
    invalidateShieldLinkCache(slug);
    return Response.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Shield Link deletion is temporarily unavailable." }, { status: 502 });
  }
}
