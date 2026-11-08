// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { resolveAniDubForPrefetchedItems } from "./Dub.js";
import { resolveAniLogoForMappedItems } from "./Logo.js";
import {
  buildHeroSliderItem,
  buildCleanTitle,
  fetchKitsuBannerByKitsuId,
  type HeroSliderItem,
  type HeroSliderResponse
} from "./HeroSlider.js";
import { getForwardedHeaders } from "./Server/Episodes.js";
import { getMalLargePoster } from "./Server/Details.js";
import { formatRating, cleanDescription, normalizeFormat, normalizeStatus } from "./Server/Catalog.js";

const HERO_POOL_LIMIT = 10;
const HERO_OUTPUT_LIMIT = 6;
const TRENDING_LIMIT = 20;
const THIS_SEASON_LIMIT = 15;
const POPULAR_LIMIT = 15;
const TOP_10_LIMIT = 10;
const UPCOMING_LIMIT = 20;
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export type AnimeUse = "anilist" | "mal";

export interface SectionCardItem {
  anikume_id: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string | null;
  rating?: string;
  format?: string;
  status?: string;
  sub?: string;
  dub?: string;
  adult: string;
}

export interface UpcomingCardItem {
  anikume_id: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  poster: string | null;
  format?: string;
  status?: string;
  adult: string;
}

export interface AnimeSectionBlock<T> {
  total: number;
  use: AnimeUse;
  results: T[];
}

export interface CombinedAnimeResponse {
  heroslider: HeroSliderResponse;
  trendingnow: AnimeSectionBlock<SectionCardItem>;
  thisseason: AnimeSectionBlock<SectionCardItem>;
  popular: AnimeSectionBlock<SectionCardItem>;
  top10: AnimeSectionBlock<SectionCardItem>;
  upcoming: AnimeSectionBlock<UpcomingCardItem>;
}

export function normalizeAnimeUse(rawUse?: string | null): AnimeUse | null {
  if (!rawUse || typeof rawUse !== "string" || !rawUse.trim()) {
    return null;
  }
  const norm = rawUse.trim().toLowerCase();
  if (norm === "anilist" || norm === "a") return "anilist";
  if (norm === "mal" || norm === "myanimelist" || norm === "b") return "mal";
  return null;
}

function getCurrentSeasonInfo() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let season = "WINTER";
  if (month >= 4 && month <= 6) season = "SPRING";
  else if (month >= 7 && month <= 9) season = "SUMMER";
  else if (month >= 10 && month <= 12) season = "FALL";
  return { season, year };
}

function isMalAdult(node: any): boolean {
  if (!node) return false;
  const nsfw = String(node.nsfw || "").trim().toLowerCase();
  if (nsfw === "black") return true;
  const rating = String(node.rating || "").trim().toLowerCase();
  if (rating === "rx" || rating.startsWith("rx")) return true;
  return false;
}

export function buildCleanCardItem(params: {
  anikumeId: string;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  poster?: string | null;
  rating?: string | null;
  format?: string | null;
  status?: string | null;
  sub?: string | null;
  dub?: string | null;
  adult: string;
  isUpcoming?: boolean;
}): any {
  const item: any = {
    anikume_id: params.anikumeId || ""
  };

  const cleanTitle = buildCleanTitle(params.title);
  if (cleanTitle) {
    item.title = cleanTitle;
  }

  item.poster =
    params.poster && typeof params.poster === "string" && params.poster.trim()
      ? params.poster.trim()
      : null;

  if (params.isUpcoming) {
    // In Upcoming: completely omit rating, sub, and dub fields
    if (params.format && typeof params.format === "string" && params.format.trim()) {
      item.format = params.format.trim();
    }
    if (params.status && typeof params.status === "string" && params.status.trim()) {
      item.status = params.status.trim();
    }
  } else {
    // Regular sections: keep fields as null if missing so keys are preserved
    item.rating =
      params.rating && typeof params.rating === "string" && params.rating.trim()
        ? params.rating.trim()
        : null;

    item.format =
      params.format && typeof params.format === "string" && params.format.trim()
        ? params.format.trim()
        : null;

    item.status =
      params.status && typeof params.status === "string" && params.status.trim()
        ? params.status.trim()
        : null;

    item.sub =
      params.sub !== null && params.sub !== undefined && String(params.sub).trim() !== ""
        ? String(params.sub).trim()
        : null;

    item.dub =
      params.dub !== null && params.dub !== undefined && String(params.dub).trim() !== ""
        ? String(params.dub).trim()
        : null;
  }

  item.adult = params.adult;
  return item;
}

