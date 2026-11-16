import { publicAddress } from "../public-address";
import { userAgentSignal, type Signal } from "../../bot-shield/signals";
export const runtime = "nodejs";

function reply(body: object, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function network(ip: string): Promise<Signal[]> {
  if (ip.includes("%") || !publicAddress(ip)) return [{label:"Public IP / ASN", detail:"Unavailable", penalty:0}];
  const signals: Signal[] = [{label:"Public IP", detail:ip, penalty:0}];
  try {
    const url = new URL("/" + ip, "https://ipwho.is");
    url.searchParams.set("fields", "success,connection");
    const response = await fetch(url, { cache:"no-store", redirect:"error", signal:AbortSignal.timeout(4000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    const result = await response.json();
    if (result?.success !== true || !result.connection) throw new Error();
    const { isp, org, asn } = result.connection;
    const names = [...new Set([isp, org].filter((name) => typeof name === "string" && name.trim()))];
    const match = names.join(" ").match(/\b(?:aws|amazon|google cloud|azure|digitalocean|hetzner|ovh(?:cloud)?|linode|vultr|alibaba|oracle|hosting|data[ -]?cent(?:er|re))\b/i);
    signals.push({label:"ISP / ASN organization", detail:[Number.isInteger(asn) && "AS"+asn,...names].filter(Boolean).join(" · ") || "Unavailable", penalty:0});
    signals.push({label:"Hosting / datacenter", detail:match ? "Hosting marker: "+match[0] : names.length ? "No listed hosting marker" : "Unavailable", penalty:match ? 60 : 0});
  } catch {
    signals.push({label:"ISP / ASN lookup", detail:"Unavailable", penalty:0});
  }
  return signals;
}

export async function GET(request: Request) {
  const headers = request.headers;
  const language = headers.get("accept-language");
  const country = [headers.get("cf-ipcountry"), headers.get("x-vercel-ip-country")].find((value) => value && /^[A-Z]{2}$/i.test(value));
  return reply({signals:[
    userAgentSignal(headers.get("user-agent") ?? ""),
    {label:"Accept-Language",detail:language?.slice(0,160) || "Unavailable",penalty:language ? 0 : 8},
    {label:"Browser client hints",detail:headers.get("sec-ch-ua")?.slice(0,200) || "Unavailable",penalty:0},
    {label:"Country header",detail:country ?? "Unavailable",penalty:0},
    ...await network(headers.get("x-forwarded-for")?.split(",")[0].trim() ?? ""),
  ]});
}

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return reply({error:"Cross-site requests are unsupported."},403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return reply({error:"Send an application/json body."},415);
  const reader = request.body?.getReader();
  if (!reader) return reply({error:"Missing request body."},400);
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); },4000);
  let input;
  try {
    const decoder = new TextDecoder();
    let raw = "";
    let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 8192) return reply({error:"Request is too large."},413);
      raw += decoder.decode(chunk.value,{stream:true});
    }
    input = JSON.parse(raw + decoder.decode());
  } catch {
    return reply({error:"Invalid request body."},400);
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
  if (typeof input?.ip === "string" && input.userAgent === undefined) {
    const ip = input.ip.trim();
    if (!publicAddress(ip) || ip.includes("%")) return reply({error:"Enter a public IPv4 or IPv6 address."},400);
    return reply({signals:await network(ip)});
  }
  if (typeof input?.userAgent === "string" && input.ip === undefined && input.userAgent.trim() && input.userAgent.length <= 1024) {
    return reply({signals:[userAgentSignal(input.userAgent.trim())]});
  }
  return reply({error:"Enter one public IP address or a User-Agent up to 1,024 characters."},400);
}
