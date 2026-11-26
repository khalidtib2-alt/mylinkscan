const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test, mock } = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }, fileName: filename,
  });
  module._compile(outputText, filename);
};

const { verifyPolygonTransfer, verifyTronTransfer, makeProLicense, verifyIssuedProLicense } = require("../src/lib/pro-orders.ts");
const { POST: submitCrypto } = require("../src/app/api/pro/crypto-verify/route.ts");
const { POST: manageOrder } = require("../src/app/api/admin/orders/route.ts");
const { POST: adminLogin } = require("../src/app/api/admin/auth/route.ts");
const { ADMIN_COOKIE, createAdminSession, requestIsAdmin, verifyAdminSession } = require("../src/lib/admin-auth.ts");
const polygonToken = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const wallet = "0x1111111111111111111111111111111111111111";
const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const recipientTopic = "0x" + "0".repeat(24) + wallet.slice(2);

function base58(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + bytes.toString("hex")); let encoded = "";
  while (n > 0n) { const rem = Number(n % 58n); encoded = alphabet[rem] + encoded; n /= 58n; }
  const leading = bytes.toString("hex").match(/^(00)*/)?.[0].length / 2 || 0;
  return "1".repeat(leading) + encoded;
}

function tronAddress() {
  const crypto = require("node:crypto");
  const body = Buffer.concat([Buffer.from([0x41]), Buffer.alloc(20, 0x11)]);
  const checksum = crypto.createHash("sha256").update(crypto.createHash("sha256").update(body).digest()).digest().subarray(0, 4);
  return base58(Buffer.concat([body, checksum]));
}

test("Polygon verifier accepts confirmed official token transfer meeting amount and wallet", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    const method = JSON.parse(options.body).method;
    if (method === "eth_chainId") return Response.json({ result: "0x89" });
    if (method === "eth_getTransactionReceipt") return Response.json({ result: { status: "0x1", blockNumber: "0x100", logs: [{
      address: polygonToken, topics: [transferTopic, "0x" + "0".repeat(64), recipientTopic], data: "0x895440",
    }] } });
    if (method === "eth_blockNumber") return Response.json({ result: "0x200" });
    throw new Error("Unexpected method");
  });
  assert.deepEqual(await verifyPolygonTransfer("0x" + "a".repeat(64), "USDC", wallet, 9), { status: "verified" });
  mock.restoreAll();
});

test("Tron verifier requires a solidified successful official USDT transfer", async (t) => {
  const address = tronAddress();
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "https://api.trongrid.io/walletsolidity/gettransactioninfobyid");
    return Response.json({ id: "b".repeat(64), receipt: { result: "SUCCESS" }, log: [{
      address: "a614f803b6fd780986a42c78ec9c7f77e6ded13",
      topics: [transferTopic.slice(2), "0".repeat(64), "0".repeat(24) + "11".repeat(20)], data: "895440",
    }] });
  });
  assert.deepEqual(await verifyTronTransfer("b".repeat(64), "USDT", address, 9), { status: "verified" });
  assert.equal((await verifyTronTransfer("b".repeat(64), "USDC", address, 9)).status, "invalid");
});

test("Crypto order submission persists pending review and rejects duplicate transaction hashes", async (t) => {
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-test";
  process.env.NEXT_PUBLIC_CRYPTO_POLYGON_ADDRESS = wallet;
  let seen = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith("https://db.example/rest/v1/pro_orders")) {
      if (options.method === "PATCH") return new Response(null, { status: 204 });
      if (seen) return new Response(null, { status: 409 });
      seen = true;
      const order = JSON.parse(options.body);
      assert.equal(order.status, "pending_review");
      assert.equal(order.amount_usd, 9);
      return Response.json([{ id: order.id }], { status: 201 });
    }
    assert.equal(url, "https://polygon-rpc.com");
    return Response.json({ result: JSON.parse(options.body).method === "eth_chainId" ? "0x89" : null });
  });
  const create = () => submitCrypto(new Request("https://mylinkscan.com/api/pro/crypto-verify", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "buyer@example.com", network: "polygon", asset: "USDC", plan: "month", txHash: "0x" + "a".repeat(64) }),
  }));
  const first = await create();
  assert.equal(first.status, 200);
  assert.equal((await first.json()).status, "pending_review");
  const duplicate = await create();
  assert.equal(duplicate.status, 409);
  assert.match((await duplicate.json()).error, /already been submitted/i);
});