/**
 * First Way (use = "anilist"):
 * 1. Sends ONE single GraphQL request to AniList that fetches all sections simultaneously:
 *    - trending (20 items; top 10 also serve as heroslider candidates)
 *    - thisSeason (15 items)
 *    - popular (15 items)
 *    - top10 (10 items)
 *    - upcoming (20 items)
 * 2. Collects all unique AniList IDs across all sections (ignoring duplicates) and resolves them ONCE via Ids.ts.
 * 3. Selects 6 HeroSlider anime from the top 10 trending items (preferring ones with bannerImage).
 * 4. Combines all unique anime needing sub/dub across heroslider, trendingnow, thisseason, popular, and top10
 *    into ONE single call to Dub.ts (which chunks by 50 for anidub.moe if > 50) in parallel with Logo.ts for the 6 HeroSlider items.
 */
export async function fetchAllAnimeAnilist(clientIp?: string): Promise<CombinedAnimeResponse> {
  const { season, year } = getCurrentSeasonInfo();

  const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      trending: Page(page: 1, perPage: ${TRENDING_LIMIT}) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: TRENDING_DESC) {
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
          bannerImage
          description(asHtml: false)
          averageScore
          format
          status
          seasonYear
          startDate {
            year
          }
        }
      }
      thisSeason: Page(page: 1, perPage: ${THIS_SEASON_LIMIT}) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
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
      popular: Page(page: 1, perPage: ${POPULAR_LIMIT}) {
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
      top10: Page(page: 1, perPage: ${TOP_10_LIMIT}) {
        media(type: ANIME, status_not: NOT_YET_RELEASED, sort: SCORE_DESC) {
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
      upcoming: Page(page: 1, perPage: ${UPCOMING_LIMIT}) {
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
      variables: { season, seasonYear: year }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000)
  });

  if (!res.ok) {
    throw new Error(`AniList combined anime HTTP ${res.status}`);
  }

  const json = await res.json();
  const data = json?.data;
  const isReleased = (m: any) => normalizeStatus(m?.status) !== "UPCOMING";
  const trendingList = Array.isArray(data?.trending?.media)
    ? data.trending.media.filter(isReleased).slice(0, TRENDING_LIMIT)
    : [];
  const thisSeasonList = Array.isArray(data?.thisSeason?.media)
    ? data.thisSeason.media.filter(isReleased).slice(0, THIS_SEASON_LIMIT)
    : [];
  const popularList = Array.isArray(data?.popular?.media)
    ? data.popular.media.filter(isReleased).slice(0, POPULAR_LIMIT)
    : [];
  const top10List = Array.isArray(data?.top10?.media)
    ? data.top10.media.filter(isReleased).slice(0, TOP_10_LIMIT)
    : [];
  const upcomingList = Array.isArray(data?.upcoming?.media)
    ? data.upcoming.media.slice(0, UPCOMING_LIMIT)
    : [];

  if (trendingList.length === 0) {
    throw new Error("AniList combined anime returned empty trending list");
  }

  // HeroSlider candidates are the first 10 of trending
  const heroCandidates10 = trendingList.slice(0, HERO_POOL_LIMIT);

  // Step 2: Deduplicate all AniList IDs across all sections so Ids.ts is called ONCE per unique anime
  const uniqueAnilistIds = new Set<string>();
  for (const list of [heroCandidates10, trendingList, thisSeasonList, popularList, top10List, upcomingList]) {
    for (const m of list) {
      if (m?.id) uniqueAnilistIds.add(String(m.id));
    }
  }

  const uniqueIdArray = Array.from(uniqueAnilistIds);
  const mappedResults = await Promise.all(
    uniqueIdArray.map((id) => resolveSingleAnimeMap(id, "anilist"))
  );
  const mappedByAnilistId = new Map<string, any>();
  for (let i = 0; i < uniqueIdArray.length; i++) {
    mappedByAnilistId.set(uniqueIdArray[i], mappedResults[i]);
  }

  // Step 3: Build ONE deduplicated list of items for Dub.ts across ALL unique anime (including all 10 hero candidates)
  const dubInputByAnilistId = new Map<string, any>();
  for (const list of [heroCandidates10, trendingList, thisSeasonList, popularList, top10List]) {
    for (const m of list) {
      const idStr = String(m?.id || "");
      if (!idStr || dubInputByAnilistId.has(idStr)) continue;
      const mapped = mappedByAnilistId.get(idStr);
      dubInputByAnilistId.set(idStr, {
        anikume: mapped?.anikume || null,
        anilist: mapped?.anilist || idStr,
        mal: mapped?.mal || (m.idMal ? String(m.idMal) : null),
        status: m.status || null,
        episodes: typeof m.episodes === "number" ? m.episodes : null,
        nextAiringEpisode: m.nextAiringEpisode || null
      });
    }
  }

  const dubKeys = Array.from(dubInputByAnilistId.keys());
  const dubInputs = dubKeys.map((k) => dubInputByAnilistId.get(k));

  // Extended mapping for all 10 hero candidates to pass to Logo.ts
  const hero10Mapped = heroCandidates10.map((m: any) => {
    const baseMapped = mappedByAnilistId.get(String(m.id)) || {};
    return {
      ...baseMapped,
      title: m.title,
      fallback_title: m.title?.english || m.title?.romaji || null,
      type: m.format ? String(m.format).toLowerCase() : baseMapped.type || "tv"
    };
  });

  // Step 4: Run Logo.ts (on all 10 hero candidates) and Dub.ts (on all unique items) simultaneously
  const [logoResolved, dubResolved] = await Promise.all([
    resolveAniLogoForMappedItems(hero10Mapped),
    resolveAniDubForPrefetchedItems(dubInputs, { clientIp, skipAnilistSubRefetch: true })
  ]);

  const dubByAnilistId = new Map<string, { sub: string | null; dub: string | null }>();
  for (let i = 0; i < dubKeys.length; i++) {
    dubByAnilistId.set(dubKeys[i], {
      sub: dubResolved.items[i]?.sub ?? null,
      dub: dubResolved.items[i]?.dub ?? null
    });
  }

  // Step 5: Score all 10 hero candidates and pick the first 6 with full data (banner + logo + dub/sub)
  const heroScoredEntries = heroCandidates10.map((m: any, idx: number) => {
    const idStr = String(m.id);
    const banner = m?.bannerImage && typeof m.bannerImage === "string" && m.bannerImage.trim() !== "" ? m.bannerImage.trim() : null;
    const logo = logoResolved.items[idx]?.logo || null;
    const dubInfo = dubByAnilistId.get(idStr);
    let score = 0;
    if (banner) score += 4;
    if (logo) score += 2;
    if (dubInfo?.sub || dubInfo?.dub) score += 1;
    return { m, banner, logo, dubInfo, score, originalIndex: idx };
  });

  const heroSorted = [...heroScoredEntries].sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const heroSelected6 = heroSorted.slice(0, HERO_OUTPUT_LIMIT);

  // Step 6: Format HeroSlider from the 6 selected items
  const heroResults: HeroSliderItem[] = heroSelected6.map(({ m, banner, logo, dubInfo }) => {
    const idStr = String(m.id);
    const mapped = mappedByAnilistId.get(idStr);
    const poster = m.coverImage?.extraLarge || m.coverImage?.large || m.coverImage?.medium || null;

    return buildHeroSliderItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null
      },
      logo,
      poster,
      banner,
      description: cleanDescription(m.description),
      rating: formatRating(m.averageScore),
      status: normalizeStatus(m.status),
      year: m.seasonYear || m.startDate?.year || null,
      sub: dubInfo?.sub ?? null,
      dub: dubInfo?.dub ?? null,
      adult: m.isAdult === true ? "true" : "false"
    });
  });

  const formatStandardSection = (list: any[]): SectionCardItem[] =>
    list.map((m: any) => {
      const idStr = String(m.id);
      const mapped = mappedByAnilistId.get(idStr);
      const dubInfo = dubByAnilistId.get(idStr);
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
        sub: dubInfo?.sub ?? null,
        dub: dubInfo?.dub ?? null,
        adult: m.isAdult === true ? "true" : "false"
      });
    });

  const upcomingResults: UpcomingCardItem[] = upcomingList.map((m: any) => {
    const idStr = String(m.id);
    const mapped = mappedByAnilistId.get(idStr);
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

  const trendingResults = formatStandardSection(trendingList);
  const thisSeasonResults = formatStandardSection(thisSeasonList);
  const popularResults = formatStandardSection(popularList);
  const top10Results = formatStandardSection(top10List);

  return {
    heroslider: {
      total: heroResults.length,
      use: "anilist",
      results: heroResults
    },
    trendingnow: {
      total: trendingResults.length,
      use: "anilist",
      results: trendingResults
    },
    thisseason: {
      total: thisSeasonResults.length,
      use: "anilist",
      results: thisSeasonResults
    },
    popular: {
      total: popularResults.length,
      use: "anilist",
      results: popularResults
    },
    top10: {
      total: top10Results.length,
      use: "anilist",
      results: top10Results
    },
    upcoming: {
      total: upcomingResults.length,
      use: "anilist",
      results: upcomingResults
    }
  };
}

/**
 * Second Way (use = "mal"):
 * 1. Fetches all MAL section endpoints simultaneously in parallel.
 * 2. Collects all unique MAL IDs across all sections (ignoring duplicates) and resolves them ONCE via Ids.ts.
 * 3. Fetches all 10 Kitsu banners at once in parallel for the first 10 airing anime, and waits until 6 with banners are selected.
 * 4. Runs ONE combined Dub.ts call (for all unique anime across heroslider, trendingnow, thisseason, popular, and top10)
 *    simultaneously with Logo.ts (for the 6 HeroSlider anime).
 */
export async function fetchAllAnimeMal(clientIp?: string): Promise<CombinedAnimeResponse> {
  const { season, year } = getCurrentSeasonInfo();
  const malSeason = season.toLowerCase();

  const headers = {
    "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
    Accept: "application/json",
    ...getForwardedHeaders(clientIp)
  };

  const fetchMalJson = async (url: string) => {
    const res = await fetch(url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) {
      throw new Error(`MAL HTTP ${res.status} for ${url}`);
    }
    const json = await res.json();
    const rawList = Array.isArray(json?.data) ? json.data : [];
    return rawList.map((entry: any) => entry.node || entry).filter(Boolean);
  };

  // Step 1: Fetch all MAL sections simultaneously (requesting extra items for non-upcoming sections to filter out unreleased anime)
  const [airingNodes, thisSeasonNodes, popularNodes, top10Nodes, upcomingNodes] = await Promise.all([
    fetchMalJson(
      `https://api.myanimelist.net/v2/anime/ranking?ranking_type=airing&limit=${TRENDING_LIMIT + 15}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,synopsis,media_type,mean,start_season,start_date,num_episodes,nsfw,rating`
    ),
    fetchMalJson(
      `https://api.myanimelist.net/v2/anime/season/${year}/${malSeason}?sort=anime_num_list_users&limit=${THIS_SEASON_LIMIT + 25}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,mean,num_episodes,nsfw,rating`
    ),
    fetchMalJson(
      `https://api.myanimelist.net/v2/anime/ranking?ranking_type=bypopularity&limit=${POPULAR_LIMIT + 15}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,mean,num_episodes,nsfw,rating`
    ),
    fetchMalJson(
      `https://api.myanimelist.net/v2/anime/ranking?ranking_type=all&limit=${TOP_10_LIMIT + 15}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,mean,num_episodes,nsfw,rating`
    ),
    fetchMalJson(
      `https://api.myanimelist.net/v2/anime/ranking?ranking_type=upcoming&limit=${UPCOMING_LIMIT}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,media_type,nsfw,rating`
    )
  ]);

  const isMalReleased = (n: any) => n && normalizeStatus(n.status) !== "UPCOMING";
  const trendingList = airingNodes.filter(isMalReleased).slice(0, TRENDING_LIMIT);
  const heroCandidates10 = trendingList.slice(0, HERO_POOL_LIMIT);
  const thisSeasonList = thisSeasonNodes.filter(isMalReleased).slice(0, THIS_SEASON_LIMIT);
  const popularList = popularNodes.filter(isMalReleased).slice(0, POPULAR_LIMIT);
  const top10List = top10Nodes.filter(isMalReleased).slice(0, TOP_10_LIMIT);
  const upcomingList = upcomingNodes.slice(0, UPCOMING_LIMIT);

  // Step 2: Deduplicate all MAL IDs across all sections and resolve via Ids.ts ONCE
  const uniqueMalIds = new Set<string>();
  for (const list of [heroCandidates10, trendingList, thisSeasonList, popularList, top10List, upcomingList]) {
    for (const n of list) {
      if (n?.id) uniqueMalIds.add(String(n.id));
    }
  }

  const uniqueMalIdArray = Array.from(uniqueMalIds);
  const mappedResults = await Promise.all(
    uniqueMalIdArray.map((id) => resolveSingleAnimeMap(id, "mal"))
  );
  const mappedByMalId = new Map<string, any>();
  for (let i = 0; i < uniqueMalIdArray.length; i++) {
    mappedByMalId.set(uniqueMalIdArray[i], mappedResults[i]);
  }

  // Step 3: Fetch all 10 Kitsu banners, Dub.ts for all unique anime, and Logo.ts for all 10 candidates simultaneously
  const dubInputByMalId = new Map<string, any>();
  for (const list of [heroCandidates10, trendingList, thisSeasonList, popularList, top10List]) {
    for (const n of list) {
      const idStr = String(n?.id || "");
      if (!idStr || dubInputByMalId.has(idStr)) continue;
      const mapped = mappedByMalId.get(idStr);
      dubInputByMalId.set(idStr, {
        anikume: mapped?.anikume || null,
        anilist: mapped?.anilist || null,
        mal: mapped?.mal || idStr,
        status: normalizeStatus(n.status),
        episodes: typeof n.num_episodes === "number" && n.num_episodes > 0 ? n.num_episodes : null,
        nextAiringEpisode: null
      });
    }
  }

  const dubMalKeys = Array.from(dubInputByMalId.keys());
  const dubInputs = dubMalKeys.map((k) => dubInputByMalId.get(k));
  const hero10Mapped = heroCandidates10.map((n: any) => {
    const baseMapped = mappedByMalId.get(String(n.id)) || {};
    return {
      ...baseMapped,
      title: n.title,
      fallback_title: n.alternative_titles?.en || n.title || null,
      type: n.media_type ? String(n.media_type).toLowerCase() : baseMapped.type || "tv"
    };
  });

  const [all10Banners, logoResolved, dubResolved] = await Promise.all([
    Promise.all(heroCandidates10.map((n: any) => {
      const mapped = mappedByMalId.get(String(n.id));
      return fetchKitsuBannerByKitsuId(mapped?.kitsu || null);
    })),
    resolveAniLogoForMappedItems(hero10Mapped),
    resolveAniDubForPrefetchedItems(dubInputs, { clientIp })
  ]);

  const dubByMalId = new Map<string, { sub: string | null; dub: string | null }>();
  for (let i = 0; i < dubMalKeys.length; i++) {
    dubByMalId.set(dubMalKeys[i], {
      sub: dubResolved.items[i]?.sub ?? null,
      dub: dubResolved.items[i]?.dub ?? null
    });
  }

  // Step 4: Score all 10 hero candidates and pick the first 6 with full data (banner + logo + dub/sub)
  const candidateEntries = heroCandidates10.map((n: any, idx: number) => {
    const idStr = String(n.id);
    const rawBanner = all10Banners[idx];
    const banner = rawBanner && typeof rawBanner === "string" && rawBanner.trim() !== "" ? rawBanner.trim() : null;
    const logo = logoResolved.items[idx]?.logo || null;
    const dubInfo = dubByMalId.get(idStr);
    let score = 0;
    if (banner) score += 4;
    if (logo) score += 2;
    if (dubInfo?.sub || dubInfo?.dub) score += 1;
    return {
      node: n,
      mapped: mappedByMalId.get(idStr),
      banner,
      logo,
      dubInfo,
      score,
      originalIndex: idx
    };
  });

  // Pick first 6 with full data (banner + logo + dub/sub), falling back to highest available completeness
  const sorted = [...candidateEntries].sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const heroSelected6 = sorted.slice(0, HERO_OUTPUT_LIMIT);

  // Step 5: Format each section
  const heroResults: HeroSliderItem[] = heroSelected6.map(({ node: n, mapped, banner, logo, dubInfo }) => {
    const poster = getMalLargePoster(n.main_picture?.large || n.main_picture?.medium || null);
    const yr =
      n.start_season?.year ||
      (n.start_date ? parseInt(String(n.start_date).slice(0, 4), 10) || null : null);

    return buildHeroSliderItem({
      anikumeId: mapped?.anikume || "",
      title: {
        romaji: n.title || null,
        english: n.alternative_titles?.en || null,
        native: n.alternative_titles?.ja || null
      },
      logo,
      poster,
      banner,
      description: cleanDescription(n.synopsis),
      rating: formatRating(n.mean),
      status: normalizeStatus(n.status),
      year: yr,
      sub: dubInfo?.sub ?? null,
      dub: dubInfo?.dub ?? null,
      adult: isMalAdult(n) ? "true" : "false"
    });
  });

  const formatStandardSection = (list: any[]): SectionCardItem[] =>
    list.map((n: any) => {
      const idStr = String(n.id);
      const mapped = mappedByMalId.get(idStr);
      const dubInfo = dubByMalId.get(idStr);
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
        sub: dubInfo?.sub ?? null,
        dub: dubInfo?.dub ?? null,
        adult: isMalAdult(n) ? "true" : "false"
      });
    });

  const upcomingResults: UpcomingCardItem[] = upcomingList.map((n: any) => {
    const idStr = String(n.id);
    const mapped = mappedByMalId.get(idStr);
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

  const trendingResults = formatStandardSection(trendingList);
  const thisSeasonResults = formatStandardSection(thisSeasonList);
  const popularResults = formatStandardSection(popularList);
  const top10Results = formatStandardSection(top10List);

  return {
    heroslider: {
      total: heroResults.length,
      use: "mal",
      results: heroResults
    },
    trendingnow: {
      total: trendingResults.length,
      use: "mal",
      results: trendingResults
    },
    thisseason: {
      total: thisSeasonResults.length,
      use: "mal",
      results: thisSeasonResults
    },
    popular: {
      total: popularResults.length,
      use: "mal",
      results: popularResults
    },
    top10: {
      total: top10Results.length,
      use: "mal",
      results: top10Results
    },
    upcoming: {
      total: upcomingResults.length,
      use: "mal",
      results: upcomingResults
    }
  };
}

const inFlightAnimeByUse = new Map<string, Promise<CombinedAnimeResponse>>();

export async function getAllAnime(options?: {
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: CombinedAnimeResponse; cacheHit: boolean }> {
  const requestedUse = normalizeAnimeUse(options?.use);
  const flightKey = `${requestedUse || "auto"}:${options?.clientIp || "anon"}`;

  let activePromise = inFlightAnimeByUse.get(flightKey);
  if (!activePromise) {
    activePromise = (async () => {
      try {
        if (requestedUse === "anilist") {
          return await fetchAllAnimeAnilist(options?.clientIp);
        } else if (requestedUse === "mal") {
          return await fetchAllAnimeMal(options?.clientIp);
        } else {
          try {
            return await fetchAllAnimeAnilist(options?.clientIp);
          } catch (anilistErr) {
            console.warn("[Anime] AniList combined fetch failed, falling back to MAL:", anilistErr);
            return await fetchAllAnimeMal(options?.clientIp);
          }
        }
      } finally {
        inFlightAnimeByUse.delete(flightKey);
      }
    })();
    inFlightAnimeByUse.set(flightKey, activePromise);
  }

  const response = await activePromise;
  return { response, cacheHit: false };
}
