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
const { GET: exportCsv } = require("../src/app/api/shield-links/[slug]/export/route.ts");
const { validCustomSlug } = require("../src/lib/shield-links.ts");
const site = "https://mylinkscan.vercel.app";

test("custom slugs enforce length, syntax, and reserved names", () => {
  for (const value of ["abc", "your-brand", "a".repeat(32)]) assert.equal(validCustomSlug(value), true);
  for (const value of ["api", "admin", "stats", "pro", "ab", "a".repeat(33), "My-Brand", "two/parts"]) {
    assert.equal(validCustomSlug(value), false, value);
  }
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
    assert.equal(query.get("slug"), "eq.test-brand");
    return Response.json(query.get("manage_token") === "eq." + token
      ? [{ slug: "test-brand", destination_url: "https://example.com/a,b", created_at: "2026-11-17T00:00:00Z", human_clicks: 3, blocked_bots: 1 }]
      : []);
  });
  const url = site + "/api/shield-links/test-brand/export";
  const context = { params: Promise.resolve({ slug: "test-brand" }) };
  assert.equal((await exportCsv(new Request(url), context)).status, 403);
  assert.equal((await exportCsv(new Request(url, { headers: { "x-pro-key": "test-pro-key" } }), context)).status, 404);
  const result = await exportCsv(new Request(url, { headers: { "x-pro-key": "test-pro-key", "x-manage-token": token } }), context);
  assert.equal(result.status, 200);
  assert.match(await result.text(), /"https:\/\/example.com\/a,b","2026-11-17T00:00:00Z","3","1","4","25.00%"/);
});
