// @ts-nocheck
import { getForwardedHeaders } from "./Episodes.js";
import { getMalLargePoster } from "./Details.js";
import { getBatchAnimeMappings, getFribbDataset, fetchAniZip, getOrCreateAnikumeIdsBatch } from "../Ids.js";
import { getAnibridgeFullMapping } from "./AniBridge.js";

const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export function formatRating(score: any) {
  if (score === undefined || score === null) return null;
  const num = typeof score === "number" ? score : parseFloat(String(score));
  if (isNaN(num) || num <= 0) return null;
  const val = num > 10 ? num / 10 : num;
  return val.toFixed(1);
}

export function cleanDescription(desc: any) {
  if (!desc || typeof desc !== "string") return null;
  const text = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
  return text || null;
}

export function normalizeStatus(status: any) {
  if (!status) return null;
  const s = String(status).toUpperCase().trim();
  if (["RELEASING", "AIRING", "CURRENTLY_AIRING", "CURRENT", "ONGOING"].includes(s)) {
    return "RELEASING";
  }
  if (["FINISHED", "COMPLETED", "FINISHED_AIRING"].includes(s)) {
    return "FINISHED";
  }
  if (["UPCOMING", "NOT_YET_RELEASED", "NOT_YET_AIRED", "TO_BE_RELEASED", "NOT YET AIRED"].includes(s)) {
    return "UPCOMING";
  }
  if (["CANCELLED", "CANCELED", "DISCONTINUED"].includes(s)) {
    return "CANCELLED";
  }
  return "FINISHED";
}

export function normalizeFormat(format: any) {
  if (!format) return null;
  const f = String(format).toLowerCase().trim().replace(/_/g, " ");
  return (f === "tv" ? "tv show" : f)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let season = "WINTER";
  if (month >= 4 && month <= 6) season = "SPRING";
  else if (month >= 7 && month <= 9) season = "SUMMER";
  else if (month >= 10 && month <= 12) season = "FALL";
  return { season, year };
}

const logoCache = new Map<string, string | null>();

export function clearLogoCache() {
  logoCache.clear();
}

const TVDB_API_KEY = process.env.TVDB_API_KEY || "";
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

let tvdbTokenCache: { token: string; expiresAt: number } | null = null;
let tvdbTokenPromise: Promise<string | null> | null = null;

export async function getTvdbToken(): Promise<string | null> {
  if (tvdbTokenCache && Date.now() < tvdbTokenCache.expiresAt) {
    return tvdbTokenCache.token;
  }
  if (tvdbTokenPromise) {
    return tvdbTokenPromise;
  }
  tvdbTokenPromise = (async () => {
    try {
      const res = await fetch("https://api4.thetvdb.com/v4/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apikey: TVDB_API_KEY }),
        signal: AbortSignal.timeout(4000)
      });
      if (!res.ok) return null;
      const json = await res.json();
      const token = json.data?.token;
      if (token) {
        tvdbTokenCache = { token, expiresAt: Date.now() + 23 * 3600 * 1000 };
        return token;
      }
    } catch (e) {} finally {
      tvdbTokenPromise = null;
    }
    return null;
  })();
  return tvdbTokenPromise;
}

getTvdbToken().catch(() => {});

async function fetchTvdbClearLogo(tvdbId: string, isMovie: boolean): Promise<string | null> {
  const token = await getTvdbToken();
  if (!token) return null;

  try {
    const endpoint = isMovie ? `movies/${tvdbId}/extended` : `series/${tvdbId}/extended`;
    const res = await fetch(`https://api4.thetvdb.com/v4/${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const artworks = json.data?.artworks;
    if (!Array.isArray(artworks) || artworks.length === 0) return null;

    const clearLogos = artworks.filter((art: any) => {
      const typeStr = String(art.type || art.keyType || "").toLowerCase();
      const imgStr = String(art.image || "").toLowerCase();
      return typeStr === "clearlogo" || typeStr === "23" || imgStr.includes("/clearlogo/");
    });

    if (clearLogos.length === 0) return null;

    const engLogo = clearLogos.find((art: any) => {
      const lang = String(art.language || art.lang || "").toLowerCase();
      return lang === "eng" || lang === "en";
    });

    const chosen = engLogo || clearLogos[0];
    if (chosen && chosen.image) {
      let img = String(chosen.image);
      if (!img.startsWith("http")) {
        img = `https://artworks.thetvdb.com${img.startsWith("/") ? "" : "/"}${img}`;
      }
      return img;
    }
  } catch (e) {}
  return null;
}

async function fetchTmdbClearLogo(tmdbId: string, isMovie: boolean): Promise<string | null> {
  try {
    const mediaType = isMovie ? "movie" : "tv";
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}/images?api_key=${TMDB_API_KEY}`, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const json = await res.json();
    const logos = json.logos;
    if (!Array.isArray(logos) || logos.length === 0) return null;

    const enLogo = logos.find((l: any) => l.iso_639_1 === "en") ||
                   logos.find((l: any) => !l.iso_639_1 || l.iso_639_1 === "") ||
                   logos[0];

    if (enLogo && enLogo.file_path) {
      return `https://image.tmdb.org/t/p/original${enLogo.file_path}`;
    }
  } catch (e) {}
  return null;
}

