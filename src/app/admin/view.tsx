"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Order = {
  id: string; customer_email: string; payment_method: string; network: string | null; asset: string | null;
  amount_usd: number; currency: string; plan: string; tx_hash: string | null; creem_order_id: string | null;
  creem_transaction_id: string | null; creem_subscription_id: string | null; license_key: string | null;
  status: string; review_note: string | null; created_at: string; expires_at: string | null;
};
type Subscription = { creem_subscription_id: string; customer_email: string; status: string; current_period_end: string | null; latest_order_id?: string | null };
type Props = { authenticated: boolean };

export default function AdminDashboard({ authenticated: initialAuth }: Props) {
  const [authenticated, setAuthenticated] = useState(initialAuth);
  const [secret, setSecret] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/orders", { cache: "no-store" });
    if (response.status === 401) { setAuthenticated(false); return; }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load orders.");
    setOrders(data.orders || []);
    setSubscriptions(data.subscriptions || []);
  }, []);

  useEffect(() => { if (authenticated) void load().catch((error) => setMessage(error.message)); }, [authenticated, load]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy("login"); setMessage(""); setMessageError(false);
    try {
      const response = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed.");
      setSecret(""); setAuthenticated(true); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Login failed."); }
    finally { setBusy(""); }
  }

  async function action(actionName: string, id?: string) {
    setBusy(id || actionName); setMessage(""); setMessageError(false);
    try {
      const response = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...(id && { id }), ...(actionName === "manual_comp" && { email }) }) });
      const type = response.headers.get("content-type") || "";
      if (type.includes("text/csv")) {
        if (!response.ok) throw new Error("CSV export failed.");
        const link = document.createElement("a"); const objectUrl = URL.createObjectURL(await response.blob());
        link.href = objectUrl; link.download = "mylinkscan-pro-orders.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed.");
      const actionMessage = data.message || (data.licenseKey ? `Action complete. New key: ${data.licenseKey}` : "Action complete.");
      setMessage(data.emailSent === false && ["approve", "manual_comp"].includes(actionName) ? `${actionMessage} Email status: ${data.emailReason || "No customer email available."}` : actionMessage);
      setMessageError(data.emailSent === false && ["approve", "manual_comp"].includes(actionName));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed."); setMessageError(true); }
    finally { setBusy(""); }
  }

  async function logout() {
    await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "logout" }) });
    setAuthenticated(false); setOrders([]); setSubscriptions([]);
  }

  const filtered = useMemo(() => orders.filter((order) => {
    const text = `${order.customer_email} ${order.tx_hash || ""} ${order.creem_order_id || ""} ${order.creem_transaction_id || ""} ${order.license_key || ""}`.toLowerCase();
    return (statusFilter === "all" || order.status === statusFilter) && text.includes(search.toLowerCase());
  }), [orders, search, statusFilter]);

  const metrics = useMemo(() => {
    const revenue = (list: Order[]) => list.reduce((sum, row) => sum + Number(row.amount_usd || 0), 0);
    const activeSubs = subscriptions.filter((row) => ["active", "trialing", "scheduled_cancel"].includes(row.status));
    const orderById = new Map(orders.map((row) => [row.id, row]));
    const mrr = activeSubs.reduce((sum, sub) => {
      const order = orders.find((row) => row.creem_subscription_id === sub.creem_subscription_id) || orderById.get(sub.latest_order_id || "");
      if (!order) return sum;
      return sum + (order.plan === "year" ? Number(order.amount_usd) / 12 : Number(order.amount_usd));
    }, 0);
    return {
      total: revenue(orders), card: revenue(orders.filter((row) => row.payment_method === "creem")),
      crypto: revenue(orders.filter((row) => row.payment_method.startsWith("crypto_"))), active: activeSubs.length,
      mrr, pending: orders.filter((row) => row.status === "pending_review").length,
    };
  }, [orders, subscriptions]);

  if (!authenticated) return <main className="grid min-h-screen place-items-center bg-slate-950 px-4 text-slate-100"><form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6"><h1 className="text-2xl font-bold">MyLinkscan Admin</h1><p className="mt-2 text-sm text-slate-400">Sign in with the dashboard secret.</p><label htmlFor="admin-secret" className="mt-5 block text-sm">Dashboard secret</label><input id="admin-secret" type="password" autoComplete="current-password" required value={secret} onChange={(event) => setSecret(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3" />{message && <p role="alert" className="mt-3 text-sm text-rose-300">{message}</p>}<button disabled={busy === "login"} className="mt-4 w-full rounded-lg bg-emerald-400 p-3 font-semibold text-slate-950">{busy ? "Signing in…" : "Sign in"}</button></form></main>;

  const cards = [["Total Revenue", usd(metrics.total)], ["Creem Card Revenue", usd(metrics.card)], ["Direct Crypto", usd(metrics.crypto)], ["Active Subscriptions", String(metrics.active)], ["Monthly Recurring Revenue", usd(metrics.mrr)], ["Pending Orders", String(metrics.pending)]];
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8"><div className="mx-auto max-w-7xl"><header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">Owner Console</p><h1 className="mt-1 text-3xl font-extrabold">Revenue & Orders</h1></div><div className="flex gap-2"><button onClick={() => void load()} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Refresh</button><button onClick={() => void action("export")} className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950">Export CSV</button><button onClick={() => void logout()} className="rounded-lg border border-slate-700 px-4 py-2 text-sm">Log out</button></div></header>
    {message && <p role={messageError ? "alert" : "status"} className={`mt-4 break-all rounded-xl border bg-slate-900 p-3 text-sm ${messageError ? "border-amber-700 text-amber-200" : "border-slate-700 text-emerald-200"}`}>{message}</p>}
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([title, value]) => <div key={title} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5"><p className="text-sm text-slate-400">{title}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</section>
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5"><h2 className="text-lg font-bold">Create Manual Complimentary Key</h2><form onSubmit={(event) => { event.preventDefault(); void action("manual_comp"); }} className="mt-3 flex flex-col gap-2 sm:flex-row"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="customer@example.com" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2" /><button disabled={!!busy} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold">Create 30-day key</button></form></section>
    <section className="mt-6"><div className="flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search email, TX hash, order ID, license…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"><option value="all">All statuses</option>{["active", "pending_review", "revoked", "expired", "rejected"].map((value) => <option key={value}>{value}</option>)}</select></div>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-800"><table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-slate-900 text-slate-400"><tr>{["Date", "Customer", "Method", "Amount", "TX / Creem ID", "License", "Status", "Expires", "Actions"].map((item) => <th key={item} className="px-3 py-3 font-semibold">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-800">{filtered.map((order) => <tr key={order.id} className="align-top"><td className="whitespace-nowrap px-3 py-3">{new Date(order.created_at).toLocaleString()}</td><td className="px-3 py-3">{order.customer_email}</td><td className="px-3 py-3">{methodLabel(order)}</td><td className="px-3 py-3">{usd(Number(order.amount_usd))}{order.currency !== "USD" && ` (${order.currency})`}</td><td className="max-w-48 break-all px-3 py-3">{order.tx_hash ? <a className="text-emerald-300 underline" target="_blank" rel="noreferrer" href={order.network === "tron" ? `https://tronscan.org/#/transaction/${order.tx_hash}` : `https://polygonscan.com/tx/${order.tx_hash}`}>{order.tx_hash}</a> : order.creem_transaction_id || order.creem_order_id || order.creem_subscription_id || "-"}</td><td className="max-w-56 break-all px-3 py-3">{order.license_key ? <span className="flex items-start gap-2"><code>{order.license_key}</code><button aria-label="Copy license key" title="Copy license key" onClick={() => void navigator.clipboard.writeText(order.license_key!)} className="text-emerald-300">Copy</button></span> : "-"}</td><td className="px-3 py-3"><span className={order.status === "active" ? "text-emerald-300" : order.status === "pending_review" ? "text-amber-300" : "text-slate-300"}>{order.status}</span>{order.review_note && <p className="mt-1 max-w-48 text-slate-500">{order.review_note}</p>}</td><td className="whitespace-nowrap px-3 py-3">{order.expires_at ? new Date(order.expires_at).toLocaleDateString() : "-"}</td><td className="px-3 py-3"><div className="flex flex-col gap-1">{order.status === "pending_review" && <button disabled={!!busy} onClick={() => void action("approve", order.id)} className="rounded bg-emerald-500/20 px-2 py-1 text-emerald-200">Approve</button>}{order.status === "active" && <><button disabled={!!busy} onClick={() => void action("resend_key_email", order.id)} className="rounded bg-emerald-950 px-2 py-1 text-emerald-200">Resend Email</button><button disabled={!!busy} onClick={() => void action("extend", order.id)} className="rounded bg-slate-800 px-2 py-1">+30 days</button><button disabled={!!busy} onClick={() => void action("revoke", order.id)} className="rounded bg-rose-950 px-2 py-1 text-rose-200">Revoke / cancel</button></>}</div></td></tr>)}</tbody></table>{!filtered.length && <p className="p-6 text-center text-sm text-slate-500">No matching orders.</p>}</div>
    </section></div></main>;
}

function usd(amount: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0); }
function methodLabel(order: Order) { if (order.payment_method === "crypto_polygon") return `Polygon ${order.asset || ""}`; if (order.payment_method === "crypto_tron") return `Tron ${order.asset || ""}`; if (order.payment_method === "creem") return "Creem Card"; return "Manual comp"; }
