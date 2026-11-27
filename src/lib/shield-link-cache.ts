export type ShieldLinkRecord = {
  id: string;
  slug: string;
  destination_url: string;
  strict_mode: boolean;
};

const TTL_MS = 45_000;
const MISS_TTL_MS = 1_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, { data: ShieldLinkRecord; expiresAt: number }>();
const misses = new Map<string, number>();

export function getCachedShieldLink(slug: string): ShieldLinkRecord | null {
  const entry = cache.get(slug);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(slug);
    return null;
  }
  // Refresh insertion order to approximate LRU for active slugs.
  cache.delete(slug);
  cache.set(slug, entry);
  return entry.data;
}

export function cacheShieldLink(data: ShieldLinkRecord): void {
  misses.delete(data.slug);
  cache.delete(data.slug);
  cache.set(data.slug, { data, expiresAt: Date.now() + TTL_MS });
  const now = Date.now();
  for (const [slug, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(slug);
  }
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function isCachedShieldLinkMiss(slug: string): boolean {
  const expiresAt = misses.get(slug);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    misses.delete(slug);
    return false;
  }
  return true;
}

export function cacheShieldLinkMiss(slug: string): void {
  misses.delete(slug);
  misses.set(slug, Date.now() + MISS_TTL_MS);
  while (misses.size > MAX_ENTRIES) {
    const oldest = misses.keys().next().value;
    if (oldest === undefined) break;
    misses.delete(oldest);
  }
}

export function invalidateShieldLinkCache(slug?: string): void {
  if (slug) {
    cache.delete(slug);
    misses.delete(slug);
  } else {
    cache.clear();
    misses.clear();
  }
}
