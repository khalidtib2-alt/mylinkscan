import { serviceOrigin, reportUrl, scanUrl } from "./shared.js";

const input = document.querySelector("#url");
const status = document.querySelector("#status");
const findings = document.querySelector("#findings");
const liveReport = document.querySelector("#live-report");
const openReport = document.querySelector("#full-report");
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
