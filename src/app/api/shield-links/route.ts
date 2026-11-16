import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import net from "node:net";

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"]);

function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (v === 6) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  return false;
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && key ? { url, key } : null;
}

export async function POST(req: NextRequest) {
  const cfg = getConfig();
  if (!cfg) return NextResponse.json({ error: "Server Supabase keys missing." }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const raw = String(body.destinationUrl || "").trim();
  if (!raw) return NextResponse.json({ error: "Enter a destination URL." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !host.includes(".") || BLOCKED_HOSTS.has(host) || isPrivateIp(host)) {
    return NextResponse.json({ error: "Enter a valid public website URL." }, { status: 400 });
  }

  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(7);
  let slug = "";
  for (let i = 0; i < 7; i++) slug += chars[bytes[i] % chars.length];
  const manageToken = crypto.randomBytes(16).toString("hex");

  const res = await fetch(cfg.url + "/rest/v1/shield_links", {
    method: "POST",
    headers: {
      apikey: cfg.key,
      Authorization: "Bearer " + cfg.key,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ slug, destination_url: parsed.toString(), manage_token: manageToken }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Database error (" + res.status + ")." }, { status: 502 });
  }

  return NextResponse.json({
    slug,
    shieldUrl: req.nextUrl.origin + "/go/" + slug,
    manageToken,
    destinationUrl: parsed.toString(),
    humanClicks: 0,
    blockedBots: 0,
  });
}

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  if (!cfg) return NextResponse.json({ error: "Server Supabase keys missing." }, { status: 500 });

  const slug = (req.nextUrl.searchParams.get("slug") || "").trim().toLowerCase();
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  if (!slug || !token) return NextResponse.json({ error: "Slug and token required." }, { status: 400 });

  const q = new URLSearchParams({ slug: "eq." + slug, manage_token: "eq." + token, limit: "1" });
  const res = await fetch(cfg.url + "/rest/v1/shield_links?" + q.toString(), {
    headers: { apikey: cfg.key, Authorization: "Bearer " + cfg.key },
    cache: "no-store",
  });
  const rows = res.ok ? await res.json() : [];
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: "Shield Link not found." }, { status: 404 });
  }

  const row = rows.at(0);


  return NextResponse.json({
    slug: row.slug,
    shieldUrl: req.nextUrl.origin + "/go/" + row.slug,
    destinationUrl: row.destination_url,
    humanClicks: Number(row.human_clicks || 0),
    blockedBots: Number(row.blocked_bots || 0),
  });
}
