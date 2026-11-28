const assert = require("node:assert/strict");
const fs = require("node:fs");
const { test, mock } = require("node:test");
const ts = require("typescript");
const { NextRequest } = require("next/server");

require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const { POST } = require("../src/app/api/shield-links/route.ts");
const { PATCH: updateShieldLinkTarget } = require("../src/app/api/shield-links/[slug]/route.ts");
const goRoute = require("../src/app/go/[slug]/route.ts");
const { GET: redirectShieldLink } = goRoute;
const { GET: exportCsv } = require("../src/app/api/shield-links/[slug]/export/route.ts");
const { validCustomSlug } = require("../src/lib/shield-links.ts");
const { appendQueryParams, classifyShieldRequest, extractZoneId } = require("../src/lib/shield-link-analytics.ts");
const { cacheShieldLink, getCachedShieldLink, invalidateShieldLinkCache } = require("../src/lib/shield-link-cache.ts");
const { recordShieldHit } = require("../src/lib/shield-hit-queue.ts");
const { verifyProKey } = require("../src/lib/pro-license.ts");
const site = "https://mylinkscan.com";

test("Creem validates active license keys while master keys bypass external verification", async (t) => {
  const variables = { CREEM_API_KEY: "creem-test-secret", PRO_MASTER_KEYS: "test-master" };
  for (const [name, value] of Object.entries(variables)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }
  const previousGumroad = process.env.GUMROAD_PRODUCT_ID;
  delete process.env.GUMROAD_PRODUCT_ID;
  t.after(() => {
    if (previousGumroad === undefined) delete process.env.GUMROAD_PRODUCT_ID;
    else process.env.GUMROAD_PRODUCT_ID = previousGumroad;
  });

  let status = 200;
  let payload = { status: "active" };
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.creem.io/v1/licenses/validate");
    assert.equal(options.method, "POST");
    assert.deepEqual(options.headers, { "x-api-key": "creem-test-secret", "Content-Type": "application/json" });
    assert.equal(options.body, JSON.stringify({ key: "customer-license" }));
    return Response.json(payload, { status });
  });

  assert.equal(await verifyProKey(new Headers({ "x-pro-key": "test-master" })), true);
  assert.equal(fetchMock.mock.callCount(), 0);
  assert.equal(await verifyProKey(new Headers({ "x-pro-key": "customer-license" })), true);
  payload = { status: "revoked" };
  assert.equal(await verifyProKey(new Headers({ "x-pro-key": "customer-license" })), false);
  payload = { status: "active" };
  status = 201;
  assert.equal(await verifyProKey(new Headers({ "x-pro-key": "customer-license" })), false);
  assert.equal(fetchMock.mock.callCount(), 3);
});

test("Gumroad verification preserves master keys and rejects invalid purchases", async (t) => {
  const variables = { GUMROAD_PRODUCT_ID: "product+/=", PRO_MASTER_KEYS: "test-master" };
  for (const [name, value] of Object.entries(variables)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
  }

  let status = 200;
  let payload = { success: true, purchase: {} };
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.gumroad.com/v2/licenses/verify");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
    assert.equal(String(options.body), "product_id=product%2B%2F%3D&license_key=customer%26key&increment_uses_count=false");
    return Response.json(payload, { status });
  });
  assert.equal(await verifyProKey(new Headers({ "x-pro-key": "test-master" })), true);
  assert.equal(fetchMock.mock.callCount(), 0);

  const customer = new Headers({ "x-pro-key": "customer&key" });
  assert.equal(await verifyProKey(customer), true);
  const future = new Date(Date.now() + 60_000).toISOString();
  payload.purchase = { subscription_ended_at: future, subscription_failed_at: null };
  assert.equal(await verifyProKey(customer), true);

  for (const purchase of [
    { refunded: true },
    { chargebacked: true },
    { subscription_ended_at: "2000-01-01T00:00:00Z" },
    { subscription_failed_at: "2000-01-01T00:00:00Z" },
    { subscription_failed_at: "invalid" },
  ]) {
    payload.purchase = purchase;
    assert.equal(await verifyProKey(customer), false);
  }
  payload = { success: false, purchase: {} };
  assert.equal(await verifyProKey(customer), false);
  payload.success = true;
  status = 201;
  assert.equal(await verifyProKey(customer), false);
  assert.equal(fetchMock.mock.callCount(), 9);
});

