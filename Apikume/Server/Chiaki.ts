// @ts-nocheck
import { directProxyFetch } from "./Watch.js";

const TYPE_NAMES: Record<string, string> = {
  "1": "TV",
  "2": "OVA",
  "3": "Movie",
  "4": "Special",
  "5": "ONA",
  "6": "Music",
  "7": "CM",
  "8": "PV",
  "9": "TV Special"
};

export interface ChiakiWatchOrderItem {
  index: number;
  mal_id: number;
  anilist_id: number | null;
  title: string | null;
  alt_title: string | null;
  type_id: number | null;
  type: string | null;
  episodes: number | null;
  duration_seconds: number | null;
  release_date: string | null;
  meta_string: string | null;
  rating: {
    score: number | null;
    votes: number | null;
  };
  avatar: string | null;
  relations: Record<string, string>;
  breakers: Record<string, any>;
  external_links: {
    mal: string | null;
    anilist: string | null;
    shikimori: string | null;
    simkl: string | null;
  };
}

export interface ChiakiTimelineItem {
  avatar: string | null;
  title: string | null;
  date_range: string | null;
  time_start: number | null;
  time_end: number | null;
}

export interface ChiakiRelatedGroup {
  group_id: number | null;
  group_name: string;
  group_url: string;
  point_of_relationship: string;
  relationship_type: string;
}

export interface ChiakiWatchOrderResult {
  success: boolean;
  mal_id: number;
  page_title: string | null;
  source_url: string;
  total_entries: number;
  watch_order: ChiakiWatchOrderItem[];
  timeline: {
    time_min: number | null;
    time_max: number | null;
    total_items: number;
    items: ChiakiTimelineItem[];
  };
  related_groups: ChiakiRelatedGroup[];
}

const chiakiCache = new Map<number, { data: ChiakiWatchOrderResult; expiresAt: number }>();

export function clearChiakiCache() {
  chiakiCache.clear();
}

function decodeHtmlEntities(str: string | null | undefined): string | null {
  if (!str) return null;
  const decoded = str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/gi, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
}

async function fetchChiakiUrl(url: string): Promise<Response> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    "Referer": "https://chiaki.site/",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache"
  };
  try {
    const directRes = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (directRes.ok) return directRes;
  } catch {}

  try {
    const res = await directProxyFetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (res.ok) return res;
  } catch {}

  try {
    const proxyUrl = `https://minky.anistream.one/fetch?url=${encodeURIComponent(url)}`;
    const proxyRes = await fetch(proxyUrl, { headers, cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (proxyRes.ok) return proxyRes;
  } catch {}

  return directProxyFetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });
}

