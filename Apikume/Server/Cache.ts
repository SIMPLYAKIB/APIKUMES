export function formatDurationDhms(seconds: number) {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

export class CompressedMemoryCache {
  public store = new Map<string, { buffer: Buffer; size: number; expiresAt: number }>();
  public currentTotalBytes = 0;
  public hitCount = 0;
  public missCount = 0;

  getWithMeta(_key: string): any {
    this.missCount++;
    return null;
  }

  get(_key: string): any {
    this.missCount++;
    return null;
  }

  set(_key: string, _value: any, _ttlSeconds: number) {
    return false;
  }

  delete(_key: string) {
    return false;
  }

  has(_key: string) {
    return false;
  }

  clearWithStats() {
    this.store.clear();
    this.currentTotalBytes = 0;
    return {
      cleared_items: 0,
      freed_bytes: 0,
      freed_kb: "0.00 KB",
      freed_mb: "0.0000 MB",
      freed_gb: "0.000000 GB",
      percent_freed_of_max_capacity: "0.00%",
      by_category: {}
    };
  }

  clear() {
    this.store.clear();
    this.currentTotalBytes = 0;
  }

  categorizeKey(key: string) {
    if (key.startsWith("details:") || key.startsWith("overview:")) return "anime_details";
    if (key.startsWith("episodes:")) return "anime_episodes";
    if (key.startsWith("characters:")) return "anime_characters";
    if (key.startsWith("recommendations:")) return "anime_recommendations";
    if (key.startsWith("season:")) return "anime_season";
    if (key.startsWith("watch:")) return "anime_watch";
    if (key.startsWith("map:") || key.startsWith("animap:")) return "id_mappings";
    if (key.startsWith("catalog:")) return "anime_catalog";
    if (key.startsWith("search5:") || key.startsWith("search:")) return "search";
    if (key.startsWith("browse:")) return "browse";
    if (key.startsWith("filler:")) return "anime_filler";
    return "other";
  }

  getStats() {
    return {
      itemCount: 0,
      totalBytes: 0,
      totalMB: "0.00 MB",
      maxMB: 0,
      hitCount: 0,
      missCount: this.missCount,
      by_category: {},
      active_entries: []
    };
  }

  cleanExpired() {
    this.store.clear();
  }
}

export const serverCache = new CompressedMemoryCache();
serverCache.clear();