export async function getHeroClearLogo(
  tvdbId?: any,
  tmdbId?: any,
  isMovie: boolean = false,
  anilistId?: any,
  malId?: any,
  skipMappingFallback: boolean = false
): Promise<string | null> {
  let cleanTvdbId: string | null = null;
  if (typeof tvdbId === "string") {
    const trimmed = tvdbId.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        cleanTvdbId = String(parsed.id || parsed.tv || parsed.tvdb || parsed.show || "");
      } catch (e) {}
    } else if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
      cleanTvdbId = trimmed;
    }
  } else if (typeof tvdbId === "number") {
    cleanTvdbId = String(tvdbId);
  } else if (typeof tvdbId === "object" && tvdbId !== null) {
    cleanTvdbId = String(tvdbId.id || tvdbId.tv || tvdbId.tvdb || tvdbId.show || "");
  }

  let cleanTmdbId: string | null = null;
  if (typeof tmdbId === "string") {
    const trimmed = tmdbId.trim();
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        const val = parsed.movie || parsed.tv || parsed.id || null;
        cleanTmdbId = Array.isArray(val) ? String(val[0]) : (val ? String(val) : null);
      } catch (e) {}
    } else if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
      cleanTmdbId = trimmed;
    }
  } else if (typeof tmdbId === "number") {
    cleanTmdbId = String(tmdbId);
  } else if (typeof tmdbId === "object" && tmdbId !== null) {
    const val = tmdbId.movie || tmdbId.tv || tmdbId.id || null;
    cleanTmdbId = Array.isArray(val) ? String(val[0]) : (val ? String(val) : null);
  }

  if (cleanTvdbId === "" || cleanTvdbId === "null" || cleanTvdbId === "undefined") cleanTvdbId = null;
  if (cleanTmdbId === "" || cleanTmdbId === "null" || cleanTmdbId === "undefined") cleanTmdbId = null;

  // Fallback: If target ID is missing and mapping fallback wasn't already performed
  if (!skipMappingFallback && ((isMovie && !cleanTmdbId) || (!isMovie && !cleanTvdbId))) {
    if (anilistId || malId) {
      try {
        const { getAnimeMappingWithBoundaries } = await import("./mapper.js");
        let mapping: any = null;
        if (anilistId) {
          mapping = await getAnimeMappingWithBoundaries("anilist", String(anilistId));
        } else if (malId) {
          mapping = await getAnimeMappingWithBoundaries("mal", String(malId));
        }

        if (mapping) {
          if (!cleanTvdbId && (mapping.tvdb_id || mapping.thetvdb_id || mapping.tvdb)) {
            cleanTvdbId = String(mapping.tvdb_id || mapping.thetvdb_id || mapping.tvdb);
          }
          if (!cleanTmdbId && (mapping.tmdb_id || mapping.themoviedb_id || mapping.tmdb)) {
            const tmdbVal = mapping.tmdb_id || mapping.themoviedb_id || mapping.tmdb;
            if (typeof tmdbVal === "object" && tmdbVal !== null) {
              const val = tmdbVal.movie || tmdbVal.tv || tmdbVal.id || null;
              cleanTmdbId = Array.isArray(val) ? String(val[0]) : (val ? String(val) : null);
            } else {
              cleanTmdbId = String(tmdbVal);
            }
          }
        }
      } catch (e) {}
    }
  }

  if (cleanTvdbId === "" || cleanTvdbId === "null" || cleanTvdbId === "undefined") cleanTvdbId = null;
  if (cleanTmdbId === "" || cleanTmdbId === "null" || cleanTmdbId === "undefined") cleanTmdbId = null;

  let logoUrl: string | null = null;

  // Strict 1-database fetch rule:
  // - Movies: Fetch TMDB only (ignore if cleanTmdbId is missing; never fallback to TVDB for movies)
  // - Non-Movies (TV, ONA, OVA, Special): Fetch TVDB first; only if cleanTvdbId is missing or TVDB returns no logo, fallback to TMDB
  if (isMovie) {
    if (cleanTmdbId) {
      logoUrl = await fetchTmdbClearLogo(cleanTmdbId, true);
    }
  } else {
    if (cleanTvdbId) {
      logoUrl = await fetchTvdbClearLogo(cleanTvdbId, false);
    }
    if (!logoUrl && cleanTmdbId) {
      logoUrl = await fetchTmdbClearLogo(cleanTmdbId, false);
    }
  }

  return logoUrl;
}

async function resolveHeroSliderItemsFast(rawList: any[], targetLimit: number = 6) {
  if (!rawList || rawList.length === 0) return [];

  const anikumeIds = await getOrCreateAnikumeIdsBatch(
    rawList.map((r: any) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id }))
  );
  const fribb = await getFribbDataset();

  const withLogo: any[] = [];
  const withoutLogo: any[] = [];
  const batchSize = targetLimit; // Resolve in fast small batches of 6

  for (let start = 0; start < rawList.length; start += batchSize) {
    const slice = rawList.slice(start, start + batchSize);
    const batchItems = await Promise.all(
      slice.map(async (raw, idxInSlice) => {
        const globalIdx = start + idxInSlice;
        const anikumeId = anikumeIds[globalIdx] || raw.anikume_id || "";
        const isMovie =
          raw.format === "MOVIE" ||
          raw.format === "Movie" ||
          String(raw.format || "").toLowerCase().includes("movie");

        // 1. Check in-memory Fribb dataset first (0ms)
        const fribbEntry =
          (raw.anilist_id ? fribb.index.get(`anilist:${raw.anilist_id}`) : null) ||
          (raw.mal_id ? fribb.index.get(`mal:${raw.mal_id}`) : null) ||
          null;

        let tvdbId: any = fribbEntry?.tvdb_id || fribbEntry?.thetvdb_id || null;
        let tmdbId: any = fribbEntry?.themoviedb_id || fribbEntry?.tmdb_id || null;

        // 2. If missing target ID, check in-memory AniBridge dataset (0ms once loaded)
        if ((isMovie && !tmdbId) || (!isMovie && !tvdbId)) {
          const aniBridgeEntry = await getAnibridgeFullMapping(raw.anilist_id, raw.mal_id).catch(() => null);
          if (aniBridgeEntry) {
            if (!tvdbId && aniBridgeEntry.tvdb_id) tvdbId = aniBridgeEntry.tvdb_id;
            if (!tmdbId && aniBridgeEntry.tmdb_id) tmdbId = aniBridgeEntry.tmdb_id;
          }
        }

        // 3. Only if target ID is still missing, try a single fast AniZip lookup
        if ((isMovie && !tmdbId) || (!isMovie && !tvdbId)) {
          const aniZip = await fetchAniZip(
            raw.anilist_id ? { anilist_id: raw.anilist_id } : { mal_id: raw.mal_id }
          ).catch(() => null);
          if (aniZip?.mappings) {
            if (!tvdbId && aniZip.mappings.thetvdb_id) tvdbId = String(aniZip.mappings.thetvdb_id);
            if (!tmdbId && aniZip.mappings.themoviedb_id) tmdbId = String(aniZip.mappings.themoviedb_id);
          }
        }

        const logo = await getHeroClearLogo(
          tvdbId,
          tmdbId,
          isMovie,
          raw.anilist_id || null,
          raw.mal_id || null,
          true
        );

        const poster =
          raw.poster ||
          raw.cover ||
          raw.coverImage?.extraLarge ||
          raw.coverImage?.large ||
          raw.coverImage?.medium ||
          null;
        const banner = raw.banner || poster || null;

        return {
          anikume_id: anikumeId,
          title: {
            romaji: raw.title?.romaji || null,
            english: raw.title?.english || null,
            native: raw.title?.native || null
          },
          logo: logo || null,
          poster,
          banner,
          description: cleanDescription(raw.description),
          rating: formatRating(raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean),
          status: normalizeStatus(raw.status),
          year: raw.year || null,
          is_adult: false
        };
      })
    );

    for (const item of batchItems) {
      if (item.logo && typeof item.logo === "string" && item.logo.trim() !== "") {
        withLogo.push(item);
      } else {
        withoutLogo.push(item);
      }
    }

    if (withLogo.length >= targetLimit) {
      break;
    }
  }

  return (withLogo.length >= targetLimit ? withLogo : [...withLogo, ...withoutLogo]).slice(0, targetLimit);
}

