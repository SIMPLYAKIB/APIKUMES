// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { resolveAniDubForPrefetchedItems } from "./Dub.js";
import { buildCleanCardItem } from "./Anime.js";
import { getForwardedHeaders } from "./Server/Episodes.js";
import { getMalLargePoster } from "./Server/Details.js";
import { formatRating, normalizeFormat, normalizeStatus } from "./Server/Catalog.js";

const SEARCH_LIMIT = 5;
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export type SearchUse = "anilist" | "mal";

export interface SearchItem {
  anikume_id: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string;
  rating?: string;
  format?: string;
  status?: string;
  sub?: string;
  dub?: string;
  adult: string;
}

export interface SearchResponse {
  total: number;
  use: SearchUse;
  results: SearchItem[];
}

export function normalizeSearchUse(rawUse?: string | null): SearchUse | null {
  if (!rawUse || typeof rawUse !== "string" || !rawUse.trim()) {
    return null;
  }
  const norm = rawUse.trim().toLowerCase();
  if (norm === "anilist" || norm === "a") return "anilist";
  if (norm === "mal" || norm === "myanimelist" || norm === "b") return "mal";
  return null;
}

function isMalAdult(node: any): boolean {
  if (!node) return false;
  const nsfw = String(node.nsfw || "").trim().toLowerCase();
  if (nsfw === "black") return true;
  const rating = String(node.rating || "").trim().toLowerCase();
  if (rating === "rx" || rating.startsWith("rx")) return true;
  return false;
}

export async function fetchSearchAnilist(
  searchQuery: string,
  clientIp?: string
): Promise<SearchItem[]> {
  const cleanQuery = String(searchQuery || "").trim();
  if (!cleanQuery) {
    return [];
  }

  // Allows 18+ (no isAdult filter) and allows all statuses (no status_not filter)
  const query = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, search: $search, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
          id
          idMal
          isAdult
          episodes
          nextAiringEpisode {
            episode
          }
          title {
            romaji
            english
            native
          }
          coverImage {
            extraLarge
            large
            medium
          }
          averageScore
          format
          status
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getForwardedHeaders(clientIp)
    },
    body: JSON.stringify({
      query,
      variables: { search: cleanQuery, perPage: SEARCH_LIMIT }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`AniList search HTTP ${res.status}`);
  }

  const json = await res.json();
  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    return [];
  }

  const selected = mediaList.slice(0, SEARCH_LIMIT);

  const mappedList = await Promise.all(
    selected.map((m: any) => resolveSingleAnimeMap(String(m.id), "anilist"))
  );

  const dubResolved = await resolveAniDubForPrefetchedItems(
    selected.map((m: any, idx: number) => ({
      anikume: mappedList[idx]?.anikume || null,
      anilist: mappedList[idx]?.anilist || String(m.id),
      mal: mappedList[idx]?.mal || (m.idMal ? String(m.idMal) : null),
      status: m.status || null,
      episodes: typeof m.episodes === "number" ? m.episodes : null,
      nextAiringEpisode: m.nextAiringEpisode || null
    })),
    { clientIp, skipAnilistSubRefetch: true }
  );

  return selected.map((m: any, idx: number) => {
    const mapped = mappedList[idx];
    const dubItem = dubResolved.items[idx];
    const poster = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null;

    return buildCleanCardItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null
      },
      poster,
      rating: formatRating(m.averageScore),
      format: normalizeFormat(m.format) || mapped?.type || null,
      status: normalizeStatus(m.status),
      sub: dubItem?.sub ?? null,
      dub: dubItem?.dub ?? null,
      adult: m.isAdult === true ? "true" : "false"
    });
  });
}

export async function fetchSearchMal(
  searchQuery: string,
  clientIp?: string
): Promise<SearchItem[]> {
  const cleanQuery = String(searchQuery || "").trim();
  if (!cleanQuery) {
    return [];
  }

  // Allows 18+ (nsfw=true) and allows all statuses
  const url = `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(cleanQuery)}&limit=${SEARCH_LIMIT}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,mean,num_episodes,nsfw,rating`;

  const res = await fetch(url, {
    headers: {
      "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`MAL search HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data) ? json.data : [];
  if (rawList.length === 0) {
    return [];
  }

  const nodes = rawList
    .map((entry: any) => entry.node || entry)
    .filter(Boolean)
    .slice(0, SEARCH_LIMIT);

  const mappedList = await Promise.all(
    nodes.map((n: any) => resolveSingleAnimeMap(String(n.id), "mal"))
  );

  const dubResolved = await resolveAniDubForPrefetchedItems(
    nodes.map((n: any, idx: number) => ({
      anikume: mappedList[idx]?.anikume || null,
      anilist: mappedList[idx]?.anilist || null,
      mal: mappedList[idx]?.mal || String(n.id),
      status: normalizeStatus(n.status),
      episodes: typeof n.num_episodes === "number" && n.num_episodes > 0 ? n.num_episodes : null,
      nextAiringEpisode: null
    })),
    { clientIp }
  );

  return nodes.map((n: any, idx: number) => {
    const mapped = mappedList[idx];
    const dubItem = dubResolved.items[idx];
    const poster = getMalLargePoster(n.main_picture?.large || n.main_picture?.medium || null);

    return buildCleanCardItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: n.title || null,
        english: n.alternative_titles?.en || null,
        native: n.alternative_titles?.ja || null
      },
      poster,
      rating: formatRating(n.mean),
      format: normalizeFormat(n.media_type) || mapped?.type || null,
      status: normalizeStatus(n.status),
      sub: dubItem?.sub ?? null,
      dub: dubItem?.dub ?? null,
      adult: isMalAdult(n) ? "true" : "false"
    });
  });
}

export async function getSearch(options?: {
  q?: string | null;
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: SearchResponse; cacheHit: boolean }> {
  const cleanQuery = typeof options?.q === "string" ? options.q.trim() : "";
  const requestedUse = normalizeSearchUse(options?.use);

  let actualUse: SearchUse = requestedUse || "anilist";
  let results: SearchItem[] = [];

  if (!cleanQuery) {
    return {
      response: {
        total: 0,
        use: actualUse,
        results: []
      },
      cacheHit: false
    };
  }

  if (requestedUse === "anilist") {
    actualUse = "anilist";
    results = await fetchSearchAnilist(cleanQuery, options?.clientIp);
  } else if (requestedUse === "mal") {
    actualUse = "mal";
    results = await fetchSearchMal(cleanQuery, options?.clientIp);
  } else {
    try {
      actualUse = "anilist";
      results = await fetchSearchAnilist(cleanQuery, options?.clientIp);
    } catch (anilistErr) {
      console.warn("[Search] AniList failed, falling back to MAL:", anilistErr);
      actualUse = "mal";
      results = await fetchSearchMal(cleanQuery, options?.clientIp);
    }
  }

  return {
    response: {
      total: results.length,
      use: actualUse,
      results
    },
    cacheHit: false
  };
}
