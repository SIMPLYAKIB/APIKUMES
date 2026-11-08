// @ts-nocheck
import { resolveSingleAnimeMap } from "./Ids.js";
import { resolveAniDubForPrefetchedItems } from "./Dub.js";
import { resolveAniLogoForMappedItems } from "./Logo.js";
import { getForwardedHeaders } from "./Server/Episodes.js";
import { getMalLargePoster } from "./Server/Details.js";
import { formatRating, cleanDescription, normalizeStatus } from "./Server/Catalog.js";

const HERO_SLIDER_LIMIT = 6;
const HERO_POOL_SIZE = 10;
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || "";

export type HeroSliderUse = "anilist" | "mal";

export interface HeroSliderItem {
  anikume_id: string;
  title?: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  logo?: string | null;
  poster: string | null;
  banner: string | null;
  description?: string | null;
  rating?: string | null;
  status?: string | null;
  year?: number | null;
  sub?: string | null;
  dub?: string | null;
  adult: string;
}

export interface HeroSliderResponse {
  total: number;
  use: HeroSliderUse;
  results: HeroSliderItem[];
}

// No in-memory cache on HeroSlider: all requests perform a fresh fetch
export function clearHeroSliderCache() {}

export function normalizeHeroSliderUse(rawUse?: string | null): HeroSliderUse | null {
  if (!rawUse || typeof rawUse !== "string" || !rawUse.trim()) {
    return null;
  }
  const norm = rawUse.trim().toLowerCase();
  if (norm === "anilist" || norm === "a") return "anilist";
  if (norm === "mal" || norm === "myanimelist" || norm === "b") return "mal";
  return null;
}