async function mapAndFormatAnimeHeroItemsBatch(rawList: any[], resultMap: Map<string, any>) {
  if (!rawList || rawList.length === 0) return [];

  const itemsWithMapped = rawList.map((raw) => {
    const mapped = resultMap.get(`anilist:${raw.anilist_id}`) || resultMap.get(`mal:${raw.mal_id}`) || {};
    return { raw, mapped };
  });

  const logos = await Promise.all(
    itemsWithMapped.map(({ raw, mapped }) => {
      const isMovie = raw.format === "MOVIE" || raw.format === "Movie" || String(raw.format || "").toLowerCase().includes("movie");
      return getHeroClearLogo(
        mapped.tvdb || mapped.tvdb_id || mapped.thetvdb_id || null,
        mapped.tmdb || mapped.tmdb_id || mapped.themoviedb_id || null,
        isMovie,
        raw.anilist_id || null,
        raw.mal_id || null,
        true
      );
    })
  );

  return itemsWithMapped.map(({ raw, mapped }, idx) => {
    const poster = raw.poster || raw.cover || raw.coverImage?.extraLarge || raw.coverImage?.large || raw.coverImage?.medium || null;
    const banner = raw.banner || poster || null;
    return {
      anikume_id: mapped.anikume || raw.anikume_id || "",
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      logo: logos[idx] || null,
      poster,
      banner,
      description: cleanDescription(raw.description),
      rating: formatRating(raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean),
      status: normalizeStatus(raw.status),
      year: raw.year || null,
      is_adult: false,
    };
  });
}

export async function mapAndFormatAnimeItemsBatch(rawList: any[], resultMap: Map<string, any>) {
  if (!rawList || rawList.length === 0) return [];
  return rawList.map((raw) => {
    const mapped = resultMap.get(`anilist:${raw.anilist_id}`) || resultMap.get(`mal:${raw.mal_id}`) || {};
    const poster = raw.poster || raw.cover || raw.coverImage?.extraLarge || raw.coverImage?.large || raw.coverImage?.medium || null;
    return {
      anikume_id: mapped.anikume || raw.anikume_id || "",
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      rating: formatRating(raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean),
      format: normalizeFormat(raw.format),
      status: normalizeStatus(raw.status),
      is_adult: false,
    };
  });
}

async function mapAndFormatAnimeTopItemsBatch(rawList: any[], resultMap: Map<string, any>) {
  if (!rawList || rawList.length === 0) return [];
  return rawList.map((raw) => {
    const mapped = resultMap.get(`anilist:${raw.anilist_id}`) || resultMap.get(`mal:${raw.mal_id}`) || {};
    const poster = raw.poster || raw.cover || raw.coverImage?.extraLarge || raw.coverImage?.large || raw.coverImage?.medium || null;
    return {
      anikume_id: mapped.anikume || raw.anikume_id || "",
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      rating: formatRating(raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean),
      format: normalizeFormat(raw.format),
      status: normalizeStatus(raw.status),
      is_adult: false,
    };
  });
}

