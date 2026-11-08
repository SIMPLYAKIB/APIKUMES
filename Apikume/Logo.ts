// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { getTvdbToken } from "./Server/Catalog.js";

export interface AniLogoItem {
  anikume: string | null;
  logo: string | null;
}

const TVDB_SERIES_CLEARLOGO_TYPE = 23;
const TVDB_MOVIE_CLEARLOGO_TYPE = 25;

function normalizeTvdbImageUrl(rawImage: any): string | null {
  if (!rawImage || typeof rawImage !== "string") return null;
  const trimmed = rawImage.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://artworks.thetvdb.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

function extractEnglishClearLogoFromArtworks(artworks: any[], targetTypeId: number): string | null {
  if (!Array.isArray(artworks) || artworks.length === 0) return null;

  // 1. Look for English clearlogo first
  const engClearLogos = artworks.filter((art: any) => {
    if (!art || typeof art !== "object") return false;
    const typeNum = Number(art.type);
    const lang = String(art.language || "").trim().toLowerCase();
    return typeNum === targetTypeId && lang === "eng" && typeof art.image === "string" && art.image.trim() !== "";
  });

  if (engClearLogos.length > 0) {
    engClearLogos.sort((a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0));
    return normalizeTvdbImageUrl(engClearLogos[0].image);
  }

  // 2. Fall back to any language clearlogo (e.g., Japanese, neutral, etc.) if English is not present
  const anyClearLogos = artworks.filter((art: any) => {
    if (!art || typeof art !== "object") return false;
    const typeNum = Number(art.type);
    return typeNum === targetTypeId && typeof art.image === "string" && art.image.trim() !== "";
  });

  if (anyClearLogos.length > 0) {
    anyClearLogos.sort((a: any, b: any) => (Number(b.score) || 0) - (Number(a.score) || 0));
    return normalizeTvdbImageUrl(anyClearLogos[0].image);
  }

  return null;
}

async function resolveTvdbIdByRemoteIds(
  token: string,
  remoteIds: (string | null | undefined)[],
  kind: "movie" | "series"
): Promise<string | null> {
  for (const rawRemote of remoteIds) {
    const remote = rawRemote ? String(rawRemote).trim() : "";
    if (!remote) continue;
    try {
      const res = await fetch(
        `https://api4.thetvdb.com/v4/search/remoteid/${encodeURIComponent(remote)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache"
          },
          cache: "no-store",
          signal: AbortSignal.timeout(5000)
        }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const list = Array.isArray(json?.data) ? json.data : [];
      for (const entry of list) {
        if (kind === "movie" && entry?.movie?.id !== undefined && entry?.movie?.id !== null) {
          return String(entry.movie.id);
        }
        if (kind === "series" && entry?.series?.id !== undefined && entry?.series?.id !== null) {
          return String(entry.series.id);
        }
      }
    } catch {}
  }
  return null;
}

async function fetchTvdbExtendedArtworks(
  token: string,
  endpointKind: "movies" | "series",
  tvdbId: string
): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api4.thetvdb.com/v4/${endpointKind}/${encodeURIComponent(tvdbId)}/extended`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000)
      }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.data?.artworks) ? json.data.artworks : [];
  } catch {
    return [];
  }
}

async function fetchSingleTvdbEnglishLogo(mapped: any, sharedToken?: string | null): Promise<string | null> {
  if (!mapped || typeof mapped !== "object") return null;

  const token = sharedToken || (await getTvdbToken());
  if (!token) return null;

  const isMovie = String(mapped.type || "").trim().toLowerCase() === "movie";
  const mappedTvdbId =
    mapped.tvdb && typeof mapped.tvdb === "object" && mapped.tvdb.id
      ? String(mapped.tvdb.id).trim()
      : typeof mapped.tvdb === "string" && mapped.tvdb.trim()
      ? mapped.tvdb.trim()
      : null;
  const mappedImdbId = mapped.imdb ? String(mapped.imdb).trim() : null;
  const mappedTmdbId =
    mapped.tmdb && typeof mapped.tmdb === "object" && mapped.tmdb.id
      ? String(mapped.tmdb.id).trim()
      : typeof mapped.tmdb === "string" && mapped.tmdb.trim()
      ? mapped.tmdb.trim()
      : null;

  if (isMovie) {
    // Movie: resolve TVDB Movie ID via remote IDs (IMDb / TMDB) from ids.ts, or fallback to mapped tvdb.id
    let tvdbMovieId = await resolveTvdbIdByRemoteIds(
      token,
      [mappedImdbId, mappedTmdbId],
      "movie"
    );
    if (!tvdbMovieId && mappedTvdbId) {
      tvdbMovieId = mappedTvdbId;
    }
    if (!tvdbMovieId) return null;

    const artworks = await fetchTvdbExtendedArtworks(token, "movies", tvdbMovieId);
    return extractEnglishClearLogoFromArtworks(artworks, TVDB_MOVIE_CLEARLOGO_TYPE);
  } else {
    // TV Show / OVA / ONA / Special / Tv Short: use mapped tvdb.id from ids.ts (or fallback to remoteid series lookup)
    let tvdbSeriesId = mappedTvdbId;
    if (!tvdbSeriesId) {
      tvdbSeriesId = await resolveTvdbIdByRemoteIds(
        token,
        [mappedImdbId, mappedTmdbId],
        "series"
      );
    }
    if (!tvdbSeriesId) return null;

    const artworks = await fetchTvdbExtendedArtworks(token, "series", tvdbSeriesId);
    return extractEnglishClearLogoFromArtworks(artworks, TVDB_SERIES_CLEARLOGO_TYPE);
  }
}

