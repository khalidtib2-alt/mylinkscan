import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import net from "node:net";
import { verifyProKey } from "../../../lib/pro-license";
import { findManagedLink, shieldConfig, validCustomSlug } from "../../../lib/shield-links";

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const raw = String(body?.destinationUrl || "").trim();
  if (!raw) return NextResponse.json({ error: "Enter a destination URL." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  } catch {
    return NextResponse.json({ error: "Invalid URL format." }, { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || !host.includes(".") || BLOCKED_HOSTS.has(host) || isPrivateIp(host)) {
    return NextResponse.json({ error: "Enter a valid public website URL." }, { status: 400 });
  }

  const customSlug = body?.customSlug;
  if (customSlug !== undefined && (typeof customSlug !== "string" || !validCustomSlug(customSlug))) {
    return NextResponse.json({ error: "Use a non-reserved slug of 3–32 lowercase letters, numbers, or hyphens, with no leading or trailing hyphen." }, { status: 400 });
  }
  const pro = await verifyProKey(req.headers);
  if (customSlug && !pro) {
    return NextResponse.json({ error: "Upgrade to Shield Links Pro to use a custom slug." }, { status: 403 });
  }

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const family = net.isIP(forwarded);
  const ip = family === 6 ? new URL("http://[" + forwarded + "]/").hostname : family === 4 ? forwarded : "unknown";
  const manageToken = crypto.randomBytes(16).toString("hex");
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  try {
    const { url, headers } = shieldConfig();
    const creator = crypto.createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest("hex");
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = customSlug ?? Array.from({ length: 7 }, () => chars[crypto.randomInt(chars.length)]).join("");
      const response = await fetch(url + "/rest/v1/rpc/create_shield_link_for_tier", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ p_slug: slug, p_destination: parsed.href, p_token: manageToken, p_creator: creator, p_pro: pro }),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Shield Links unavailable");
      const result = await response.json();
      if (result === "limit") return NextResponse.json({ error: "Free supports 3 active Shield Links. Upgrade to Pro for unlimited links." }, { status: 403 });
      if (result === "conflict") {
        if (customSlug) return NextResponse.json({ error: "That custom slug is already in use." }, { status: 409 });
        continue;
      }
      if (result !== "created") throw new Error("Unexpected insert result");
      return NextResponse.json({ slug, shieldUrl: req.nextUrl.origin + "/go/" + slug, manageToken,
        destinationUrl: parsed.href, humanClicks: 0, blockedBots: 0 }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch {
    return NextResponse.json({ error: "Shield Link creation is temporarily unavailable." }, { status: 502 });
  }
  return NextResponse.json({ error: "Could not reserve a slug. Please try again." }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get("slug") || "").trim().toLowerCase();
  const token = (req.nextUrl.searchParams.get("token") || "").trim();
  const headers = { "Cache-Control": "no-store" };
  if (!slug || !token) return NextResponse.json({ error: "Slug and token required." }, { status: 400, headers });
  try {
    const link = await findManagedLink(slug, token);
    if (!link) return NextResponse.json({ error: "Shield Link not found." }, { status: 404, headers });
    return NextResponse.json({ ...link, shieldUrl: req.nextUrl.origin + "/go/" + slug }, { headers });
  } catch {
    return NextResponse.json({ error: "Stats are temporarily unavailable." }, { status: 502, headers });
  }
}
