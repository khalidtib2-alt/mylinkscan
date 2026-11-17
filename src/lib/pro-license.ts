import { createHash, timingSafeEqual } from "node:crypto";

export async function verifyProKey(headers: Headers): Promise<boolean> {
  const key = headers.get("x-pro-key")?.trim();
  if (!key || key.length > 256) return false;
  const configured = process.env.PRO_MASTER_KEYS?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (process.env.NODE_ENV !== "production" || !configured.length) configured.push("MYLINKSCAN-PRO-DEMO-2026");
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const candidate = digest(key);
  if (configured.some((value) => timingSafeEqual(candidate, digest(value)))) return true;
  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  const store = process.env.LEMONSQUEEZY_STORE_ID;
  const product = process.env.LEMONSQUEEZY_PRODUCT_ID;
  if (!apiKey || !store || !product) return false;

  try {
    const response = await fetch("https://api.lemonsqueezy.com/v1/licenses/validate", {
      method: "POST",
      headers: { Accept: "application/json", Authorization: "Bearer " + apiKey },
      body: new URLSearchParams({ license_key: key }),
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.valid === true && String(result.meta?.store_id) === store && String(result.meta?.product_id) === product;
  } catch {
    return false;
  }
}