test("custom slugs enforce length, syntax, and reserved names", () => {
  for (const value of ["abc", "your-brand", "a".repeat(32)]) assert.equal(validCustomSlug(value), true);
  for (const value of ["api", "admin", "stats", "pro", "ab", "a".repeat(33), "My-Brand", "two/parts"]) {
    assert.equal(validCustomSlug(value), false, value);
  }
});

test("Shield redirect appends incoming tracking parameters and records the prioritized zone", async (t) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  t.after(() => {
    mock.restoreAll();
    previousUrl === undefined ? delete process.env.SUPABASE_URL : process.env.SUPABASE_URL = previousUrl;
    previousKey === undefined ? delete process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  mock.method(globalThis, "fetch", async (target, options = {}) => {
    const url = String(target);
    if (url.includes("/rest/v1/shield_links?") && !options.method) return Response.json([{ id: "link-uuid", slug: "test-brand", destination_url: "https://offer.example/path?existing=keep&cid=destination", strict_mode: false }]);
    throw new Error(`Unexpected fetch: ${url}`);
  });

  const request = new NextRequest(site + "/go/test-brand?zone=zone-2&website_id=website-1&cid=incoming&dup=one&dup=two", {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0", "accept-language": "en-US,en;q=0.9" },
  });
  const response = await redirectShieldLink(request, { params: Promise.resolve({ slug: "test-brand" }) });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin + location.pathname, "https://offer.example/path");
  assert.equal(location.searchParams.get("existing"), "keep");
  assert.equal(location.searchParams.getAll("cid").join(","), "destination,incoming");
  assert.deepEqual(location.searchParams.getAll("dup"), ["one", "two"]);
  assert.equal(location.searchParams.get("zone"), "zone-2");
  assert.equal(location.searchParams.get("website_id"), "website-1");
  assert.equal(response.headers.get("cache-control"), "no-store, no-cache, must-revalidate");
});

test("/go route is dynamic and blocks automation before slug lookup", async (t) => {
  assert.equal(goRoute.dynamic, "force-dynamic");
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("blocked bots must not need a database lookup"); });
  for (const ua of ["curl/8.5.0", "python-requests/2.31", "Mozilla/5.0 HeadlessChrome/126.0", "Mozilla/5.0 Playwright"]) {
    const request = new NextRequest(site + "/go/does-not-matter?test=1", { headers: { "user-agent": ua } });
    const response = await redirectShieldLink(request, { params: Promise.resolve({ slug: "does-not-matter" }) });
    assert.equal(response.status, 403, ua);
    assert.match(await response.text(), /Automated Traffic Blocked by MyLinkscan/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  mock.restoreAll();
});

test("unknown human Shield Link slugs return 404 instead of redirecting to a page", async (t) => {
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  t.after(() => mock.restoreAll());
  mock.method(globalThis, "fetch", async (url) => {
    assert.match(String(url), /^https:\/\/db\.example\/rest\/v1\/shield_links\?/);
    return Response.json([]);
  });
  const request = new NextRequest(site + "/go/missing123?test=1", { headers: { "user-agent": "Mozilla/5.0 Chrome/126.0", "accept-language": "en-US" } });
  const response = await redirectShieldLink(request, { params: Promise.resolve({ slug: "missing123" }) });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("location"), null);
});

