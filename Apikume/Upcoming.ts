// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { buildCleanCardItem } from "./Anime.js";
import { getForwardedHeaders } from "./Server/Episodes.js";
import { getMalLargePoster } from "./Server/Details.js";
import { normalizeFormat, normalizeStatus } from "./Server/Catalog.js";

const UPCOMING_LIMIT = 20;
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export type UpcomingUse = "anilist" | "mal";

export interface UpcomingItem {
  anikume_id: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string;
  format?: string;
  status?: string;
  adult: string;
}

export interface UpcomingResponse {
  total: number;
  use: UpcomingUse;
  results: UpcomingItem[];
}

export function normalizeUpcomingUse(rawUse?: string | null): UpcomingUse | null {
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

export async function fetchUpcomingAnilist(clientIp?: string): Promise<UpcomingItem[]> {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
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
      variables: { perPage: UPCOMING_LIMIT }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`AniList upcoming HTTP ${res.status}`);
  }

  const json = await res.json();
  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    throw new Error("AniList upcoming returned empty media list");
  }

  const selected = mediaList.slice(0, UPCOMING_LIMIT);

  // Resolve IDs via Ids.ts once (no rating, sub, or dub fields in Upcoming)
  const mappedList = await Promise.all(
    selected.map((m: any) => resolveSingleAnimeMap(String(m.id), "anilist"))
  );

  return selected.map((m: any, idx: number) => {
    const mapped = mappedList[idx];
    const poster = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null;

    return buildCleanCardItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null
      },
      poster,
      format: normalizeFormat(m.format) || mapped?.type || null,
      status: normalizeStatus(m.status),
      adult: m.isAdult === true ? "true" : "false",
      isUpcoming: true
    });
  });
}

export async function fetchUpcomingMal(): Promise<UpcomingItem[]> {
  const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=upcoming&limit=${UPCOMING_LIMIT}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,nsfw,rating`;

  const res = await fetch(url, {
    headers: {
      "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`MAL upcoming HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data) ? json.data : [];
  if (rawList.length === 0) {
    throw new Error("MAL upcoming returned empty list");
  }

  const nodes = rawList
    .map((entry: any) => entry.node || entry)
    .filter(Boolean)
    .slice(0, UPCOMING_LIMIT);

  const mappedList = await Promise.all(
    nodes.map((n: any) => resolveSingleAnimeMap(String(n.id), "mal"))
  );

  return nodes.map((n: any, idx: number) => {
    const mapped = mappedList[idx];
    const poster = getMalLargePoster(n.main_picture?.large || n.main_picture?.medium || null);

    return buildCleanCardItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: n.title || null,
        english: n.alternative_titles?.en || null,
        native: n.alternative_titles?.ja || null
      },
      poster,
      format: normalizeFormat(n.media_type) || mapped?.type || null,
      status: normalizeStatus(n.status),
      adult: isMalAdult(n) ? "true" : "false",
      isUpcoming: true
    });
  });
}

export async function getUpcoming(options?: {
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: UpcomingResponse; cacheHit: boolean }> {
  const requestedUse = normalizeUpcomingUse(options?.use);

  let actualUse: UpcomingUse = "anilist";
  let results: UpcomingItem[] = [];

  if (requestedUse === "anilist") {
    actualUse = "anilist";
    results = await fetchUpcomingAnilist(options?.clientIp);
  } else if (requestedUse === "mal") {
    actualUse = "mal";
    results = await fetchUpcomingMal();
  } else {
    try {
      actualUse = "anilist";
      results = await fetchUpcomingAnilist(options?.clientIp);
    } catch (anilistErr) {
      console.warn("[Upcoming] AniList failed, falling back to MAL:", anilistErr);
      actualUse = "mal";
      results = await fetchUpcomingMal();
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