export async function fetchChiakiRawSearch(text: string): Promise<any> {
  const q = (text || "").trim();
  if (!q) return [];
  const searchUrl = `https://chiaki.site/?/tools/autocomplete_series&term=${encodeURIComponent(q)}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": "https://chiaki.site/"
  };

  try {
    const res = await fetch(searchUrl, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}

  const fallbackRes = await fetchChiakiUrl(searchUrl);
  if (!fallbackRes.ok) {
    throw new Error(`Chiaki search returned HTTP ${fallbackRes.status}`);
  }
  return await fallbackRes.json();
}

export async function searchChiakiByTitle(title: string): Promise<number | null> {
  if (!title || !title.trim()) return null;
  try {
    const data = await fetchChiakiRawSearch(title);
    if (Array.isArray(data) && data.length > 0) {
      const normTarget = title.toLowerCase().replace(/[^a-z0-9]/g, "");
      const exact = data.find((d: any) => d?.id && String(d.value || "").toLowerCase().replace(/[^a-z0-9]/g, "") === normTarget);
      const chosen = exact || data.find((d: any) => d?.id);
      if (chosen?.id) {
        const parsed = parseInt(String(chosen.id), 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }
    }
  } catch {}
  return null;
}

export async function fetchChiakiWatchOrder(malIdInput: string | number, _isFresh = false): Promise<ChiakiWatchOrderResult | null> {
  const malId = parseInt(String(malIdInput).trim(), 10);
  if (isNaN(malId) || malId < 1) {
    throw new Error(`Invalid MyAnimeList ID: '${malIdInput}'`);
  }

  const url = `https://chiaki.site/?/tools/watch_order/id/${malId}`;
  const res = await fetchChiakiUrl(url);

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Chiaki returned HTTP ${res.status} for MAL ID ${malId}`);
  }

  const html = await res.text();

  // Page title / heading
  const h2Match = html.match(/<h2>(.*?)<\/h2>/i);
  const heading = h2Match ? decodeHtmlEntities(h2Match[1]) : null;

  // 1. Watch Order Table items from #wo_list (supports <tr class="wo_row..." data-id="..."> and <tr data-id="...">)
  const trMatches = [...html.matchAll(/<tr\b([^>]*?\bdata-id="(\d+)"[^>]*)>([\s\S]*?)<\/tr>/gi)];
  const watchOrder: ChiakiWatchOrderItem[] = trMatches.map((m, idx) => {
    const attrs = m[1];
    const entryMalId = parseInt(m[2], 10);
    const body = m[3];

    const anilistIdMatch = attrs.match(/data-anilist-id="(\d+)"/i) || body.match(/https:\/\/anilist\.co\/anime\/(\d+)/i);
    const anilistId = anilistIdMatch ? parseInt(anilistIdMatch[1], 10) : null;

    const typeMatch = attrs.match(/data-type="(\d+)"/i);
    const typeId = typeMatch ? parseInt(typeMatch[1], 10) : null;
    const typeName = typeId ? (TYPE_NAMES[String(typeId)] || "Other") : null;

    const epsMatch = attrs.match(/data-eps="(\d+)"/i);
    const eps = epsMatch ? parseInt(epsMatch[1], 10) : null;

    const durationMatch = attrs.match(/data-duration="(\d+)"/i);
    const duration = durationMatch ? parseInt(durationMatch[1], 10) : null;

    let related: Record<string, string> = {};
    const relMatch = attrs.match(/data-related=(['"])([\s\S]*?)\1/i);
    if (relMatch && relMatch[2]) {
      try {
        related = JSON.parse(relMatch[2]);
      } catch {}
    }

    let breakers: Record<string, any> = {};
    const brkMatch = attrs.match(/data-breakers=(['"])([\s\S]*?)\1/i);
    if (brkMatch && brkMatch[2]) {
      try {
        breakers = JSON.parse(brkMatch[2]);
      } catch {}
    }

    // Avatar image
    const avatarMatch = body.match(/background-image\s*:\s*url\(['"]?([^'"\)]+)['"]?\)/i);
    let avatar: string | null = null;
    if (avatarMatch && avatarMatch[1]) {
      const rawImg = avatarMatch[1].trim();
      avatar = rawImg.startsWith("http") ? rawImg : `https://chiaki.site/${rawImg.replace(/^\//, "")}`;
    }

    // Title
    const titleMatch = body.match(/class="wo_title"[^>]*>([\s\S]*?)<\/span>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : null;

    // Alt title (often English title)
    const altMatch = body.match(/class="uk-text-small"[^>]*>([\s\S]*?)<\/span>/i);
    const altTitle = altMatch ? decodeHtmlEntities(altMatch[1]) : null;

    // Meta row
    const metaMatch = body.match(/class="wo_meta"[^>]*>([\s\S]*?)<\/span>/i);
    const metaRaw = metaMatch ? metaMatch[1] : "";

    // Rating score & vote count
    const ratingMatch = metaRaw.match(/class="wo_rating"[^>]*>★?\s*([\d.]+)\s*(?:\(([\d,]+)\))?/i);
    const ratingScore = ratingMatch ? parseFloat(ratingMatch[1]) : null;
    const ratingVotes = ratingMatch && ratingMatch[2] ? parseInt(ratingMatch[2].replace(/,/g, ""), 10) : null;

    // Cleaned meta string and release date
    const metaClean = metaRaw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const metaParts = metaClean.split("|").map(s => s.trim()).filter(Boolean);

    // External links
    const malLink = body.match(/href="(https:\/\/myanimelist\.net\/anime\/\d+)"/i)?.[1] || (entryMalId ? `https://myanimelist.net/anime/${entryMalId}` : null);
    const anilistLink = body.match(/href="(https:\/\/anilist\.co\/anime\/\d+)"/i)?.[1] || (anilistId ? `https://anilist.co/anime/${anilistId}` : null);
    const shikimoriLink = body.match(/href="(https:\/\/shikimori\.io\/animes\/\d+)"/i)?.[1] || null;
    const simklLink = body.match(/href="(https:\/\/api\.simkl\.com\/redirect[^"]+)"/i)?.[1] || null;

    return {
      index: idx + 1,
      mal_id: entryMalId,
      anilist_id: anilistId,
      title,
      alt_title: altTitle,
      type_id: typeId,
      type: typeName,
      episodes: eps,
      duration_seconds: duration,
      release_date: metaParts[0] || null,
      meta_string: metaParts.join(" | "),
      rating: {
        score: ratingScore,
        votes: ratingVotes
      },
      avatar,
      relations: related,
      breakers,
      external_links: {
        mal: malLink,
        anilist: anilistLink,
        shikimori: shikimoriLink,
        simkl: simklLink
      }
    };
  });

  // 2. Timeline table
  const timelineTable = html.match(/<table[^>]*id="wo_timeline"[^>]*data-time-min="(\d+)"[^>]*data-time-max="(\d+)"/i);
  const timeMin = timelineTable ? parseInt(timelineTable[1], 10) : null;
  const timeMax = timelineTable ? parseInt(timelineTable[2], 10) : null;

  const timelineRows = [...html.matchAll(/<tr>\s*<td><div class="wo_avatar" style="background-image:url\(['"]?([^'"\)]+)['"]?\)"(?: uk-tooltip="pos:right;title:([^"]*)")?><\/div><\/td>\s*<td><div class="wo_item" data-time-start="(\d+)" data-time-end="(\d+)"/gi)];
  const timeline: ChiakiTimelineItem[] = timelineRows.map(r => {
    const rawTooltip = r[2] || "";
    const tooltipParts = rawTooltip.split(/<br>|&#128198;/).map(s => s.trim()).filter(Boolean);
    const avatarRaw = r[1] ? r[1].trim() : "";
    return {
      avatar: avatarRaw.startsWith("http") ? avatarRaw : `https://chiaki.site/${avatarRaw.replace(/^\//, "")}`,
      title: tooltipParts[0] || null,
      date_range: tooltipParts[1] || null,
      time_start: r[3] ? parseInt(r[3], 10) : null,
      time_end: r[4] ? parseInt(r[4], 10) : null
    };
  });

  // 3. Related Groups section (if present, like on Fate/stay night)
  const relGroupsSection = html.match(/Related groups[\s\S]*?<table[^>]*>([\s\S]*?)<\/table>/i);
  const relatedGroups: ChiakiRelatedGroup[] = [];
  if (relGroupsSection) {
    const groupRows = [...relGroupsSection[1].matchAll(/<tr>\s*<td><a href="(?:\?\/tools\/watch_order\/group_id\/(\d+)|([^"]+))">([^<]+)<\/a><\/td>\s*<td>([^<]*)<\/td>\s*<td>([^<]*)<\/td>\s*<\/tr>/gi)];
    for (const gr of groupRows) {
      const groupId = gr[1] || (gr[2]?.match(/group_id\/(\d+)/)?.[1] ?? null);
      relatedGroups.push({
        group_id: groupId ? parseInt(groupId, 10) : null,
        group_name: gr[3].trim(),
        group_url: `https://chiaki.site/?/tools/watch_order/group_id/${groupId}`,
        point_of_relationship: gr[4].trim(),
        relationship_type: gr[5].trim()
      });
    }
  }

  const resultObj: ChiakiWatchOrderResult = {
    success: true,
    mal_id: malId,
    page_title: heading,
    source_url: url,
    total_entries: watchOrder.length,
    watch_order: watchOrder,
    timeline: {
      time_min: timeMin,
      time_max: timeMax,
      total_items: timeline.length,
      items: timeline
    },
    related_groups: relatedGroups
  };

  if (watchOrder.length > 0) {
    chiakiCache.set(malId, { data: resultObj, expiresAt: Date.now() + 86400 * 1000 });
  }

  return resultObj;
}