export async function fetchAniListAnimeCatalog(clientIp?: string) {
  const { season, year } = getCurrentSeason();
  const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      trending: Page(page: 1, perPage: 15) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: TRENDING_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
      popularSeason: Page(page: 1, perPage: 15) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
      upcoming: Page(page: 1, perPage: 15) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
      allTimePopular: Page(page: 1, perPage: 10) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
      top10: Page(page: 1, perPage: 10) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: SCORE_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
      top10Movies: Page(page: 1, perPage: 10) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, format: MOVIE, sort: SCORE_DESC) {
          id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query, variables: { season, seasonYear: year } }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AniList anime query returned status ${res.status}`);
  const json = await res.json();
  const data = json.data;
  if (!data) throw new Error("AniList returned empty data");

  const parseMedia = (m: any, rankIdx?: number) => ({
    anilist_id: m.id,
    mal_id: m.idMal || null,
    is_adult: false,
    title: { romaji: m.title?.romaji || null, english: m.title?.english || null, native: m.title?.native || null },
    poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
    banner: m.bannerImage || m.coverImage?.extraLarge || null,
    description: m.description || null,
    rating: formatRating(m.averageScore),
    format: normalizeFormat(m.format),
    status: normalizeStatus(m.status),
    year: m.seasonYear || m.startDate?.year || null,
    season: m.season || null,
    genres: m.genres || [],
    rank: rankIdx !== undefined ? rankIdx + 1 : undefined,
  });

  const trendingRaw = (data.trending?.media || []).slice(0, 10).map((m: any) => parseMedia(m));
  const popularSeasonRaw = (data.popularSeason?.media || []).slice(0, 10).map((m: any) => parseMedia(m));
  const upcomingRaw = (data.upcoming?.media || []).slice(0, 10).map((m: any) => parseMedia(m));
  const allTimePopularRaw = (data.allTimePopular?.media || []).slice(0, 10).map((m: any) => parseMedia(m));
  const top10Raw = (data.top10?.media || []).slice(0, 10).map((m: any, idx: number) => parseMedia(m, idx));
  const top10MoviesRaw = (data.top10Movies?.media || []).slice(0, 10).map((m: any, idx: number) => parseMedia(m, idx));

  const middleRaw = [...trendingRaw, ...popularSeasonRaw, ...upcomingRaw, ...allTimePopularRaw];
  const topRaw = [...top10Raw, ...top10MoviesRaw];
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const allUniqueRaw = [...middleRaw, ...topRaw];

  const allAnilistIds = Array.from(new Set(allUniqueRaw.map(raw => raw.anilist_id).filter(Boolean)));
  const { resultMap } = await getBatchAnimeMappings(allAnilistIds.join(','), 'anilist');

  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatAnimeHeroItemsBatch(heroSliderRaw, resultMap),
    mapAndFormatAnimeItemsBatch(middleRaw, resultMap),
    mapAndFormatAnimeTopItemsBatch(topRaw, resultMap),
  ]);

  let offset = 0;
  const trending = middleConverted.slice(offset, offset + trendingRaw.length);
  offset += trendingRaw.length;
  const popularSeason = middleConverted.slice(offset, offset + popularSeasonRaw.length);
  offset += popularSeasonRaw.length;
  const upcoming = middleConverted.slice(offset, offset + upcomingRaw.length);
  offset += upcomingRaw.length;
  const allTimePopular = middleConverted.slice(offset, offset + allTimePopularRaw.length);

  const top10 = topConverted.slice(0, top10Raw.length);
  const top10Movies = topConverted.slice(top10Raw.length, top10Raw.length + top10MoviesRaw.length);

  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Movies,
  };
}

async function fetchMalRankingRaw(path: string, limit: number, isTopList = false, leanFields = false) {
  const fields = leanFields
    ? "id,title,main_picture,alternative_titles,rank,status,media_type,mean"
    : "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,rating,genres,synopsis,mean,start_season,start_date,pictures";
  const url = `https://api.myanimelist.net/v2/${path}${path.includes("?") ? "&" : "?"}limit=${limit}&nsfw=true&fields=${fields}`;
  const res = await fetch(url, {
    headers: {
      "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache"
    },
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`MAL request failed: ${url} (${res.status})`);
  const data = await res.json();
  const items = data.data || [];
  return items.map((item: any, idx: number) => {
    const node = item.node;
    const rawPoster = node.main_picture?.large || node.main_picture?.medium || null;
    const poster = getMalLargePoster(rawPoster);
    const year = node.start_season?.year || (node.start_date ? parseInt(node.start_date.substring(0, 4), 10) : null);
    return {
      anilist_id: null,
      mal_id: node.id,
      title: { romaji: node.title || null, english: node.alternative_titles?.en || node.title || null, native: node.alternative_titles?.ja || null },
      poster,
      banner: poster,
      description: node.synopsis || null,
      rating: formatRating(node.mean),
      status: node.status || null,
      format: normalizeFormat(node.media_type),
      year,
      season: node.start_season?.season ? String(node.start_season.season).toUpperCase() : null,
      genres: Array.isArray(node.genres) ? node.genres.map((g: any) => g.name) : [],
      is_adult: false,
      rank: isTopList ? node.rank || idx + 1 : undefined,
    };
  });
}

