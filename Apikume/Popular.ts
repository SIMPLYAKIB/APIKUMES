// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { resolveAniDubForPrefetchedItems } from "./Dub.js";
import { buildCleanCardItem } from "./Anime.js";
import { getForwardedHeaders } from "./Server/Episodes.js";
import { getMalLargePoster } from "./Server/Details.js";
import { formatRating, normalizeFormat, normalizeStatus } from "./Server/Catalog.js";

const POPULAR_LIMIT = 15;
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export type PopularUse = "anilist" | "mal";

export interface PopularItem {
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

export interface PopularResponse {
  total: number;
  use: PopularUse;
  results: PopularItem[];
}

export function normalizePopularUse(rawUse?: string | null): PopularUse | null {
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

export async function fetchPopularAnilist(clientIp?: string): Promise<PopularItem[]> {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
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
      variables: { perPage: POPULAR_LIMIT }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`AniList popular HTTP ${res.status}`);
  }

  const json = await res.json();
  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    throw new Error("AniList popular returned empty media list");
  }

  const selected = mediaList
    .filter((m: any) => normalizeStatus(m?.status) !== "UPCOMING")
    .slice(0, POPULAR_LIMIT);

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

export async function fetchPopularMal(clientIp?: string): Promise<PopularItem[]> {
  const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=bypopularity&limit=${POPULAR_LIMIT + 15}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,mean,num_episodes,nsfw,rating`;

  const res = await fetch(url, {
    headers: {
      "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`MAL popular HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data) ? json.data : [];
  if (rawList.length === 0) {
    throw new Error("MAL popular returned empty list");
  }

  const nodes = rawList
    .map((entry: any) => entry.node || entry)
    .filter((n: any) => n && normalizeStatus(n.status) !== "UPCOMING")
    .slice(0, POPULAR_LIMIT);

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

export async function getPopular(options?: {
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: PopularResponse; cacheHit: boolean }> {
  const requestedUse = normalizePopularUse(options?.use);

  let actualUse: PopularUse = "anilist";
  let results: PopularItem[] = [];

  if (requestedUse === "anilist") {
    actualUse = "anilist";
    results = await fetchPopularAnilist(options?.clientIp);
  } else if (requestedUse === "mal") {
    actualUse = "mal";
    results = await fetchPopularMal(options?.clientIp);
  } else {
    try {
      actualUse = "anilist";
      results = await fetchPopularAnilist(options?.clientIp);
    } catch (anilistErr) {
      console.warn("[Popular] AniList failed, falling back to MAL:", anilistErr);
      actualUse = "mal";
      results = await fetchPopularMal(options?.clientIp);
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
