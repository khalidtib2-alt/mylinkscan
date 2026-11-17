import { serviceOrigin, reportUrl, scanUrl } from "./shared.js";

const input = document.querySelector("#url");
const status = document.querySelector("#status");
const findings = document.querySelector("#findings");
const liveReport = document.querySelector("#live-report");
const openReport = document.querySelector("#full-report");
const protect = document.querySelector("#protect-link");
const shieldPanel = document.querySelector(".shield-panel");
const shieldStatus = document.querySelector("#shield-status");
const shieldResult = document.querySelector("#shield-result");
const shieldInput = document.querySelector("#shield-url");
const upgrade = document.querySelector("#shield-upgrade");
const keyInput = document.querySelector("#pro-key");
const proForm = document.querySelector("#pro-form");
const proStatus = document.querySelector("#pro-status");
const clearPro = document.querySelector("#clear-pro");
const slugField = document.querySelector("#custom-slug-field");
const slugInput = document.querySelector("#custom-slug");
const slugPattern = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const storageKey = "proKey";
let proKey = "";
let manageToken = "";

function showPro(key) {
  proKey = key;
  slugField.hidden = !key;
  if (!key) slugInput.value = "";
  proStatus.textContent = key ? "Pro key active." : "No active Pro key.";
}

async function verifyPro(key) {
  const response = await fetch(serviceOrigin + "/api/pro/verify", {
    method: "POST",
    headers: { "x-pro-key": key },
    credentials: "omit",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  return response.ok && (await response.json()).pro === true;
}

async function changePro(action) {
  const save = proForm.querySelector("[type=submit]");
  save.disabled = clearPro.disabled = keyInput.disabled = true;
  try { await action(); }
  catch { proStatus.textContent = "Pro settings are temporarily unavailable."; }
  finally { save.disabled = clearPro.disabled = keyInput.disabled = false; }
}

proForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void changePro(async () => {
    const key = keyInput.value.trim();
    if (!key || !await verifyPro(key)) {
      proStatus.textContent = "This Pro key could not be verified.";
      return;
    }
    await chrome.storage.local.set({ [storageKey]: key });
    keyInput.value = "";
    showPro(key);
  });
});

clearPro.addEventListener("click", () => {
  void changePro(async () => {
    await chrome.storage.local.remove(storageKey);
    keyInput.value = "";
    showPro("");
  });
});

void changePro(async () => {
  const saved = (await chrome.storage.local.get(storageKey))[storageKey];
  showPro(typeof saved === "string" ? saved : "");
});
for (const button of document.querySelectorAll("[data-tool-path]")) {
  button.addEventListener("click", () => {
    void chrome.tabs.create({ url: new URL(button.dataset.toolPath, serviceOrigin).href });
  });
}
let activeScan;

async function requestedUrl() {
  const pasted = input.value.trim();
  if (pasted) return pasted;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const edited = input.value.trim();
  if (edited) return edited;
  if (!/^https?:\/\//i.test(tab?.url ?? "")) throw new Error("Paste a public HTTP or HTTPS URL.");
  input.value = tab.url;
  return tab.url;
}

function showFindings(warnings) {
  findings.replaceChildren(...warnings.map((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    return item;
  }));
  findings.hidden = warnings.length === 0;
}

function reset() {
  activeScan?.abort();
  delete status.dataset.verdict;
  liveReport.hidden = true;
  showFindings([]);
}

async function inspect() {
  reset();
  let value;
  let local;
  try {
    value = await requestedUrl();
    reportUrl(value);
    local = scanUrl(value);
  } catch (error) {
    status.textContent = error instanceof TypeError ? "Enter a valid HTTP or HTTPS URL." : error.message;
    openReport.disabled = true;
    return;
  }

  openReport.disabled = false;
  showFindings(local.warnings);
  status.textContent = local.warnings.length ? "Local warnings found. Checking live…" : "No local warnings. Checking live…";
  const controller = new AbortController();
  activeScan = controller;
  try {
    const response = await fetch(serviceOrigin + "/api/scan-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: value }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
      credentials: "omit",
      redirect: "error",
    });
    const result = await response.json();
    if (controller.signal.aborted) return;
    if (!response.ok) {
      status.textContent = result.error || "Live checks are unavailable.";
      return;
    }
    status.dataset.verdict = result.verdict;
    status.textContent = result.verdict + " · " + (result.issue || "Limited checks cannot guarantee safety.");
    showFindings([...new Set([...local.warnings, ...result.findings])]);
    document.querySelector("#destination").textContent = result.finalUrl || "Unconfirmed";
    document.querySelector("#feed").textContent = result.feed;
    liveReport.hidden = false;
  } catch {
    if (!controller.signal.aborted) status.textContent = "Live checks are unavailable. Local findings still apply.";
  }
}

input.addEventListener("input", () => {
  reset();
  status.textContent = "Select Scan Now to check this URL.";
  try {
    reportUrl(input.value);
    showFindings(scanUrl(input.value).warnings);
    openReport.disabled = false;
  } catch {
    openReport.disabled = true;
  }
});

document.querySelector("#scan-form").addEventListener("submit", (event) => {
  event.preventDefault();
  void inspect();
});

protect.addEventListener("click", async () => {
  protect.disabled = true;
  shieldPanel.hidden = false;
  shieldResult.hidden = true;
  upgrade.hidden = true;
  manageToken = "";
  shieldInput.value = "";
  try {
    const destinationUrl = new URL(reportUrl(await requestedUrl())).searchParams.get("url");
    const customSlug = proKey ? slugInput.value.trim() : "";
    if (customSlug && !slugPattern.test(customSlug)) {
      throw new Error("Use 3–32 lowercase letters, numbers, or hyphens, starting and ending with a letter or number.");
    }
    shieldStatus.textContent = "Creating Shield Link…";
    const response = await fetch(serviceOrigin + "/api/shield-links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(proKey && { "x-pro-key": proKey }) },
      body: JSON.stringify({ destinationUrl, ...(customSlug && { customSlug }) }),
      signal: AbortSignal.timeout(12000),
      credentials: "omit",
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok) {
      upgrade.hidden = response.status !== 403;
      throw new Error(data.error || "Could not create the Shield Link.");
    }
    if (typeof data.slug !== "string" || !slugPattern.test(data.slug) || typeof data.manageToken !== "string" || !data.manageToken) {
      throw new Error("MyLinkscan returned an incomplete Shield Link.");
    }
    shieldInput.value = new URL("/go/" + data.slug, serviceOrigin).href;
    manageToken = data.manageToken;
    shieldStatus.textContent = "Shield Link created.";
    shieldResult.hidden = false;
  } catch (error) {
    shieldStatus.textContent = error instanceof TypeError ? "Check the URL and your connection, then try again." : error.message || "Could not create the Shield Link.";
  } finally {
    protect.disabled = false;
  }
});

async function copyShieldValue(value, label) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    shieldStatus.textContent = label + " copied.";
  } catch {
    shieldStatus.textContent = "Clipboard unavailable. Try copying again.";
  }
}

document.querySelector("#copy-shield").addEventListener("click", () => {
  void copyShieldValue(shieldInput.value, "Shield Link");
});
document.querySelector("#copy-manage-token").addEventListener("click", () => {
  void copyShieldValue(manageToken, "Manage Token");
});

openReport.addEventListener("click", () => {
  void chrome.tabs.create({ url: reportUrl(input.value) });
});