test("target URL edit uses the card's manage token and invalidates its redirect cache", async (t) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  t.after(() => {
    mock.restoreAll();
    previousUrl === undefined ? delete process.env.SUPABASE_URL : process.env.SUPABASE_URL = previousUrl;
    previousKey === undefined ? delete process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  });

  const token = "a".repeat(32);
  cacheShieldLink({ id: "cached-link", slug: "editable-link", destination_url: "https://old.example", strict_mode: false });
  mock.method(globalThis, "fetch", async (target, options) => {
    assert.equal(options.method, "PATCH");
    const requestUrl = new URL(target);
    assert.equal(requestUrl.origin, "https://db.example");
    assert.equal(requestUrl.pathname, "/rest/v1/shield_links");
    assert.equal(requestUrl.searchParams.get("slug"), "eq.editable-link");
    assert.equal(requestUrl.searchParams.get("manage_token"), "eq." + token);
    assert.equal(JSON.parse(options.body).destination_url, "https://new.example/offer?cid=abc");
    return Response.json([{ slug: "editable-link", destination_url: "https://new.example/offer?cid=abc" }]);
  });

  const response = await updateShieldLinkTarget(new Request(site + "/api/shield-links/editable-link", {
    method: "PATCH", headers: { "Content-Type": "application/json", "x-manage-token": token },
    body: JSON.stringify({ destinationUrl: "https://new.example/offer?cid=abc" }),
  }), { params: Promise.resolve({ slug: "editable-link" }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { slug: "editable-link", destinationUrl: "https://new.example/offer?cid=abc" });
  assert.equal(getCachedShieldLink("editable-link"), null);
});

test("Zone ID extraction follows the documented parameter priority and query merge appends duplicates", () => {
  assert.equal(extractZoneId(new URLSearchParams("source=src&subid=sub&sub1=sub-one&zone_id=zone-id&zone=zone&website_id=site")), "site");
  assert.equal(extractZoneId(new URLSearchParams("source_id=source-id&subid=sub&zone_id=zone-id&zone=zone")), "zone-id");
  assert.equal(extractZoneId(new URLSearchParams("source_id=src-id&subid=sub")), "src-id");
  assert.equal(extractZoneId(new URLSearchParams("cid=abc")), null);
  const merged = new URL(appendQueryParams("https://offer.example/?cid=dest", new URLSearchParams("cid=source&zone=42")));
  assert.deepEqual(merged.searchParams.getAll("cid"), ["dest", "source"]);
  assert.equal(merged.searchParams.get("zone"), "42");
  const encoded = new URL(appendQueryParams("https://offer.example/path?foo=bar", new URLSearchParams("value=hello%20world%26x")));
  assert.equal(encoded.searchParams.get("foo"), "bar");
  assert.equal(encoded.searchParams.get("value"), "hello world&x");
  assert.equal(appendQueryParams("https://offer.example/path?foo=bar", new URLSearchParams()), "https://offer.example/path?foo=bar");
});

test("bot signals are classified and slug cache supports reuse plus invalidation", () => {
  assert.deepEqual(classifyShieldRequest("", "en"), { status: "blocked", blockReason: "missing_user_agent" });
  assert.deepEqual(classifyShieldRequest("Mozilla/5.0 HeadlessChrome/126.0", "en"), { status: "blocked", blockReason: "automation_user_agent" });
  assert.deepEqual(classifyShieldRequest("Mozilla/5.0 Chrome/126.0", ""), { status: "blocked", blockReason: "missing_accept_language" });
  assert.deepEqual(classifyShieldRequest("Mozilla/5.0 Chrome/126.0", "en-US"), { status: "allowed", blockReason: null });
  const record = { id: "cache-id", slug: "cache-test", destination_url: "https://example.com", strict_mode: false };
  cacheShieldLink(record);
  assert.deepEqual(getCachedShieldLink("cache-test"), record);
  invalidateShieldLinkCache("cache-test");
  assert.equal(getCachedShieldLink("cache-test"), null);
});

test("hit analytics coalesces repeats into one Supabase REST RPC batch", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  let body;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://db.example/rest/v1/rpc/record_shield_link_click_batch");
    assert.equal(options.headers.apikey, "test-secret");
    body = JSON.parse(options.body);
    return new Response(null, { status: 204 });
  });
  t.after(() => {
    oldUrl === undefined ? delete process.env.SUPABASE_URL : process.env.SUPABASE_URL = oldUrl;
    oldKey === undefined ? delete process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  await Promise.all([1, 2, 3].map(() => recordShieldHit({ shield_link_id: "link-uuid", zone_id: "zone-a", status: "blocked", block_reason: "automation_user_agent" })));
  assert.deepEqual(body.p_hits, [{ shield_link_id: "link-uuid", zone_id: "zone-a", status: "blocked", block_reason: "automation_user_agent", count: 3 }]);
});