export async function fetchMalAnimeCatalog(clientIp?: string) {
  const { season, year } = getCurrentSeason();
  const malSeason = season.toLowerCase();
  const [trendingRawAll, popularSeasonRawAll, upcomingRaw, allTimePopularRawAll, top10RawAll, top10MoviesRawAll] = await Promise.all([
    fetchMalRankingRaw("anime/ranking?ranking_type=airing", 20).catch(() => []),
    fetchMalRankingRaw(`anime/season/${year}/${malSeason}?sort=anime_num_list_users`, 25).catch(() => []),
    fetchMalRankingRaw("anime/ranking?ranking_type=upcoming", 10).catch(() => []),
    fetchMalRankingRaw("anime/ranking?ranking_type=bypopularity", 20).catch(() => []),
    fetchMalRankingRaw("anime/ranking?ranking_type=all", 20, true).catch(() => []),
    fetchMalRankingRaw("anime/ranking?ranking_type=movie", 20, true).catch(() => []),
  ]);

  const isReleasedMal = (r: any) => normalizeStatus(r?.status) !== "UPCOMING";
  const trendingRaw = trendingRawAll.filter(isReleasedMal).slice(0, 10);
  const popularSeasonRaw = popularSeasonRawAll.filter(isReleasedMal).slice(0, 10);
  const allTimePopularRaw = allTimePopularRawAll.filter(isReleasedMal).slice(0, 10);
  const top10Raw = top10RawAll.filter(isReleasedMal).slice(0, 10);
  const top10MoviesRaw = top10MoviesRawAll.filter(isReleasedMal).slice(0, 10);

  const middleRaw = [...trendingRaw.slice(0, 10), ...popularSeasonRaw.slice(0, 10), ...upcomingRaw.slice(0, 10), ...allTimePopularRaw.slice(0, 10)];
  const topRaw = [...top10Raw.slice(0, 10), ...top10MoviesRaw.slice(0, 10)];
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const allUniqueRaw = [...middleRaw, ...topRaw];

  const allMalIds = Array.from(new Set(allUniqueRaw.map(raw => raw.mal_id).filter(Boolean)));
  const { resultMap } = await getBatchAnimeMappings(allMalIds.join(','), 'mal');

  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatAnimeHeroItemsBatch(heroSliderRaw, resultMap),
    mapAndFormatAnimeItemsBatch(middleRaw, resultMap),
    mapAndFormatAnimeTopItemsBatch(topRaw, resultMap),
  ]);

  let offset = 0;
  const trending = middleConverted.slice(offset, offset + Math.min(10, trendingRaw.length));
  offset += Math.min(10, trendingRaw.length);
  const popularSeason = middleConverted.slice(offset, offset + Math.min(10, popularSeasonRaw.length));
  offset += Math.min(10, popularSeasonRaw.length);
  const upcoming = middleConverted.slice(offset, offset + Math.min(10, upcomingRaw.length));
  offset += Math.min(10, upcomingRaw.length);
  const allTimePopular = middleConverted.slice(offset, offset + Math.min(10, allTimePopularRaw.length));

  const top10 = topConverted.slice(0, Math.min(10, top10Raw.length));
  const top10Movies = topConverted.slice(Math.min(10, top10Raw.length), Math.min(10, top10Raw.length) + Math.min(10, top10MoviesRaw.length));

  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Movies,
  };
}

export const SECTION_POOL_MAX_LIMIT = 50;

export const SECTION_DEFAULT_LIMITS: Record<string, number> = {
  hero_slider: 6,
  trending: 20,
  season: 20,
  popular: 20,
  top_rated: 20,
  upcoming: 20,
  top_10: 10
};

export const SECTION_ALIASES: Record<string, string> = {
  hero_slider: "hero_slider",
  hero: "hero_slider",
  herobanner: "hero_slider",
  banner: "hero_slider",

  trending: "trending",
  treading: "trending",
  trending_now: "trending",

  season: "season",
  popular_season: "season",
  popular_this_season: "season",

  popular: "popular",
  all_time_popular: "popular",
  "all time popular": "popular",
  alltimepopular: "popular",
  bypopularity: "popular",

  top_rated: "top_rated",
  "top rated": "top_rated",
  toprated: "top_rated",
  top: "top_rated",

  upcoming: "upcoming",
  ucoming: "upcoming",
  upcoming_releases: "upcoming",

  top_10: "top_10",
  top10: "top_10",
  rankings: "top_10",

  all: "top_rated"
};

