import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { expirationForPlan, makeProLicense, PRO_PRICES, validPaymentWallet, verifyCryptoTransfer, type CryptoAsset, type CryptoNetwork, type ProPlan, ordersConfig } from "../../../../lib/pro-orders";
import { sendProLicenseEmail } from "../../../../lib/pro-email";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const network = body?.network as CryptoNetwork;
  const asset = body?.asset as CryptoAsset;
  const plan = body?.plan as ProPlan;
  const txHash = typeof body?.txHash === "string" ? body.txHash.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return NextResponse.json({ error: "Enter a valid customer email." }, { status: 400 });
  if (!(network === "polygon" || network === "tron") || !(asset === "USDC" || asset === "USDT") || !(plan in PRO_PRICES)) return NextResponse.json({ error: "Choose a supported network, asset, and plan." }, { status: 400 });
  if (network === "tron" && asset !== "USDT") return NextResponse.json({ error: "Tron USDC is discontinued by Circle and is not accepted. Use Tron USDT or Polygon USDC." }, { status: 400 });
  if (network === "polygon" ? !/^0x[a-f0-9]{64}$/i.test(txHash) : !/^[a-f0-9]{64}$/i.test(txHash)) return NextResponse.json({ error: "Enter a valid transaction hash for the selected network." }, { status: 400 });
  const wallet = network === "polygon" ? process.env.NEXT_PUBLIC_CRYPTO_POLYGON_ADDRESS?.trim() : process.env.NEXT_PUBLIC_CRYPTO_TRON_ADDRESS?.trim();
  if (!wallet) return NextResponse.json({ error: "Direct crypto payments are not configured yet." }, { status: 503 });
  if (!validPaymentWallet(network, wallet)) return NextResponse.json({ error: "The configured receiving wallet is invalid. Contact support before sending funds." }, { status: 503 });

  let config: ReturnType<typeof ordersConfig>;
  try { config = ordersConfig(); } catch { return NextResponse.json({ error: "Payment storage is not configured." }, { status: 503 }); }
  const orderId = crypto.randomUUID();
  const amount = PRO_PRICES[plan];
  const insert = await fetch(`${config.url}/rest/v1/pro_orders`, {
    method: "POST",
    headers: { ...config.headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ id: orderId, customer_email: email, payment_method: `crypto_${network}`, network, asset, amount_usd: amount, plan,
      tx_hash: txHash.toLowerCase(), status: "pending_review", review_note: "Checking transaction on chain." }),
    cache: "no-store", signal: AbortSignal.timeout(7000),
  }).catch(() => null);
  if (!insert) return NextResponse.json({ error: "Could not save this order. Try again later." }, { status: 502 });
  if (insert.status === 409) return NextResponse.json({ error: "This transaction hash has already been submitted." }, { status: 409 });
  if (!insert.ok) return NextResponse.json({ error: "Could not save this order. Try again later." }, { status: 502 });

  let verification;
  try { verification = await verifyCryptoTransfer(network, asset, txHash.toLowerCase(), wallet, amount); }
  catch { verification = { status: "pending" as const, reason: "On-chain verification is temporarily unavailable. Your order is saved for review." }; }

  if (verification.status === "invalid") {
    await updateOrder(config.url, config.headers, orderId, { status: "rejected", review_note: verification.reason });
    return NextResponse.json({ status: "rejected", message: verification.reason }, { status: 422 });
  }
  if (verification.status === "pending") {
    await updateOrder(config.url, config.headers, orderId, { status: "pending_review", review_note: verification.reason });
    return NextResponse.json({ status: "pending_review", message: verification.reason });
  }

  const expiresAt = expirationForPlan(plan);
  try {
    const license = makeProLicense(orderId, expiresAt);
    await updateOrder(config.url, config.headers, orderId, { status: "active", expires_at: expiresAt, license_key: license.key, license_hash: license.hash, review_note: null });
    const emailResult = await sendProLicenseEmail({ email, licenseKey: license.key, plan, expiresAt });
    return NextResponse.json({ status: "active", message: emailResult.sent ? "Payment verified. Your Pro license key was emailed to you." : "Payment verified. Your Pro license key is ready." , licenseKey: license.key, expiresAt, emailSent: emailResult.sent, ...(!emailResult.sent && { emailReason: emailResult.reason }) });
  } catch {
    await updateOrder(config.url, config.headers, orderId, { status: "pending_review", review_note: "Payment is verified. License issuance needs administrator review." });
    return NextResponse.json({ status: "pending_review", message: "Payment is verified. An administrator will issue your license shortly." });
  }
}

async function updateOrder(url: string, headers: Record<string, string>, id: string, update: Record<string, unknown>) {
  const query = new URLSearchParams({ id: `eq.${id}` });
  const response = await fetch(`${url}/rest/v1/pro_orders?${query}`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(update), cache: "no-store" });
  if (!response.ok) throw new Error("Could not update payment order.");
}
