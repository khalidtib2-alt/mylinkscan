export type ProLicenseEmailInput = {
  email: string;
  licenseKey: string;
  plan: string;
  expiresAt: string;
};

export type ProLicenseEmailResult = { sent: true } | { sent: false; reason: string };

const ACTIVATION_URL = "https://mylinkscan.com/shield-links";

export async function sendProLicenseEmail(input: ProLicenseEmailInput): Promise<ProLicenseEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY not configured" };

  const email = input.email.trim();
  if (!email || email.length > 254) return { sent: false, reason: "Customer email is missing or invalid" };
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "MyLinkscan <noreply@mylinkscan.com>";
  const replyTo = process.env.RESEND_REPLY_TO?.trim() || "support.mylinkscan@gmail.com";
  const planDuration = durationLabel(input.plan);
  const expiration = formatDate(input.expiresAt);
  const safeKey = escapeHtml(input.licenseKey);
  const safeEmail = escapeHtml(email);
  const safeDuration = escapeHtml(planDuration);
  const safeExpiration = escapeHtml(expiration);
  const html = `<!doctype html><html><body style="margin:0;background:#020617;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#020617;padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#0f172a;border:1px solid #1e293b;border-radius:18px"><tr><td style="padding:30px"><div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#34d399">MYLINKSCAN PRO</div><h1 style="margin:12px 0 8px;color:#f8fafc;font-size:25px">Your Pro license key</h1><p style="margin:0 0 22px;color:#cbd5e1;line-height:1.6">Thanks for upgrading MyLinkscan. Your key and plan details are below.</p><div style="padding:16px;border:1px solid #166534;border-radius:12px;background:#052e16"><div style="font-size:12px;color:#a7f3d0">LICENSE KEY</div><div style="margin-top:8px;word-break:break-all;font-family:Consolas,monospace;font-size:15px;color:#fff">${safeKey}</div></div><table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:18px;font-size:14px;color:#cbd5e1"><tr><td style="padding:5px 14px 5px 0">Plan</td><td style="padding:5px 0;color:#fff">${safeDuration}</td></tr><tr><td style="padding:5px 14px 5px 0">Expires</td><td style="padding:5px 0;color:#fff">${safeExpiration}</td></tr><tr><td style="padding:5px 14px 5px 0">Account email</td><td style="padding:5px 0;color:#fff">${safeEmail}</td></tr></table><p style="margin:24px 0 16px"><a href="${ACTIVATION_URL}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#34d399;color:#022c22;text-decoration:none;font-weight:bold">Activate your Pro key</a></p><p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6">You can also paste the key in the Pro upgrade dialog on the Shield Links page. Keep this email private because the key grants Pro access.</p></td></tr></table><p style="margin:14px 0 0;color:#64748b;font-size:11px">MyLinkscan · <a href="${ACTIVATION_URL}" style="color:#34d399">mylinkscan.com</a></p></td></tr></table></body></html>`;
  const text = [
    "Your MyLinkscan Pro license key",
    "",
    `License key: ${input.licenseKey}`,
    `Plan: ${planDuration}`,
    `Expiration date: ${expiration}`,
    `Customer email: ${email}`,
    "",
    `Activate your key: ${ACTIVATION_URL}`,
    "",
    "Keep this email private because the key grants Pro access.",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], reply_to: replyTo, subject: "Your MyLinkscan Pro License Key", html, text }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      const reason = typeof data?.message === "string" ? data.message.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/https?:\/\/\S+/gi, "[endpoint]").replaceAll(apiKey, "[redacted]").replace(/\s+/g, " ").trim().slice(0, 180) : `Resend request failed (HTTP ${response.status})`;
      return { sent: false, reason: reason || `Resend request failed (HTTP ${response.status})` };
    }
    return { sent: true };
  } catch {
    return { sent: false, reason: "Resend delivery request failed" };
  }
}

function durationLabel(plan: string) {
  if (plan === "year") return "1 year Pro plan";
  if (plan === "month") return "1 month Pro plan";
  if (plan === "comp") return "30-day complimentary Pro access";
  return "Pro plan";
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "See your Shield Links account";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(timestamp);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
