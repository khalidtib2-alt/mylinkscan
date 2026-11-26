import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requestHasSameOrigin, requestIsAdmin } from "../../../../lib/admin-auth";
import { expirationForPlan, makeProLicense, ordersConfig, safeOrderActionDiagnostic, supabaseDiagnostic } from "../../../../lib/pro-orders";
import { sendProLicenseEmail } from "../../../../lib/pro-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SELECT = "id,customer_email,payment_method,network,asset,amount_usd,currency,plan,tx_hash,creem_order_id,creem_transaction_id,creem_subscription_id,license_key,status,review_note,created_at,expires_at,updated_at";

async function db(path: string, init: RequestInit = {}) {
  const { url, headers } = ordersConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> || {}) }, cache: "no-store", signal: init.signal ?? AbortSignal.timeout(7000) });
  if (!response.ok) throw await supabaseDiagnostic(response, `REST ${path.split("?")[0]}`);
  return response.status === 204 ? null : response.json();
}

export async function GET(request: Request) {
  if (!requestIsAdmin(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { url, headers } = ordersConfig();
    const expiredQuery = new URLSearchParams({ status: "eq.active", expires_at: `lte.${new Date().toISOString()}` });
    const expire = await fetch(`${url}/rest/v1/pro_orders?${expiredQuery}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "expired", updated_at: new Date().toISOString() }), cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!expire.ok) throw await supabaseDiagnostic(expire, "expiring old licenses");
    const [orders, subscriptions] = await Promise.all([
      db(`pro_orders?select=${SELECT}&order=created_at.desc&limit=1000`),
      db("pro_subscriptions?select=creem_subscription_id,customer_email,status,current_period_end,updated_at&order=updated_at.desc&limit=1000"),
    ]);
    return NextResponse.json({ orders: orders || [], subscriptions: subscriptions || [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: safeOrderActionDiagnostic(error) }, { status: 502 }); }
}

export async function POST(request: Request) {
  if (!requestIsAdmin(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!requestHasSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  try {
    if (action === "export") {
      const rows = await db(`pro_orders?select=${SELECT}&order=created_at.desc&limit=5000`) as Record<string, unknown>[];
      const columns = ["created_at", "customer_email", "payment_method", "network", "asset", "amount_usd", "tx_hash", "creem_order_id", "creem_transaction_id", "license_key", "status", "expires_at"];
      const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=mylinkscan-pro-orders.csv", "Cache-Control": "no-store" } });
    }
    if (action === "manual_comp") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
      const id = crypto.randomUUID();
      const expiresAt = expirationForPlan("comp");
      const license = makeProLicense(id, expiresAt);
      const rows = await db("pro_orders", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ id, customer_email: email, payment_method: "manual", amount_usd: 0, plan: "comp", status: "active", expires_at: expiresAt, license_key: license.key, license_hash: license.hash, review_note: "Complimentary key issued by administrator." }) });
      const emailResult = await sendProLicenseEmail({ email, licenseKey: license.key, plan: "comp", expiresAt });
      return NextResponse.json({ order: rows?.[0], message: emailResult.sent ? "Complimentary Pro key created and emailed to the customer." : "Complimentary Pro key created.", emailSent: emailResult.sent, ...(!emailResult.sent && { emailReason: emailResult.reason }) }, { status: 201 });
    }

    const id = String(body?.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Valid order ID required." }, { status: 400 });
    const rows = await db(`pro_orders?select=${SELECT}&id=eq.${encodeURIComponent(id)}&limit=1`) as Record<string, unknown>[];
    const order = rows?.[0];
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (action === "resend_key_email") {
      if (order.status !== "active" || typeof order.license_key !== "string" || !order.license_key) return NextResponse.json({ error: "Only active orders with an issued license key can be emailed." }, { status: 409 });
      if (typeof order.customer_email !== "string" || !order.customer_email) return NextResponse.json({ error: "This order has no customer email address." }, { status: 409 });
      const emailResult = await sendProLicenseEmail({ email: order.customer_email, licenseKey: order.license_key, plan: String(order.plan || "month"), expiresAt: String(order.expires_at || "") });
      if (!emailResult.sent) return NextResponse.json({ error: `Could not resend the license email: ${emailResult.reason}` }, { status: 502 });
      return NextResponse.json({ ok: true, message: `License key email sent to ${order.customer_email}.` });
    }
    if (action === "approve" && order.status !== "pending_review") return NextResponse.json({ error: "Only pending orders can be approved." }, { status: 409 });
    if (action === "extend" && order.status !== "active") return NextResponse.json({ error: "Only active orders can be extended." }, { status: 409 });
    if (action === "revoke" && order.status !== "active") return NextResponse.json({ error: "Only active orders can be revoked." }, { status: 409 });
    const { url, headers } = ordersConfig();

    if (action === "approve" || action === "extend") {
      const current = typeof order.expires_at === "string" ? Date.parse(order.expires_at) : 0;
      const expiresAt = action === "extend" ? new Date(Math.max(Date.now(), current) + 30 * 86400000).toISOString() : (current > Date.now() ? new Date(current).toISOString() : expirationForPlan(order.plan === "year" ? "year" : "month"));
      const license = makeProLicense(order.creem_subscription_id ? `subscription:${order.creem_subscription_id}` : id, expiresAt);
      await patchOrder(url, headers, id, { status: "active", expires_at: expiresAt, license_key: license.key, license_hash: license.hash, review_note: action === "extend" ? "Access extended by 30 days by administrator." : "Order approved by administrator." });
      if (order.creem_subscription_id) await db(`pro_subscriptions?creem_subscription_id=eq.${encodeURIComponent(String(order.creem_subscription_id))}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "active", current_period_end: expiresAt, latest_order_id: id, license_key: license.key, license_hash: license.hash, updated_at: new Date().toISOString() }) });
      if (action === "approve" && typeof order.customer_email === "string" && order.customer_email) {
        const emailResult = await sendProLicenseEmail({ email: order.customer_email, licenseKey: license.key, plan: String(order.plan || "month"), expiresAt });
        return NextResponse.json({ ok: true, licenseKey: license.key, expiresAt, emailSent: emailResult.sent, ...(!emailResult.sent && { emailReason: emailResult.reason }), message: emailResult.sent ? `Order approved and license key emailed to ${order.customer_email}.` : `Order approved. Email delivery was not completed: ${emailResult.reason}` });
      }
      return NextResponse.json({ ok: true, licenseKey: license.key, expiresAt, emailSent: false, message: "Order approved. No customer email is available." });
    }

    if (action === "revoke") {
      if (order.creem_subscription_id) {
        const apiKey = process.env.CREEM_API_KEY;
        if (!apiKey) return NextResponse.json({ error: "CREEM_API_KEY is missing; cancel this subscription in Creem before revoking its local license." }, { status: 503 });
        const cancel = await fetch(`https://api.creem.io/v1/subscriptions/${encodeURIComponent(String(order.creem_subscription_id))}/cancel`, {
          method: "POST", headers: { "x-api-key": apiKey, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "immediate", onExecute: "cancel" }), cache: "no-store", signal: AbortSignal.timeout(6000),
        });
        if (!cancel.ok) return NextResponse.json({ error: "Creem could not cancel this subscription. The license was not changed." }, { status: 502 });
      }
      await patchOrder(url, headers, id, { status: "revoked", review_note: "License revoked by administrator." });
      if (order.creem_subscription_id) await db(`pro_subscriptions?creem_subscription_id=eq.${encodeURIComponent(String(order.creem_subscription_id))}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ status: "canceled", current_period_end: new Date().toISOString(), updated_at: new Date().toISOString() }) });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown order action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: safeOrderActionDiagnostic(error) }, { status: 502 });
  }
}

async function patchOrder(url: string, headers: Record<string, string>, id: string, patch: Record<string, unknown>) {
  const response = await fetch(`${url}/rest/v1/pro_orders?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }), cache: "no-store", signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw await supabaseDiagnostic(response, "updating pro_orders");
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}