test("Shield Links route applies Free vs. Pro permissions and limits", async (t) => {
  process.env.SUPABASE_URL = "https://db.example";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-secret";
  process.env.PRO_MASTER_KEYS = "test-pro-key";
  const rows = new Map();
  t.after(() => mock.restoreAll());
  mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://db.example/rest/v1/rpc/create_shield_link_for_tier");
    const { p_slug, p_creator, p_pro } = JSON.parse(options.body);
    assert.match(p_creator, /^[a-f0-9]{64}$/);
    if (!p_pro && [...rows.values()].filter((owner) => owner === p_creator).length >= 3) return Response.json("limit");
    if (rows.has(p_slug)) return Response.json("conflict");
    rows.set(p_slug, p_creator);
    return Response.json("created");
  });
  const create = (customSlug, key, ip = "8.8.8.8") => POST(new NextRequest(site + "/api/shield-links", {
    method: "POST", headers: { "x-forwarded-for": ip, ...(key && { "x-pro-key": key }) },
    body: JSON.stringify({ destinationUrl: "https://example.com", customSlug }),
  }));
  assert.equal((await create("free-brand")).status, 403);
  assert.equal((await create("admin", "test-pro-key")).status, 400);
  for (let index = 0; index < 3; index++) {
    const response = await create();
    assert.equal(response.status, 200);
    assert.match((await response.json()).slug, /^[a-z0-9]{7}$/);
  }
  assert.equal((await create()).status, 403);
  assert.equal((await create(undefined, undefined, "1.1.1.1")).status, 200);
  for (const slug of ["test-brand", "another-brand", "third-brand", "fourth-brand"]) {
    const response = await create(slug, "test-pro-key");
    assert.equal(response.status, 200);
    assert.equal((await response.json()).shieldUrl, site + "/go/" + slug);
  }
  assert.equal((await create("test-brand", "test-pro-key")).status, 409);
});

test("CSV route requires both credentials and exports current counters", async (t) => {
  process.env.PRO_MASTER_KEYS = "test-pro-key";
  const token = "a".repeat(32);
  t.after(() => mock.restoreAll());
  mock.method(globalThis, "fetch", async (target) => {
    const query = new URL(target).searchParams;
    if (String(target).includes("/shield_link_zone_stats?")) return Response.json([{ zone_id: "zone-a", human_clicks: 3, blocked_bots: 2 }]);
    assert.equal(query.get("slug"), "eq.test-brand");
    return Response.json(query.get("manage_token") === "eq." + token
      ? [{ id: "link-uuid", slug: "test-brand", destination_url: "https://example.com/a,b", created_at: "2026-11-17T00:00:00Z", human_clicks: 3, blocked_bots: 1 }]
      : []);
  });
  const url = site + "/api/shield-links/test-brand/export";
  const context = { params: Promise.resolve({ slug: "test-brand" }) };
  assert.equal((await exportCsv(new Request(url), context)).status, 403);
  assert.equal((await exportCsv(new Request(url, { headers: { "x-pro-key": "test-pro-key" } }), context)).status, 404);
  const result = await exportCsv(new Request(url, { headers: { "x-pro-key": "test-pro-key", "x-manage-token": token } }), context);
  assert.equal(result.status, 200);
  const csv = await result.text();
  assert.match(csv, /"https:\/\/example.com\/a,b","2026-11-17T00:00:00Z","3","1","4","25.00%"/);
  assert.match(csv, /Zone ID Breakdown\r\nzone_id,human_visits,blocked_bots,total_hits,bot_block_rate\r\n"zone-a","3","2","5","40\.00%"/);
});
