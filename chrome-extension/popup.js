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
let manageToken = "";
for (const button of document.querySelectorAll("[data-tool-path]")) {
  button.addEventListener("click", () => {
    void chrome.tabs.create({ url: new URL(button.dataset.toolPath, serviceOrigin).href });
  });
}
let activeScan;
let inputChanged = false;

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
  const value = input.value.trim();
  let local;
  try {
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
  inputChanged = true;
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
  shieldPanel.hidden = false;
  shieldResult.hidden = true;
  manageToken = "";
  shieldInput.value = "";
  try {
    const destinationUrl = new URL(reportUrl(input.value)).searchParams.get("url");
    protect.disabled = true;
    shieldStatus.textContent = "Creating Shield Link…";
    const response = await fetch(serviceOrigin + "/api/shield-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationUrl }),
      signal: AbortSignal.timeout(12000),
      credentials: "omit",
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not create the Shield Link.");
    if (!/^[a-z0-9]{7}$/.test(data.slug ?? "") || typeof data.manageToken !== "string" || !data.manageToken) {
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

async function fillActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (inputChanged || !/^https?:\/\//i.test(tab?.url ?? "")) return;
    input.value = tab.url;
    void inspect();
  } catch {
    // Restricted tabs can still scan a pasted URL.
  }
}

void fillActiveTab();
