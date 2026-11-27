type ShieldHit = {
  shield_link_id: string;
  zone_id: string | null;
  status: "allowed" | "blocked";
  block_reason: string | null;
};

type PendingHit = ShieldHit & { count: number };

const pending = new Map<string, PendingHit>();
let flushPromise: Promise<void> | null = null;
const MAX_PENDING_GROUPS = 1_000;

/** Coalesces identical hits briefly so request bursts become one HTTPS RPC batch. */
export function recordShieldHit(hit: ShieldHit): Promise<void> {
  let normalized = hit;
  let key = JSON.stringify([normalized.shield_link_id, normalized.zone_id, normalized.status, normalized.block_reason]);
  if (!pending.has(key) && pending.size >= MAX_PENDING_GROUPS) {
    // Preserve aggregate human/bot totals under high-cardinality zone floods.
    normalized = { ...hit, zone_id: null };
    key = JSON.stringify([normalized.shield_link_id, null, normalized.status, normalized.block_reason]);
  }
  const existing = pending.get(key);
  if (existing) existing.count += 1;
  else pending.set(key, { ...normalized, count: 1 });
  if (!flushPromise) flushPromise = flushLoop().finally(() => { flushPromise = null; });
  return flushPromise;
}

async function flushLoop() {
  // Let concurrent after() callbacks in this warm instance join the same batch.
  await new Promise((resolve) => setTimeout(resolve, 20));
  while (pending.size) {
    const batch = [...pending.values()];
    pending.clear();
    const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!base || !key) continue;
    try {
      await fetch(base + "/rest/v1/rpc/record_shield_link_click_batch", {
        method: "POST",
        headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ p_hits: batch }),
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      // A failed analytics write never delays or changes the visitor redirect.
    }
  }
}