export function buildCleanTitle(rawTitle: {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}): { romaji?: string; english?: string; native?: string } | null {
  if (!rawTitle) return null;
  const out: { romaji?: string; english?: string; native?: string } = {};
  if (rawTitle.romaji && String(rawTitle.romaji).trim()) {
    out.romaji = String(rawTitle.romaji).trim();
  }
  if (rawTitle.english && String(rawTitle.english).trim()) {
    out.english = String(rawTitle.english).trim();
  }
  if (rawTitle.native && String(rawTitle.native).trim()) {
    out.native = String(rawTitle.native).trim();
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function buildHeroSliderItem(params: {
  anikumeId: string;
  title: { romaji?: string | null; english?: string | null; native?: string | null };
  logo?: string | null;
  poster?: string | null;
  banner?: string | null;
  description?: string | null;
  rating?: string | null;
  status?: string | null;
  year?: number | null;
  sub?: string | null;
  dub?: string | null;
  adult: string;
}): HeroSliderItem {
  const item: any = {
    anikume_id: params.anikumeId || ""
  };

  const cleanTitle = buildCleanTitle(params.title);
  if (cleanTitle) {
    item.title = cleanTitle;
  }

  // Keep logo, poster, and banner as null if missing/not found
  item.logo =
    params.logo && typeof params.logo === "string" && params.logo.trim()
      ? params.logo.trim()
      : null;

  item.poster =
    params.poster && typeof params.poster === "string" && params.poster.trim()
      ? params.poster.trim()
      : null;

  item.banner =
    params.banner && typeof params.banner === "string" && params.banner.trim()
      ? params.banner.trim()
      : null;

  item.description =
    params.description && typeof params.description === "string" && params.description.trim()
      ? params.description.trim()
      : null;

  item.rating =
    params.rating && typeof params.rating === "string" && params.rating.trim()
      ? params.rating.trim()
      : null;

  item.status =
    params.status && typeof params.status === "string" && params.status.trim()
      ? params.status.trim()
      : null;

  item.year =
    typeof params.year === "number" && Number.isFinite(params.year) && params.year > 0
      ? params.year
      : null;

  item.sub =
    params.sub !== null && params.sub !== undefined && String(params.sub).trim() !== ""
      ? String(params.sub).trim()
      : null;

  item.dub =
    params.dub !== null && params.dub !== undefined && String(params.dub).trim() !== ""
      ? String(params.dub).trim()
      : null;

  item.adult = params.adult;
  return item as HeroSliderItem;
}

/**
 * Score item completeness for HeroSlider:
 * Items with nothing null (banner + logo + dub + sub) score highest (rank 100).
 * If fewer have full data, ranks by available non-null data.
 */
function getHeroCompletenessScore(item: { banner: string | null; logo: string | null; dub: any }): number {
  const hasBanner = Boolean(item.banner && item.banner.trim());
  const hasLogo = Boolean(item.logo && item.logo.trim());
  const hasSub = Boolean(item.dub?.sub && String(item.dub.sub).trim());
  const hasDub = Boolean(item.dub?.dub && String(item.dub.dub).trim());

  // If nothing is null for hero fields, give maximum priority
  if (hasBanner && hasLogo && hasSub && hasDub) {
    return 100;
  }

  let score = 0;
  if (hasBanner) score += 40;
  if (hasLogo) score += 20;
  if (hasSub) score += 10;
  if (hasDub) score += 10;
  return score;
}

/**
 * First Way (use = "anilist"):
 * 1. Fetches 10 candidate anime from AniList.
 * 2. Maps all 10 IDs via Ids.ts once.
 * 3. Runs Logo.ts + Dub.ts for all 10 candidate items together in parallel.
 * 4. Selects the first 6 that give full data (banner + logo + dub/sub), falling back to whatever has the most data.
 */
export async function fetchHeroSliderAnilist(clientIp?: string): Promise<HeroSliderItem[]> {
  const query = `
    query ($perPage: Int) {
      Page(page: 1, perPage: $perPage) {
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
      variables: { perPage: HERO_POOL_SIZE }
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`AniList hero slider HTTP ${res.status}`);
  }

  const json = await res.json();
  const mediaList = json?.data?.Page?.media;
  if (!Array.isArray(mediaList) || mediaList.length === 0) {
    throw new Error("AniList hero slider returned empty media list");
  }

  const candidates10 = mediaList
    .filter((m: any) => normalizeStatus(m?.status) !== "UPCOMING")
    .slice(0, HERO_POOL_SIZE);

  // 1. Resolve all 10 IDs via Ids.ts once
  const mapped10 = await Promise.all(
    candidates10.map((m: any) => resolveSingleAnimeMap(String(m.id), "anilist"))
  );

  const mapped10Extended = candidates10.map((m: any, idx: number) => {
    const base = mapped10[idx] || {};
    return {
      ...base,
      title: m.title,
      fallback_title: m.title?.english || m.title?.romaji || null,
      type: m.format ? String(m.format).toLowerCase() : base.type || "tv"
    };
  });

  // 2. Fetch Logo.ts and Dub.ts for ALL 10 candidate items together in parallel
  const [logoResolved, dubResolved] = await Promise.all([
    resolveAniLogoForMappedItems(mapped10Extended),
    resolveAniDubForPrefetchedItems(
      candidates10.map((m: any, idx: number) => ({
        anikume: mapped10[idx]?.anikume || null,
        anilist: mapped10[idx]?.anilist || String(m.id),
        mal: mapped10[idx]?.mal || (m.idMal ? String(m.idMal) : null),
        status: m.status || null,
        episodes: typeof m.episodes === "number" ? m.episodes : null,
        nextAiringEpisode: m.nextAiringEpisode || null
      })),
      { clientIp, skipAnilistSubRefetch: true }
    )
  ]);

  // 3. Score all 10 items to prioritize those with full data (banner + logo + dub/sub)
  const candidateEntries = candidates10.map((m: any, idx: number) => {
    const banner = m.bannerImage && typeof m.bannerImage === "string" && m.bannerImage.trim() !== "" ? m.bannerImage.trim() : null;
    const logo = logoResolved.items[idx]?.logo || null;
    const dub = dubResolved.items[idx];
    const score = getHeroCompletenessScore({ banner, logo, dub });
    return {
      m,
      mapped: mapped10[idx],
      banner,
      logo,
      dub,
      score,
      originalIndex: idx
    };
  });

  // Stable sort: highest completeness score first, preserving original trending rank among ties
  const sorted = [...candidateEntries].sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const selected6 = sorted.slice(0, HERO_SLIDER_LIMIT);

  return selected6.map(({ m, mapped, banner, logo, dub }) => {
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
      sub: dub?.sub ?? null,
      dub: dub?.dub ?? null,
      adult: m.isAdult === true ? "true" : "false"
    });
  });
}

export function extractKitsuTinyCover(coverImg: any): string | null {
  if (!coverImg || typeof coverImg !== "object") return null;
  return coverImg.tiny || coverImg.small || coverImg.large || coverImg.original || null;
}

/**
 * Directly fetches https://kitsu.io/api/edge/anime/{kitsuId} using the Kitsu ID resolved from Ids.ts.
 */
export async function fetchKitsuBannerByKitsuId(kitsuId: string | number | null): Promise<string | null> {
  if (!kitsuId) return null;
  const kitsuIdStr = String(kitsuId).trim();
  if (!kitsuIdStr) return null;

  try {
    const directRes = await fetch(`https://kitsu.io/api/edge/anime/${encodeURIComponent(kitsuIdStr)}`, {
      headers: {
        Accept: "application/vnd.api+json"
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    });
    if (!directRes.ok) return null;
    const directJson = await directRes.json();
    const coverImg = directJson?.data?.attributes?.coverImage;
    return extractKitsuTinyCover(coverImg);
  } catch {
    return null;
  }
}

function isMalAdult(node: any): boolean {
  if (!node) return false;
  const nsfw = String(node.nsfw || "").trim().toLowerCase();
  if (nsfw === "black") return true;
  const rating = String(node.rating || "").trim().toLowerCase();
  if (rating === "rx" || rating.startsWith("rx")) return true;
  return false;
}

