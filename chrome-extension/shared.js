const watchedDomains = ["google.com", "paypal.com", "microsoft.com", "apple.com", "amazon.com", "github.com"];
const watchedTlds = new Set(["zip", "mov", "top", "xyz", "click", "work", "cam", "tk"]);

function oneEditAway(left, right) {
  if (left === right || Math.abs(left.length - right.length) > 1) return false;
  if (left.length > right.length) return oneEditAway(right, left);
  let index = 0;
  while (index < left.length && left[index] === right[index]) index++;
  if (left.length < right.length) return left.slice(index) === right.slice(index + 1);
  return left.slice(index + 1) === right.slice(index + 1) ||
    (left[index] === right[index + 1] && left[index + 1] === right[index] &&
      left.slice(index + 2) === right.slice(index + 2));
}

/** @param {string} input */
export function scanUrl(input) {
  const value = input.trim();
  if (!value || /\s/.test(value)) throw new Error("Enter a URL without spaces.");
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
  if (/^(?:javascript|data|file|mailto|blob|ftp):/i.test(value)) {
    throw new Error("Enter an HTTP or HTTPS URL.");
  }
  const url = new URL(hasScheme ? value : "https://" + value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enter an HTTP or HTTPS URL.");
  const host = url.hostname.replace(/\.$/, "");
  if (!host.includes(".") && !host.startsWith("[")) throw new Error("Enter a domain or IP address.");
  const labels = host.split(".");
  const warnings = [];
  if (watchedTlds.has(labels.at(-1) ?? "")) warnings.push("The domain uses a higher-risk TLD in this heuristic.");
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith("[")) warnings.push("The URL uses an IP address as its hostname.");
  if (url.protocol === "http:") warnings.push("HTTP leaves the connection unencrypted.");
  if (value.length > 200) warnings.push("The URL is longer than 200 characters.");
  if (url.username || url.password) warnings.push("The URL contains user information before the hostname.");
  if (labels.some((label) => label.startsWith("xn--"))) warnings.push("The hostname uses Punycode. Check its spelling carefully.");
  for (const domain of watchedDomains) {
    if (host === domain || host.endsWith("." + domain)) continue;
    const brand = domain.split(".")[0];
    if (labels.slice(0, -1).some((label) => {
      const normalized = label.replace(/[0135]/g, (digit) => ({ "0": "o", "1": "l", "3": "e", "5": "s" })[digit] ?? digit);
      return normalized === brand || oneEditAway(normalized, brand);
    })) {
      warnings.push("The hostname resembles " + domain + " or uses its brand name.");
    }
  }
  return { host, warnings, assumedHttps: !hasScheme };
}

export const serviceOrigin = "https://mylinkscan.vercel.app";

/** @param {string} input */
export function reportUrl(input) {
  const value = input.trim();
  if (value.length > 2048) throw new Error("Enter a URL up to 2,048 characters.");
  const { assumedHttps } = scanUrl(value);
  const target = new URL(assumedHttps ? "https://" + value : value);
  if (target.username || target.password) throw new Error("Remove embedded credentials before scanning.");
  target.hash = "";
  const report = new URL("/", serviceOrigin);
  report.searchParams.set("url", target.href);
  return report.href;
}
