import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type CryptoNetwork = "polygon" | "tron";
export type CryptoAsset = "USDC" | "USDT";
export type ProPlan = "month" | "year";

export const PRO_PRICES: Record<ProPlan, number> = { month: 9, year: 90 };
const TRANSFER_TOPIC = "ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const POLYGON_TOKENS: Record<CryptoAsset, string> = {
  USDC: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
  // Polygon's former PoS USDT contract was upgraded to USDT0 at the same address.
  USDT: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
};
const TRON_USDT_HEX = "a614f803b6fd780986a42c78ec9c7f77e6ded13";

export function ordersConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Pro order storage is unavailable.");
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}` } };
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function makeProLicense(orderId: string, expiresAt: string) {
  const secret = process.env.CRYPTO_LICENSE_SECRET;
  if (!secret || secret.length < 32) throw new Error("CRYPTO_LICENSE_SECRET must contain at least 32 characters.");
  void expiresAt;
  const payload = Buffer.from(JSON.stringify({ id: orderId, n: randomBytes(10).toString("hex") })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  const key = `MLP.${payload}.${signature}`;
  return { key, hash: sha256(key) };
}

export async function verifyIssuedProLicense(key: string) {
  const secret = process.env.CRYPTO_LICENSE_SECRET;
  if (!secret || key.length > 512) return false;
  const parts = key.split(".");
  if (parts.length !== 3 || parts[0] !== "MLP") return false;
  const expected = createHmac("sha256", secret).update(parts[1]).digest();
  let received: Buffer;
  try { received = Buffer.from(parts[2], "base64url"); } catch { return false; }
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (typeof claims?.id !== "string") return false;
    const { url, headers } = ordersConfig();
    const isSubscription = claims.id.startsWith("subscription:");
    const table = isSubscription ? "pro_subscriptions" : "pro_orders";
    const query = isSubscription
      ? new URLSearchParams({ select: "creem_subscription_id", license_hash: `eq.${sha256(key)}`, status: "in.(active,trialing,scheduled_cancel,canceled)", current_period_end: `gt.${new Date().toISOString()}`, limit: "1" })
      : new URLSearchParams({ select: "id", id: `eq.${claims.id}`, license_hash: `eq.${sha256(key)}`, status: "eq.active", expires_at: `gt.${new Date().toISOString()}`, limit: "1" });
    const response = await fetch(`${url}/rest/v1/${table}?${query}`, { headers, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok) return false;
    const rows = await response.json();
    return Array.isArray(rows) && rows.some((row) => isSubscription ? row.creem_subscription_id === claims.id.slice("subscription:".length) : row.id === claims.id);
  } catch { return false; }
}

function decodeBase58(value: string): Buffer | null {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = BigInt(0);
  for (const char of value) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) return null;
    number = number * BigInt(58) + BigInt(digit);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const leading = value.match(/^1*/)?.[0].length ?? 0;
  const bytes = Buffer.concat([Buffer.alloc(leading), Buffer.from(hex, "hex")]);
  if (bytes.length !== 25) return null;
  const body = bytes.subarray(0, 21);
  const checksum = createHash("sha256").update(createHash("sha256").update(body).digest()).digest().subarray(0, 4);
  return timingSafeEqual(checksum, bytes.subarray(21)) ? body : null;
}

export function validPaymentWallet(network: CryptoNetwork, wallet: string) {
  if (network === "polygon") return /^0x[a-f0-9]{40}$/i.test(wallet);
  const decoded = decodeBase58(wallet);
  return Boolean(decoded && decoded[0] === 0x41);
}

export async function verifyPolygonTransfer(txHash: string, asset: CryptoAsset, wallet: string, minimumUsd: number) {
  if (!/^0x[a-f0-9]{64}$/i.test(txHash) || !/^0x[a-f0-9]{40}$/i.test(wallet)) return { status: "invalid" as const, reason: "Invalid transaction or wallet address." };
  const rpc = process.env.POLYGON_RPC_URL || "https://polygon-rpc.com";
  const rpcCall = async (method: string, params: unknown[]) => {
    const response = await fetch(rpc, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), cache: "no-store", signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error("Polygon RPC unavailable");
    const data = await response.json();
    if (data.error) throw new Error("Polygon RPC returned an error");
    return data.result;
  };
  try {
    const chainId = await rpcCall("eth_chainId", []) as string;
    if (chainId !== "0x89") return { status: "pending" as const, reason: "Polygon verification is temporarily unavailable." };
    const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]) as null | { status?: string; blockNumber?: string; logs?: { address?: string; topics?: string[]; data?: string }[] };
    if (!receipt) return { status: "pending" as const, reason: "Transaction is not confirmed yet. We saved it for review." };
    if (receipt.status !== "0x1") return { status: "invalid" as const, reason: "The transaction did not succeed on Polygon." };
    const blockNumber = Number.parseInt(receipt.blockNumber || "0x0", 16);
    const latest = Number.parseInt(await rpcCall("eth_blockNumber", []) as string, 16);
    if (latest - blockNumber < 32) return { status: "pending" as const, reason: "Waiting for Polygon confirmations. Your order is saved for review." };
    const recipient = wallet.slice(2).toLowerCase();
    const minimum = BigInt(minimumUsd) * BigInt(1_000_000);
    const match = (receipt.logs || []).some((log) => log.address?.toLowerCase() === POLYGON_TOKENS[asset] &&
      log.topics?.[0]?.toLowerCase().replace(/^0x/, "") === TRANSFER_TOPIC &&
      log.topics?.[2]?.slice(-40).toLowerCase() === recipient && BigInt(log.data || "0x0") >= minimum);
    return match ? { status: "verified" as const } : { status: "invalid" as const, reason: "No qualifying official token transfer to the configured Polygon wallet was found." };
  } catch {
    return { status: "pending" as const, reason: "The Polygon RPC could not confirm the transfer yet. Your order is saved for review." };
  }
}

export async function verifyTronTransfer(txHash: string, asset: CryptoAsset, wallet: string, minimumUsd: number) {
  if (!/^[a-f0-9]{64}$/i.test(txHash)) return { status: "invalid" as const, reason: "Invalid Tron transaction hash." };
  if (asset !== "USDT") return { status: "invalid" as const, reason: "Tron USDC is no longer supported for automated payments." };
  const decoded = decodeBase58(wallet);
  if (!decoded || decoded[0] !== 0x41) return { status: "pending" as const, reason: "The configured Tron wallet address is invalid." };
  try {
    const response = await fetch("https://api.trongrid.io/walletsolidity/gettransactioninfobyid", {
      method: "POST", headers: { "Content-Type": "application/json", ...(process.env.TRON_PRO_API_KEY && { "TRON-PRO-API-KEY": process.env.TRON_PRO_API_KEY }) },
      body: JSON.stringify({ value: txHash }), cache: "no-store", signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error("TronGrid unavailable");
    const info = await response.json();
    if (!info?.id) return { status: "pending" as const, reason: "Transaction has not reached a solidified Tron block. Order saved for review." };
    if (info?.receipt?.result !== "SUCCESS") return { status: "invalid" as const, reason: "The Tron transaction did not succeed." };
    const recipientHex = decoded.subarray(1, 21).toString("hex").toLowerCase();
    const minimum = BigInt(minimumUsd) * BigInt(1_000_000);
    const match = (info.log || []).some((log: { address?: string; topics?: string[]; data?: string }) =>
      log.address?.toLowerCase().replace(/^41/, "") === TRON_USDT_HEX &&
      log.topics?.[0]?.toLowerCase().replace(/^0x/, "") === TRANSFER_TOPIC &&
      log.topics?.[2]?.slice(-40).toLowerCase() === recipientHex && BigInt("0x" + (log.data || "0")) >= minimum);
    return match ? { status: "verified" as const } : { status: "invalid" as const, reason: "No qualifying official USDT transfer to the configured Tron wallet was found." };
  } catch {
    return { status: "pending" as const, reason: "TronGrid could not confirm the transfer yet. Your order is saved for review." };
  }
}

export async function verifyCryptoTransfer(network: CryptoNetwork, asset: CryptoAsset, txHash: string, wallet: string, minimumUsd: number) {
  return network === "polygon"
    ? verifyPolygonTransfer(txHash, asset, wallet, minimumUsd)
    : verifyTronTransfer(txHash, asset, wallet, minimumUsd);
}

export function expirationForPlan(plan: ProPlan | "comp", base = Date.now()) {
  const days = plan === "year" ? 365 : plan === "month" ? 30 : 30;
  return new Date(base + days * 24 * 60 * 60 * 1000).toISOString();
}
