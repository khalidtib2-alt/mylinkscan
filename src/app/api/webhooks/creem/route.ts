import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { expirationForPlan, makeProLicense, ordersConfig } from "../../../../lib/pro-orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.CREEM_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get("creem-signature") || request.headers.get("x-creem-signature") || "";
    const normalized = signature.replace(/^sha256=/i, "");
    if (!/^[a-f0-9]{64}$/i.test(normalized)) return new Response("Invalid signature", { status: 401 });
    const expected = createHmac("sha256", secret).update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(normalized, "hex"))) return new Response("Invalid signature", { status: 401 });
  } else if (process.env.NODE_ENV === "production") {
    return new Response("Webhook authentication is not configured", { status: 503 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const eventId = typeof event?.id === "string" ? event.id : "";
  const eventType = typeof event?.eventType === "string" ? event.eventType : "";
  if (!eventId || !eventType || !event?.object || eventId.length > 200) return new Response("Invalid event", { status: 400 });

  let config: ReturnType<typeof ordersConfig>;
  try { config = ordersConfig(); } catch { return new Response("Storage unavailable", { status: 503 }); }
  const claim = await fetch(`${config.url}/rest/v1/pro_webhook_events`, {
    method: "POST", headers: { ...config.headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ event_id: eventId, event_type: eventType }), cache: "no-store",
  }).catch(() => null);
  if (!claim) return new Response("Storage unavailable", { status: 503 });
  if (claim.status === 409) return NextResponse.json({ received: true, duplicate: true });
  if (!claim.ok) return new Response("Event could not be recorded", { status: 503 });

  try {
    await handleCreemEvent(config.url, config.headers, event);
    return NextResponse.json({ received: true });
  } catch {
    await fetch(`${config.url}/rest/v1/pro_webhook_events?event_id=eq.${encodeURIComponent(eventId)}`, { method: "DELETE", headers: config.headers, cache: "no-store" }).catch(() => null);
    return new Response("Event processing failed", { status: 500 });
  }
}

async function handleCreemEvent(url: string, headers: Record<string, string>, event: any) {
  const obj = event.object;
  if (event.eventType === "checkout.completed") {
    if (obj.subscription?.id) {
      const subscription = typeof obj.subscription === "object" ? obj.subscription : { id: obj.subscription, customer: obj.customer, status: "active" };
      await upsertSubscription(url, headers, subscription, null);
    } else {
      await createCardOrder(url, headers, event, obj, null);
    }
    return;
  }
  if (event.eventType === "subscription.paid") {
    const subscription = obj;
    const order = await createCardOrder(url, headers, event, obj, subscription);
    await upsertSubscription(url, headers, subscription, order?.id ?? null, order?.license_key, order?.license_hash);
    return;
  }
  if (["subscription.active", "subscription.update", "subscription.trialing"].includes(event.eventType)) {
    await upsertSubscription(url, headers, obj, null);
    return;
  }
  if (["subscription.canceled", "subscription.expired", "subscription.paused"].includes(event.eventType)) {
    const subscriptionStatus = event.eventType === "subscription.canceled" ? "canceled" : event.eventType === "subscription.expired" ? "expired" : "paused";
    await upsertSubscription(url, headers, { ...obj, status: subscriptionStatus }, null);
    const query = new URLSearchParams({ creem_subscription_id: `eq.${obj.id}`, select: "id,expires_at", order: "created_at.desc", limit: "1" });
    const response = await fetch(`${url}/rest/v1/pro_orders?${query}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error("Subscription order lookup failed");
    const [order] = await response.json();
    if (order) {
      const periodEnd = parseDate(obj.current_period_end_date) || (typeof order.expires_at === "string" ? order.expires_at : null);
      const status = event.eventType === "subscription.paused" ? "revoked" : periodEnd && Date.parse(periodEnd) > Date.now() ? "active" : "expired";
      await patch(url, headers, `pro_orders?id=eq.${encodeURIComponent(order.id)}`, { status, expires_at: periodEnd, review_note: `Creem ${event.eventType} event received.` });
    }
    return;
  }
  if (["refund.created", "dispute.created"].includes(event.eventType)) {
    const transactionId = obj.transaction?.id || obj.last_transaction_id;
    if (transactionId) await patch(url, headers, `pro_orders?creem_transaction_id=eq.${encodeURIComponent(transactionId)}`, { status: "revoked", review_note: `Creem ${event.eventType} event received.` });
  }
}

async function createCardOrder(url: string, headers: Record<string, string>, event: any, obj: any, subscription: any) {
  const email = obj.customer?.email || subscription?.customer?.email;
  if (typeof email !== "string" || !email.includes("@")) throw new Error("Customer email missing");
  const product = obj.product || subscription?.product || {};
  const period = String(product.billing_period || "").toLowerCase();
  const plan = period.includes("year") ? "year" : "month";
  const currency = String(product.currency || obj.currency || "USD").toUpperCase();
  const rawAmount = Number(obj.amount_paid ?? obj.amount ?? product.price ?? 0);
  const amount = Number.isFinite(rawAmount) ? rawAmount / 100 : 0;
  const id = randomUUID();
  const expiresAt = parseDate(subscription?.current_period_end_date || obj.current_period_end_date) || expirationForPlan(plan);
  let license: { key: string; hash: string } | null = null;
  try {
    if (subscription?.id) {
      const query = new URLSearchParams({ creem_subscription_id: `eq.${subscription.id}`, select: "license_key,license_hash", limit: "1" });
      const existingResponse = await fetch(`${url}/rest/v1/pro_subscriptions?${query}`, { headers, cache: "no-store" });
      if (!existingResponse.ok) throw new Error("Could not load Creem entitlement");
      const [existing] = await existingResponse.json();
      license = existing?.license_key && existing?.license_hash
        ? { key: existing.license_key, hash: existing.license_hash }
        : makeProLicense(`subscription:${subscription.id}`, expiresAt);
    } else {
      license = makeProLicense(id, expiresAt);
    }
  } catch { /* Keep the paid order for admin issuance if the signing secret is unset. */ }
  const row = {
    id, customer_email: email.toLowerCase(), payment_method: "creem", amount_usd: currency === "USD" ? amount : 0,
    currency, plan, creem_order_id: obj.order?.id || (!subscription ? obj.id : null) || null, creem_event_id: event.id,
    creem_transaction_id: obj.last_transaction_id || obj.transaction?.id || null,
    creem_subscription_id: subscription?.id || obj.subscription?.id || null,
    creem_customer_id: obj.customer?.id || subscription?.customer?.id || null,
    status: license ? "active" : "pending_review", expires_at: expiresAt, license_key: license?.key ?? null,
    license_hash: license?.hash ?? null, review_note: license ? null : "Paid by Creem; administrator must issue license key.",
  };
  const response = await fetch(`${url}/rest/v1/pro_orders`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(row), cache: "no-store" });
  if (response.status === 409 && (row.creem_transaction_id || row.creem_order_id)) {
    const lookupField = row.creem_transaction_id ? "creem_transaction_id" : "creem_order_id";
    const lookupValue = row.creem_transaction_id || row.creem_order_id;
    const query = new URLSearchParams({ [lookupField]: `eq.${lookupValue}`, select: "id", limit: "1" });
    const lookup = await fetch(`${url}/rest/v1/pro_orders?${query}`, { headers, cache: "no-store" });
    if (!lookup.ok) throw new Error("Could not find duplicate card payment");
    return (await lookup.json())?.[0] ?? null;
  }
  if (!response.ok) throw new Error("Could not save Creem order");
  return (await response.json())?.[0] ?? row;
}

async function upsertSubscription(url: string, headers: Record<string, string>, subscription: any, orderId: string | null, licenseKey?: string | null, licenseHash?: string | null) {
  const id = typeof subscription?.id === "string" ? subscription.id : "";
  const email = subscription?.customer?.email;
  if (!id || typeof email !== "string") return;
  const query = new URLSearchParams({ on_conflict: "creem_subscription_id" });
  const result = await fetch(`${url}/rest/v1/pro_subscriptions?${query}`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ creem_subscription_id: id, creem_customer_id: subscription.customer?.id || null, customer_email: email.toLowerCase(), status: subscription.status || "active", current_period_end: parseDate(subscription.current_period_end_date), ...(orderId && { latest_order_id: orderId }), ...(licenseKey && licenseHash && { license_key: licenseKey, license_hash: licenseHash }), updated_at: new Date().toISOString() }), cache: "no-store",
  });
  if (!result.ok) throw new Error("Could not sync Creem subscription");
}

async function patch(url: string, headers: Record<string, string>, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${url}/rest/v1/${path}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }), cache: "no-store" });
  if (!response.ok) throw new Error("Could not update payment record");
}

function parseDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
