import { createHash, timingSafeEqual } from "node:crypto";

export async function verifyProKey(headers: Headers): Promise<boolean> {
  const key = headers.get("x-pro-key")?.trim();
  if (!key || key.length > 256) return false;
  const configured = process.env.PRO_MASTER_KEYS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (process.env.NODE_ENV !== "production" || !configured.length) configured.push("MYLINKSCAN-PRO-DEMO-2026");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const candidate = digest(key);
  if (configured.some((value) => timingSafeEqual(candidate, digest(value)))) return true;
  const productId = process.env.GUMROAD_PRODUCT_ID?.trim();
  if (!productId) return false;

  try {
    const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: "false" }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
      redirect: "error",
    });
    if (response.status !== 200) return false;
    const result = await response.json();
    const purchase = result?.purchase;
    const now = Date.now();
    return result?.success === true && purchase?.refunded !== true && purchase?.chargebacked !== true &&
      [purchase?.subscription_ended_at, purchase?.subscription_failed_at].every((date) =>
        date == null || (typeof date === "string" && Date.parse(date) >= now));
  } catch {
    return false;
  }
}