export async function fetchAniListAnimeSection(canonicalSection: string, limit: number, clientIp?: string) {
  const { season, year } = getCurrentSeason();
  let query = "";
  let fetchCount = limit;
  if (canonicalSection === "hero_slider") {
    // Only fetch 12 candidates and resolve in small batches of 6 until 6 items are ready
    fetchCount = 12;
  } else if (canonicalSection === "top_10") {
    fetchCount = 10;
  } else {
    // Always fetch the 50-item maximum pool for trending, season, popular, top_rated, upcoming
    fetchCount = SECTION_POOL_MAX_LIMIT;
  }
  let variables: any = { perPage: fetchCount };

  if (canonicalSection === "hero_slider") {
    query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status_not: NOT_YET_RELEASED, sort: TRENDING_DESC) {
            id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage description(asHtml: false) averageScore seasonYear startDate { year } season genres format status
          }
        }
      }
    `;
  } else if (canonicalSection === "trending") {
    query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status_not: NOT_YET_RELEASED, sort: TRENDING_DESC) {
            id idMal title { romaji english native } coverImage { extraLarge large medium } averageScore format status
          }
        }
      }
    `;
  } else if (canonicalSection === "season") {
    query = `
      query ($season: MediaSeason, $seasonYear: Int, $perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status_not: NOT_YET_RELEASED, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
            id idMal title { romaji english native } coverImage { extraLarge large medium } averageScore format status
          }
        }
      }
    `;
    variables = { season, seasonYear: year, perPage: fetchCount };
  } else if (canonicalSection === "popular") {
    query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status_not: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
            id idMal title { romaji english native } coverImage { extraLarge large medium } averageScore format status
          }
        }
      }
    `;
    variables = { perPage: fetchCount };
  } else if (canonicalSection === "top_rated" || canonicalSection === "top_10") {
    query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status_not: NOT_YET_RELEASED, sort: SCORE_DESC) {
            id idMal title { romaji english native } coverImage { extraLarge large medium } averageScore format status
          }
        }
      }
    `;
  } else if (canonicalSection === "upcoming") {
    query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
            id idMal title { romaji english native } coverImage { extraLarge large medium } averageScore format status
          }
        }
      }
    `;
  }

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`AniList anime query returned status ${res.status}`);
  const json = await res.json();
  const mediaList = json.data?.Page?.media || [];

  const rawList = mediaList.map((m: any, idx: number) => ({
    anilist_id: m.id,
    mal_id: m.idMal || null,
    is_adult: false,
    title: { romaji: m.title?.romaji || null, english: m.title?.english || null, native: m.title?.native || null },
    poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
    banner: m.bannerImage || m.coverImage?.extraLarge || null,
    description: m.description || null,
    rating: formatRating(m.averageScore),
    format: normalizeFormat(m.format),
    status: normalizeStatus(m.status),
    year: m.seasonYear || m.startDate?.year || null,
    season: m.season || null,
    genres: m.genres || [],
    rank: canonicalSection === "top_10" ? idx + 1 : undefined,
  }));

  if (canonicalSection === "hero_slider") {
    const heroLimit = 6;
    const formattedItems = await resolveHeroSliderItemsFast(rawList, heroLimit);
    return {
      section: canonicalSection,
      limit: heroLimit,
      total: formattedItems.length,
      results: formattedItems
    };
  }

  const anikumeIds = await getOrCreateAnikumeIdsBatch(
    rawList.map((r: any) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id }))
  );
  for (let i = 0; i < rawList.length; i++) {
    rawList[i].anikume_id = anikumeIds[i] || "";
  }

  const emptyMap = new Map<string, any>();
  const allFormattedItems =
    canonicalSection === "top_10"
      ? await mapAndFormatAnimeTopItemsBatch(rawList, emptyMap)
      : await mapAndFormatAnimeItemsBatch(rawList, emptyMap);

  const targetLimit = canonicalSection === "top_10" ? 10 : limit;
  const slicedItems = allFormattedItems.slice(0, targetLimit);

  return {
    section: canonicalSection,
    limit: targetLimit,
    total: slicedItems.length,
    results: slicedItems,
    allResults: allFormattedItems
  };
}

export async function fetchMalAnimeSection(canonicalSection: string, limit: number, clientIp?: string) {
  const { season, year } = getCurrentSeason();
  const malSeason = season.toLowerCase();
  let rawList: any[] = [];

  if (canonicalSection === "hero_slider") {
    const heroLimit = 6;
    rawList = (await fetchMalRankingRaw("anime/ranking?ranking_type=airing", 20)).filter(
      (r: any) => normalizeStatus(r?.status) !== "UPCOMING"
    );
    const formattedItems = await resolveHeroSliderItemsFast(rawList, heroLimit);
    return {
      section: canonicalSection,
      limit: heroLimit,
      total: formattedItems.length,
      results: formattedItems
    };
  }

  const fetchLimit = canonicalSection === "top_10" ? 20 : SECTION_POOL_MAX_LIMIT;
  if (canonicalSection === "trending") {
    rawList = await fetchMalRankingRaw("anime/ranking?ranking_type=airing", fetchLimit, false, true);
  } else if (canonicalSection === "season") {
    rawList = await fetchMalRankingRaw(`anime/season/${year}/${malSeason}?sort=anime_num_list_users`, fetchLimit, false, true);
  } else if (canonicalSection === "popular") {
    rawList = await fetchMalRankingRaw("anime/ranking?ranking_type=bypopularity", fetchLimit, false, true);
  } else if (canonicalSection === "top_rated") {
    rawList = await fetchMalRankingRaw("anime/ranking?ranking_type=all", fetchLimit, false, true);
  } else if (canonicalSection === "upcoming") {
    rawList = await fetchMalRankingRaw("anime/ranking?ranking_type=upcoming", fetchLimit, false, true);
  } else if (canonicalSection === "top_10") {
    rawList = await fetchMalRankingRaw("anime/ranking?ranking_type=all", fetchLimit, true, true);
  }

  if (canonicalSection !== "upcoming") {
    rawList = rawList.filter((r: any) => normalizeStatus(r?.status) !== "UPCOMING");
  }

  const anikumeIds = await getOrCreateAnikumeIdsBatch(
    rawList.map((r: any) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id }))
  );
  for (let i = 0; i < rawList.length; i++) {
    rawList[i].anikume_id = anikumeIds[i] || "";
  }

  const emptyMap = new Map<string, any>();
  const allFormattedItems =
    canonicalSection === "top_10"
      ? await mapAndFormatAnimeTopItemsBatch(rawList, emptyMap)
      : await mapAndFormatAnimeItemsBatch(rawList, emptyMap);

  const targetLimit = canonicalSection === "top_10" ? 10 : limit;
  const slicedItems = allFormattedItems.slice(0, targetLimit);

  return {
    section: canonicalSection,
    limit: targetLimit,
    total: slicedItems.length,
    results: slicedItems,
    allResults: allFormattedItems
  };
}

export async function fetchAnimeSection(
  sectionRaw: string,
  limitRaw?: number | string,
  trackerRaw?: string,
  clientIp?: string,
  providerRaw?: string
) {
  if (!sectionRaw || typeof sectionRaw !== "string" || !sectionRaw.trim()) {
    throw {
      status: 404,
      code: "NOT_FOUND",
      message: "Not Found"
    };
  }

  const rawTrimmed = sectionRaw.toLowerCase().trim();
  const cleanSectionKey = rawTrimmed.replace(/_/g, " ");
  const canonicalSection = SECTION_ALIASES[rawTrimmed] || SECTION_ALIASES[cleanSectionKey];

  if (!canonicalSection) {
    throw {
      status: 404,
      code: "NOT_FOUND",
      message: "Not Found"
    };
  }

  const defaultLimit = SECTION_DEFAULT_LIMITS[canonicalSection] || 20;
  let parsedLimit = limitRaw !== undefined && limitRaw !== null ? parseInt(String(limitRaw), 10) : defaultLimit;
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    parsedLimit = defaultLimit;
  }
  const effectiveLimit =
    canonicalSection === "top_10"
      ? 10
      : canonicalSection === "hero_slider"
        ? 6
        : Math.min(parsedLimit, SECTION_POOL_MAX_LIMIT);

  const explicitProvider = providerRaw ? providerRaw.toLowerCase().trim() : null;
  const effectiveProvider = explicitProvider || (trackerRaw ? trackerRaw.toLowerCase().trim() : "anilist");

  if (effectiveProvider === "mal") {
    if (explicitProvider === "mal") {
      return await fetchMalAnimeSection(canonicalSection, effectiveLimit, clientIp);
    }
    try {
      return await fetchMalAnimeSection(canonicalSection, effectiveLimit, clientIp);
    } catch (malErr) {
      console.warn("MAL section fetch failed, falling back to AniList:", malErr);
      return await fetchAniListAnimeSection(canonicalSection, effectiveLimit, clientIp);
    }
  } else {
    if (explicitProvider === "anilist") {
      return await fetchAniListAnimeSection(canonicalSection, effectiveLimit, clientIp);
    }
    try {
      return await fetchAniListAnimeSection(canonicalSection, effectiveLimit, clientIp);
    } catch (aniErr) {
      console.warn("AniList section fetch failed, falling back to MAL:", aniErr);
      return await fetchMalAnimeSection(canonicalSection, effectiveLimit, clientIp);
    }
  }
}

export async function getAnimeCatalog(provider?: string, clientIp?: string) {
  const normProvider = provider ? provider.toLowerCase() : "auto";
  let catalog = null;
  if (normProvider === "anilist") {
    try {
      catalog = await fetchAniListAnimeCatalog(clientIp);
    } catch (err) {
      console.warn("AniList Anime API unavailable, providing resilient mapped MAL catalog:", err);
      catalog = await fetchMalAnimeCatalog(clientIp);
    }
  } else if (normProvider === "mal") {
    try {
      catalog = await fetchMalAnimeCatalog(clientIp);
    } catch (err) {
      console.warn("MAL Anime API unavailable, trying AniList:", err);
      catalog = await fetchAniListAnimeCatalog(clientIp);
    }
  } else {
    try {
      catalog = await fetchAniListAnimeCatalog(clientIp);
    } catch (err) {
      console.warn("AniList Anime fetch failed, falling back to MAL:", err);
    }
    if (!catalog || !catalog.trending_now || catalog.trending_now.length === 0) {
      try {
        catalog = await fetchMalAnimeCatalog(clientIp);
      } catch (err) {
        console.error("MAL Anime fetch failed:", err);
      }
    }
  }
  if (catalog) return catalog;
  throw new Error(`Failed to retrieve anime catalog from provider: ${normProvider}`);
}

async function fetchMalSearchOrBrowse(q: string | undefined, params: any, limit: number) {
  const fields = "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,rating,genres,synopsis,mean,start_season,start_date,pictures";
  let url = "";
  if (q && q.trim()) {
    url = `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(q.trim())}&limit=${limit}&nsfw=true&fields=${fields}`;
  } else if (params.season && params.year) {
    const s = params.season.toLowerCase();
    url = `https://api.myanimelist.net/v2/anime/season/${params.year}/${s}?limit=${limit}&nsfw=true&fields=${fields}`;
  } else {
    url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=all&limit=${limit}&nsfw=true&fields=${fields}`;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache"
      },
      cache: "no-store"
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data.data || [];
    return items.map((item: any) => {
      const node = item.node;
      const rawPoster = node.main_picture?.large || node.main_picture?.medium || null;
      const poster = getMalLargePoster(rawPoster);
      const year = node.start_season?.year || (node.start_date ? parseInt(node.start_date.substring(0, 4), 10) : null);
      return {
        anilist_id: null,
        mal_id: node.id,
        title: {
          romaji: node.title || null,
          english: node.alternative_titles?.en || node.title || null,
          native: node.alternative_titles?.ja || null
        },
        poster,
        banner: poster,
        description: node.synopsis || null,
        rating: formatRating(node.mean),
        status: normalizeStatus(node.status),
        format: normalizeFormat(node.media_type),
        year,
        season: node.start_season?.season ? String(node.start_season.season).toUpperCase() : null,
        genres: Array.isArray(node.genres) ? node.genres.map((g: any) => g.name) : [],
        is_adult: false
      };
    });
  } catch (e) {
    return [];
  }
}

function isTitleMatching(t1Obj: any, t2Obj: any): boolean {
  if (!t1Obj || !t2Obj) return false;
  const normalize = (str: any) => (str ? String(str).toLowerCase().replace(/[^a-z0-9]/g, "").trim() : "");

  const titles1 = [normalize(t1Obj.romaji), normalize(t1Obj.english), normalize(t1Obj.native)].filter(Boolean);
  const titles2 = [normalize(t2Obj.romaji), normalize(t2Obj.english), normalize(t2Obj.native)].filter(Boolean);

  for (const a of titles1) {
    if (a.length < 3) continue;
    for (const b of titles2) {
      if (b.length < 3) continue;
      if (a === b || a.includes(b) || b.includes(a)) {
        return true;
      }
    }
  }
  return false;
}

export async function searchAnime5(q: string, clientIp?: string) {
  const res = await browseAnime({ mode: "search", q, limit: 5 }, clientIp);
  return res.results;
}

export async function browseAnime(params: any, clientIp?: string) {
  const mode = params.mode ? String(params.mode).toLowerCase() : (params.q || params.search ? "search" : "browse");
  const isSearchMode = mode === "search";
  const requestedLimit = params.limit || params.perPage;

  // In search mode, limit is strictly 5 and cannot be changed by ?limit or ?perPage
  const targetLimit = isSearchMode
    ? 5
    : (requestedLimit && !isNaN(Number(requestedLimit)) ? Math.min(Number(requestedLimit), 50) : 20);

  const page = isSearchMode ? 1 : (params.page || 1);
  const searchQuery = params.q || params.search;

  // Step 1: Query AniList first (Do NOT fetch MAL directly; wait for AniList response first)
  let mediaList: any[] = [];
  let pageInfo: any = isSearchMode ? null : { total: 0, currentPage: page, lastPage: 1, hasNextPage: false };
  let aniListSuccess = false;

  try {
    if (isSearchMode) {
      // Fast instant search: omit pageInfo from GraphQL to avoid slow database counting on AniList
      const query = `
        query ($search: String) {
          Page(page: 1, perPage: 5) {
            media(search: $search, type: ANIME) {
              id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage averageScore format status startDate { year }
            }
          }
        }
      `;
      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
        body: JSON.stringify({ query, variables: { search: searchQuery || "" } }),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        mediaList = json.data?.Page?.media || [];
        aniListSuccess = true;
      }
    } else {
      const query = `
        query ($page: Int, $perPage: Int, $search: String, $genre: String, $format: MediaFormat, $status: MediaStatus, $season: MediaSeason, $seasonYear: Int, $sort: [MediaSort]) {
          Page(page: $page, perPage: $perPage) {
            pageInfo { total currentPage lastPage hasNextPage }
            media(search: $search, genre: $genre, format: $format, status: $status, season: $season, seasonYear: $seasonYear, sort: $sort, type: ANIME) {
              id idMal isAdult title { romaji english native } coverImage { extraLarge large medium } bannerImage averageScore format status startDate { year }
            }
          }
        }
      `;
      const variables: any = { page, perPage: targetLimit };
      if (searchQuery) variables.search = searchQuery;
      if (params.genre) variables.genre = params.genre;
      if (params.format) variables.format = params.format.toUpperCase();
      if (params.status) variables.status = params.status.toUpperCase();
      if (params.season) variables.season = params.season.toUpperCase();
      if (params.year) variables.seasonYear = parseInt(params.year, 10);
      if (params.sort) variables.sort = [params.sort.toUpperCase()];

      const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getForwardedHeaders(clientIp) },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
      });
      if (res.ok) {
        const json = await res.json();
        pageInfo = json.data?.Page?.pageInfo || pageInfo;
        mediaList = json.data?.Page?.media || [];
        aniListSuccess = true;
      }
    }
  } catch (err) {
    console.warn("AniList query failed in browseAnime:", err);
  }

  const parseAniListMedia = (m: any) => ({
    anilist_id: m.id,
    mal_id: m.idMal || null,
    title: { romaji: m.title?.romaji || null, english: m.title?.english || null, native: m.title?.native || null },
    poster: m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null,
    banner: m.bannerImage || null,
    rating: formatRating(m.averageScore),
    format: normalizeFormat(m.format),
    status: normalizeStatus(m.status),
    year: m.startDate?.year || null,
    is_adult: Boolean(m.isAdult),
  });

  const aniListRaw = mediaList.map(parseAniListMedia);

  // In search mode: keep hybrid AniList + MAL mapper deduplication
  if (isSearchMode) {
    const allAniListIds = aniListRaw.map((r) => r.anilist_id).filter(Boolean);
    const { resultMap: aniResultMap } =
      allAniListIds.length > 0 ? await getBatchAnimeMappings(allAniListIds.join(","), "anilist") : { resultMap: new Map() };

    const formattedAniListItems = await mapAndFormatAnimeItemsBatch(aniListRaw, aniResultMap);

    if (formattedAniListItems.length < targetLimit) {
      const malRawList = await fetchMalSearchOrBrowse(searchQuery, {}, targetLimit);

      if (malRawList.length > 0) {
        const allMalIds = malRawList.map((r: any) => r.mal_id).filter(Boolean);
        const { resultMap: malResultMap } =
          allMalIds.length > 0 ? await getBatchAnimeMappings(allMalIds.join(","), "mal") : { resultMap: new Map() };

        const formattedMalItems = await mapAndFormatAnimeItemsBatch(malRawList, malResultMap);

        const knownMalIds = new Set<string>();
        aniListRaw.forEach((raw) => {
          if (raw.mal_id) knownMalIds.add(String(raw.mal_id));
          const mapped = aniResultMap.get(`anilist:${raw.anilist_id}`);
          if (mapped && mapped.mal) knownMalIds.add(String(mapped.mal));
        });

        const finalItems = [...formattedAniListItems];

        for (const malItem of formattedMalItems) {
          if (finalItems.length >= targetLimit) break;

          const rawMal = malRawList.find(
            (r) => r.poster === malItem.poster || (r.title && r.title.romaji === malItem.title?.romaji)
          );
          const malId = rawMal?.mal_id;
          if (malId && knownMalIds.has(String(malId))) {
            continue;
          }

          const isDuplicateTitle = finalItems.some((existing) => isTitleMatching(existing.title, malItem.title));
          if (isDuplicateTitle) {
            continue;
          }

          finalItems.push(malItem);
        }

        return {
          mode,
          limit: targetLimit,
          total: finalItems.length,
          results: finalItems
        };
      }
    }

    return {
      mode,
      limit: targetLimit,
      total: formattedAniListItems.length,
      results: formattedAniListItems
    };
  }

  // Browse mode: use fast local batch Anikume ID resolution and fall back to MAL only if AniList failed
  if (aniListSuccess) {
    const anikumeIds = await getOrCreateAnikumeIdsBatch(
      aniListRaw.map((r: any) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id }))
    );
    for (let i = 0; i < aniListRaw.length; i++) {
      aniListRaw[i].anikume_id = anikumeIds[i] || "";
    }
    const formattedAniListItems = await mapAndFormatAnimeItemsBatch(aniListRaw, new Map());
    return {
      mode,
      pageInfo,
      limit: targetLimit,
      total: formattedAniListItems.length,
      results: formattedAniListItems
    };
  }

  // Fallback to MAL only when AniList failed / returned no response
  const malRawList = await fetchMalSearchOrBrowse(searchQuery, params, targetLimit);
  const malAnikumeIds = await getOrCreateAnikumeIdsBatch(
    malRawList.map((r: any) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id }))
  );
  for (let i = 0; i < malRawList.length; i++) {
    malRawList[i].anikume_id = malAnikumeIds[i] || "";
  }
  const formattedMalItems = await mapAndFormatAnimeItemsBatch(malRawList, new Map());
  if (pageInfo) pageInfo.total = Math.max(pageInfo.total || 0, formattedMalItems.length);

  return {
    mode,
    pageInfo,
    limit: targetLimit,
    total: formattedMalItems.length,
    results: formattedMalItems
  };
}
