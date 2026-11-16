import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
]);

function isPrivateIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  return false;
}

function validateDestinationUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "Please enter a destination URL." };
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: "Invalid URL format." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http:// and https:// links are supported." };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || !hostname.includes(".") || BLOCKED_HOSTNAMES.has(hostname) || isPrivateIp(hostname)) {
    return { ok: false, error: "Destination must be a valid public website URL." };
  }
  return { ok: true, url: parsed.toString() };
}

function generateSlug(length = 7): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export async function POST(req: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured on the server." },
      { status: 500 }
    );
  }

  let body: { destinationUrl?: string; strictMode?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const check = validateDestinationUrl(body.destinationUrl || "");
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const strictMode = Boolean(body.strictMode);
  const manageToken = crypto.randomBytes(16).toString("hex");

  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = generateSlug(7);
    const res = await fetch(`${config.url}/rest/v1/shield_links`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        slug,
        destination_url: check.url,
        manage_token: manageToken,
        strict_mode: strictMode,
      }),
    });

    if (res.ok) {
      const origin = req.nextUrl.origin;
      return NextResponse.json({
        slug,
        shieldUrl: `${origin}/go/${slug}`,
        manageToken,
        destinationUrl: check.url,
        strictMode,
        humanClicks: 0,
        blockedBots: 0,
      });
    }

    if (res.status !== 409) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Database error creating Shield Link (${res.status}). ${detail}` },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ error: "Could not allocate a unique link slug. Try again." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const config = getSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured on the server." },
      { status: 500 }
    );
  }

  const slug = (req.nextUrl.searchParams.get("slug") || "").trim().toLowerCase();
  const token = (req.nextUrl.searchParams.get("token") || "").trim();

  if (!slug || !token) {
    return NextResponse.json({ error: "Both slug and token are required." }, { status: 400 });
  }

  const query = new URLSearchParams({
    slug: `eq.${slug}`,
    manage_token: `eq.${token}`,
    select: "slug,destination_url,strict_mode,human_clicks,blocked_bots,last_event_at,created_at",
    limit: "1",
  });

  const res = await fetch(`${config.url}/rest/v1/shield_links?${query.toString()}`, {
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch Shield Link stats." }, { status: 502 });
  }

  const rows = (await res.json()) as Array<{
    slug: string;
    destination_url: string;
    strict_mode: boolean;
    human_clicks: number;
    blocked_bots: number;
    last_event_at: string | null;
    created_at: string;
  }>;

  if (!rows.length) {
    return NextResponse.json({ error: "Shield Link not found or invalid manage token." }, { status: 404 });
  }

  const row = rows[0];
  return NextResponse.json({
    slug: row.slug,
    shieldUrl: `${req.nextUrl.origin}/go/${row.slug}`,
    destinationUrl: row.destination_url,
    strictMode: row.strict_mode,
    humanClicks: Number(row.human_clicks || 0),
    blockedBots: Number(row.blocked_bots || 0),
    lastEventAt: row.last_event_at,
    createdAt: row.created_at,
  });
}