/**
 * Second Way (use = "mal"):
 * 1. Fetches 10 airing anime from MyAnimeList v2 API.
 * 2. Maps all 10 IDs via Ids.ts once.
 * 3. Fetches Kitsu banners + Dub.ts + Logo.ts ALL TOGETHER for all 10 items simultaneously in parallel.
 * 4. Takes the first 6 which give full data (banner + logo + dub/sub), falling back to whatever has the most data.
 */
export async function fetchHeroSliderMal(clientIp?: string): Promise<HeroSliderItem[]> {
  const url = `https://api.myanimelist.net/v2/anime/ranking?ranking_type=airing&limit=${HERO_POOL_SIZE + 10}&nsfw=true&fields=id,title,main_picture,alternative_titles,status,synopsis,mean,start_season,start_date,num_episodes,nsfw,rating`;

  const res = await fetch(url, {
    headers: {
      "X-MAL-CLIENT-ID": MAL_CLIENT_ID,
      Accept: "application/json"
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });

  if (!res.ok) {
    throw new Error(`MAL hero slider HTTP ${res.status}`);
  }

  const json = await res.json();
  const rawList = Array.isArray(json?.data) ? json.data : [];
  if (rawList.length === 0) {
    throw new Error("MAL hero slider returned empty list");
  }

  const allNodes10 = rawList
    .map((entry: any) => entry.node || entry)
    .filter((n: any) => n && normalizeStatus(n.status) !== "UPCOMING")
    .slice(0, HERO_POOL_SIZE);

  // 1. Resolve all 10 IDs via Ids.ts at once
  const allMapped10 = await Promise.all(
    allNodes10.map((n: any) => resolveSingleAnimeMap(String(n.id), "mal"))
  );

  // 2. Fetch Kitsu banners, Dub.ts, and Logo.ts ALL TOGETHER for all 10 items simultaneously in parallel
  const [allBanners, logoResolved, dubResolved] = await Promise.all([
    Promise.all(allMapped10.map((m: any) => fetchKitsuBannerByKitsuId(m?.kitsu || null))),
    resolveAniLogoForMappedItems(allMapped10),
    resolveAniDubForPrefetchedItems(
      allNodes10.map((n: any, idx: number) => ({
        anikume: allMapped10[idx]?.anikume || null,
        anilist: allMapped10[idx]?.anilist || null,
        mal: allMapped10[idx]?.mal || String(n.id),
        status: normalizeStatus(n.status),
        episodes:
          typeof n.num_episodes === "number" && n.num_episodes > 0
            ? n.num_episodes
            : null,
        nextAiringEpisode: null
      })),
      { clientIp }
    )
  ]);

  // 3. Score all 10 items: items with full data (banner + logo + dub/sub) score highest
  const candidateEntries = allNodes10.map((node: any, idx: number) => {
    const rawBanner = allBanners[idx];
    const banner = rawBanner && typeof rawBanner === "string" && rawBanner.trim() !== "" ? rawBanner.trim() : null;
    const logo = logoResolved.items[idx]?.logo || null;
    const dub = dubResolved.items[idx];
    const score = getHeroCompletenessScore({ banner, logo, dub });
    return {
      node,
      mapped: allMapped10[idx],
      banner,
      logo,
      dub,
      score,
      originalIndex: idx
    };
  });

  // Pick first 6 with full data (banner + logo + dub), falling back to highest available completeness
  const sorted = [...candidateEntries].sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  const selected6 = sorted.slice(0, HERO_SLIDER_LIMIT);

  return selected6.map(({ node: n, mapped, banner, logo, dub }) => {
    const poster = getMalLargePoster(n.main_picture?.large || n.main_picture?.medium || null);
    const year =
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
      year,
      sub: dub?.sub ?? null,
      dub: dub?.dub ?? null,
      adult: isMalAdult(n) ? "true" : "false"
    });
  });
}

export async function getHeroSlider(options?: {
  use?: string | null;
  fresh?: boolean;
  clientIp?: string;
}): Promise<{ response: HeroSliderResponse; cacheHit: boolean }> {
  const requestedUse = normalizeHeroSliderUse(options?.use);

  let actualUse: HeroSliderUse = "anilist";
  let results: HeroSliderItem[] = [];

  if (requestedUse === "anilist") {
    actualUse = "anilist";
    results = await fetchHeroSliderAnilist(options?.clientIp);
  } else if (requestedUse === "mal") {
    actualUse = "mal";
    results = await fetchHeroSliderMal(options?.clientIp);
  } else {
    try {
      actualUse = "anilist";
      results = await fetchHeroSliderAnilist(options?.clientIp);
    } catch (anilistErr) {
      console.warn("[HeroSlider] AniList primary way failed, falling back to MAL + Kitsu banner:", anilistErr);
      actualUse = "mal";
      results = await fetchHeroSliderMal(options?.clientIp);
    }
  }

  const response: HeroSliderResponse = {
    total: results.length,
    use: actualUse,
    results
  };

  return { response, cacheHit: false };
}