/**
 * Formats the output text in the exact same style as `ids.ts` (`total` followed by `result`).
 */
export function formatAniLogoText(total: number, validItems: AniLogoItem[]): string {
  let resultBlock: string;
  if (validItems.length === 1) {
    resultBlock = `result: ${JSON.stringify(validItems[0], null, 2)}`;
  } else {
    const indentedItems = validItems
      .map((obj) =>
        JSON.stringify(obj, null, 2)
          .split("\n")
          .map((line) => `  ${line}`)
          .join("\n")
      )
      .join("\n\n");
    resultBlock = `result: {\n${indentedItems}\n}`;
  }
  return `total: ${total}\n${resultBlock}`;
}

/**
 * Directly resolves `anikume` and English (`language: "eng"`) ClearLogo (`logo`) from TVDB
 * for items that already have their IDs mapped via `ids.ts` (skips redundant `ids.ts` lookups).
 */
export async function resolveAniLogoForMappedItems(mappedItems: any[]): Promise<{
  total: number;
  items: AniLogoItem[];
  formattedText: string;
}> {
  const total = mappedItems.length;
  if (total === 0) {
    return {
      total: 0,
      items: [],
      formattedText: formatAniLogoText(0, [])
    };
  }

  const token = await getTvdbToken();
  const items = await Promise.all(
    mappedItems.map(async (mapped) => {
      if (!mapped) {
        return { anikume: null, logo: null } as AniLogoItem;
      }
      const logo = await fetchSingleTvdbEnglishLogo(mapped, token);
      return {
        anikume: mapped.anikume || mapped.anikume_id || null,
        logo: logo || null
      } as AniLogoItem;
    })
  );

  return {
    total,
    items,
    formattedText: formatAniLogoText(total, items)
  };
}

/**
 * Resolves `anikume` and English (`language: "eng"`) ClearLogo (`logo`) from TVDB
 * for single or comma-separated IDs using `ids.ts` (for both Movie and TV/OVA/etc. without extra AniList/MAL fetches).
 */
export async function getAniLogo(options: {
  ids: string | string[];
  tracker?: string;
  fresh?: boolean;
}) {
  const isFresh = Boolean(options.fresh);
  const rawTracker = options.tracker ? options.tracker.trim().toLowerCase() : "anikume";
  const normTracker: "anikume" | "anilist" | "mal" =
    rawTracker === "anilist"
      ? "anilist"
      : rawTracker === "mal" || rawTracker === "myanimelist"
      ? "mal"
      : "anikume";

  const idList = Array.isArray(options.ids)
    ? options.ids.map((s) => String(s).trim()).filter(Boolean)
    : String(options.ids || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const total = idList.length;
  if (total === 0) {
    return {
      total: 0,
      items: [],
      single: null,
      isBatch: false,
      formattedText: formatAniLogoText(0, [])
    };
  }

  const mappedList = await Promise.all(
    idList.map((singleId) => resolveSingleAnimeMap(singleId, normTracker, isFresh))
  );

  const validMapped = mappedList.filter(Boolean);
  if (validMapped.length === 0) {
    return {
      total,
      items: [],
      single: null,
      isBatch: idList.length > 1,
      formattedText: formatAniLogoText(total, [])
    };
  }

  const resolved = await resolveAniLogoForMappedItems(validMapped);
  const formattedText = formatAniLogoText(total, resolved.items);

  return {
    total,
    items: resolved.items,
    single: resolved.items[0] || null,
    isBatch: idList.length > 1,
    formattedText
  };
}
