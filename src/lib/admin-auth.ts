import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "mylinkscan_admin_session";
const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

function secret() {
  const value = process.env.ADMIN_DASHBOARD_SECRET?.trim() || process.env.ADMIN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("ADMIN_DASHBOARD_SECRET or ADMIN_SECRET must contain at least 32 characters.");
  return value;
}

function equal(a: string, b: string) {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function verifyAdminPassword(input: unknown) {
  const expected = process.env.ADMIN_DASHBOARD_SECRET?.trim() || process.env.ADMIN_SECRET?.trim();
  if (typeof input !== "string" || !expected || expected.length < 32) return false;
  return equal(input.trim(), expected);
}

export function createAdminSession(now = Date.now()) {
  const expires = now + MAX_SESSION_MS;
  const body = String(expires);
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return { value: `${body}.${sig}`, expires };
}

export function verifyAdminSession(value: string | undefined, now = Date.now()) {
  if (!value) return false;
  const [expiresText, signature, extra] = value.split(".");
  if (extra !== undefined || !/^\d+$/.test(expiresText) || !signature) return false;
  const expires = Number(expiresText);
  if (!Number.isSafeInteger(expires) || expires <= now || expires > now + MAX_SESSION_MS + 60_000) return false;
  try {
    const expected = createHmac("sha256", secret()).update(expiresText).digest();
    const given = Buffer.from(signature, "base64url");
    return given.length === expected.length && timingSafeEqual(given, expected);
  } catch { return false; }
}

export function requestIsAdmin(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  try { return verifyAdminSession(token ? decodeURIComponent(token) : undefined); }
  catch { return false; }
}

export function requestHasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

export async function hasAdminSessionFromCookies(cookieHeader: string) {
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`))?.slice(ADMIN_COOKIE.length + 1);
  try { return verifyAdminSession(token ? decodeURIComponent(token) : undefined); }
  catch { return false; }
}