test("Issued license key verifies only while its active order is persisted", async (t) => {
  process.env.CRYPTO_LICENSE_SECRET = "test-secret-with-more-than-thirty-two-characters";
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-test";
  const orderId = "fefefefe-fefe-4efe-8efe-fefefefefefe";
  const expiration = new Date(Date.now() + 86400000).toISOString();
  const license = makeProLicense(orderId, expiration);
  let row = { id: orderId };
  t.mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /rest\/v1\/pro_orders\?/);
    return Response.json(row ? [row] : []);
  });
  assert.equal(await verifyIssuedProLicense(license.key), true);
  row = null;
  assert.equal(await verifyIssuedProLicense(license.key), false);
  assert.equal(await verifyIssuedProLicense(license.key + "x"), false);
});

test("Admin login trims configured and submitted secrets, accepts fallback alias, and rejects wrong keys", async (t) => {
  const variables = ["ADMIN_DASHBOARD_SECRET", "ADMIN_SECRET"];
  const previous = Object.fromEntries(variables.map((name) => [name, process.env[name]]));
  t.after(() => variables.forEach((name) => previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name]));

  const dashboardSecret = "admin-login-secret-with-at-least-32-characters";
  process.env.ADMIN_DASHBOARD_SECRET = `  ${dashboardSecret}  `;
  delete process.env.ADMIN_SECRET;
  const login = (secret) => adminLogin(new Request("https://mylinkscan.com/api/admin/auth", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://mylinkscan.com" }, body: JSON.stringify({ secret }),
  }));

  const success = await login(`  ${dashboardSecret}  `);
  assert.equal(success.status, 200);
  const cookie = success.headers.get("set-cookie");
  assert.match(cookie, new RegExp(`^${ADMIN_COOKIE}=`));
  assert.match(cookie, /Path=\//i);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const token = cookie.match(new RegExp(`^${ADMIN_COOKIE}=([^;]+)`))[1];
  assert.equal(verifyAdminSession(token), true);
  assert.equal(requestIsAdmin(new Request("https://mylinkscan.com/api/admin/orders", { headers: { Cookie: `${ADMIN_COOKIE}=${token}` } })), true);
  assert.equal((await login("incorrect-admin-secret-that-is-long-enough" )).status, 401);

  process.env.ADMIN_DASHBOARD_SECRET = "   ";
  process.env.ADMIN_SECRET = ` ${dashboardSecret} `;
  assert.equal((await login(dashboardSecret)).status, 200);
});

test("Admin approve, extend, and revoke actions update the persistent order and key", async (t) => {
  process.env.ADMIN_DASHBOARD_SECRET = "admin-secret-with-at-least-thirty-two-characters";
  process.env.CRYPTO_LICENSE_SECRET = "test-secret-with-more-than-thirty-two-characters";
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "supabase-test";
  const id = "fefefefe-fefe-4efe-8efe-fefefefefefe";
  const session = createAdminSession();
  const headers = { "Content-Type": "application/json", Cookie: `mylinkscan_admin_session=${session.value}`, Origin: "https://mylinkscan.com" };
  let status = "pending_review";
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    if (String(url).includes("rest/v1/pro_orders?") && (!options.method || options.method === "GET")) return Response.json([{ id, status, plan: "month", expires_at: null, creem_subscription_id: null }]);
    if (String(url).includes("rest/v1/pro_orders?") && options.method === "PATCH") {
      const update = JSON.parse(options.body);
      status = update.status;
      if (update.status === "active") assert.match(update.license_key, /^MLP\./);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request ${options.method} ${url}`);
  });
  const call = (action) => manageOrder(new Request("https://mylinkscan.com/api/admin/orders", { method: "POST", headers, body: JSON.stringify({ action, id }) }));
  assert.equal((await call("approve")).status, 200);
  assert.equal(status, "active");
  assert.equal((await call("extend")).status, 200);
  assert.equal((await call("revoke")).status, 200);
  assert.equal(status, "revoked");
});
