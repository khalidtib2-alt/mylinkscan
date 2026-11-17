const assert = require("node:assert/strict");
const { test } = require("node:test");

test("popup saves and clears Pro, creates a custom link, and shows the Free upgrade path", async (t) => {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) {
      elements.set(id, {
        value: "",
        hidden: true,
        listeners: {},
        addEventListener(name, callback) { this.listeners[name] = callback; },
        querySelector: element,
      });
    }
    return elements.get(id);
  }

  const stored = {};
  let tabReads = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.method, "POST");
    if (url.endsWith("/api/pro/verify")) {
      assert.equal(options.headers["x-pro-key"], "example-pro-key");
      return Response.json({ pro: true });
    }
    assert.equal(url, "https://mylinkscan.vercel.app/api/shield-links");
    if (!options.headers["x-pro-key"]) {
      assert.deepEqual(JSON.parse(options.body), { destinationUrl: "https://example.com/" });
      return Response.json({ error: "Free supports 3 active Shield Links." }, { status: 403 });
    }
    assert.equal(options.headers["x-pro-key"], "example-pro-key");
    assert.deepEqual(JSON.parse(options.body), { destinationUrl: "https://example.com/", customSlug: "your-brand" });
    return Response.json({ slug: "your-brand", manageToken: "fixture" });
  });

  globalThis.document = { querySelector: element, querySelectorAll: () => [] };
  globalThis.chrome = {
    storage: { local: {
      get: async () => stored,
      set: async (values) => Object.assign(stored, values),
      remove: async (key) => { delete stored[key]; },
    } },
    tabs: { query: async () => { tabReads++; return [{ url: "https://example.com/" }]; } },
  };
  t.after(() => { delete globalThis.document; delete globalThis.chrome; });

  await import("../chrome-extension/popup.js");
  assert.equal(tabReads, 0);
  element("#pro-key").value = "example-pro-key";
  element("#pro-form").listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(stored.proKey, "example-pro-key");
  assert.equal(element("#custom-slug-field").hidden, false);

  element("#custom-slug").value = "your-brand";
  await element("#protect-link").listeners.click();
  assert.equal(tabReads, 1);
  assert.equal(element("#shield-url").value, "https://mylinkscan.vercel.app/go/your-brand");
  element("#clear-pro").listeners.click();
  await new Promise(setImmediate);
  assert.equal(stored.proKey, undefined);
  assert.equal(element("#custom-slug-field").hidden, true);

  await element("#protect-link").listeners.click();
  assert.equal(element("#shield-upgrade").hidden, false);
  assert.equal(tabReads, 1);
});
